import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Face } from './face';
import type { Mood } from './stateMachine';

/** Named parts the procedural animation drives. The Blender model uses the same object names
 *  (Body, Screen, ArmL, ArmR, LegL, LegR) with pivots at the shoulders and hips. */
export interface RobotParts {
  root: THREE.Group;
  body: THREE.Object3D;
  armL?: THREE.Object3D;
  armR?: THREE.Object3D;
  legL?: THREE.Object3D;
  legR?: THREE.Object3D;
  /** The model's own root node (animated by the Hop/Cheer clips). */
  rigRoot?: THREE.Object3D;
  /** Props in the left hand (children of armL), hidden until a mood needs them. */
  notepad?: THREE.Object3D;
  mug?: THREE.Object3D;
  /** Hammer in the left hand; unlike the other props it turns with the arm. */
  hammer?: THREE.Object3D;
  meshes: THREE.Object3D[];
  /** Blender animation clips, already cut apart by name (empty for the placeholder robot). */
  clips: Map<ClipName, THREE.AnimationClip>;
  /** Object the AnimationMixer binds to. */
  animRoot: THREE.Object3D;
}

/** Clip frame ranges on the Blender timeline (24 fps). Must match CLIPS in blender/build_robot.py. */
export const CLIPS = { Hop: [1, 17], Wave: [24, 48], Cheer: [56, 76] } as const;
export type ClipName = keyof typeof CLIPS;
const CLIP_FPS = 24;

/** Thinking: right arm rotation (radians, on top of rest) that brings the hand to the chin. */
const THINK_ARM = { z: 1.95, y: -1.05 };
/** Hammering: left arm angle out to the side at the strike and at the top of the lift, and hits per second. */
const HAMMER_LOW = 1.2;
const HAMMER_HIGH = 2.0;
const HAMMER_HZ = 1.6;

export const CLAUDE_ORANGE = 0xd97757;
const INK = 0x2b211c;
/** Overall size of Rusty on screen (1 = the original size). Walking speeds in renderer.ts scale with it. */
export const ROBOT_SCALE = 0.765;
/** Extra horizontal squash on screen (height unchanged). Applied by a wrapper in renderer.ts so it stays
 * a screen-width squash even when Rusty turns to walk. */
export const WIDTH_SQUASH = 0.95;
const TARGET_HEIGHT = 1.4 * ROBOT_SCALE;
/** Rest-pose width including arms; leaves room in the window for a raised arm. */
const TARGET_WIDTH = 1.6 * ROBOT_SCALE;

export async function loadRobot(face: Face): Promise<RobotParts> {
  const data = await window.companion.loadModel();
  if (data) {
    try {
      return await fromGltf(data, face);
    } catch (err) {
      console.error('Failed to load robot.glb, using placeholder', err);
    }
  }
  return placeholder(face);
}

async function fromGltf(data: Uint8Array, face: Face): Promise<RobotParts> {
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  const model = gltf.scene;
  // Parts may carry a variant prefix (e.g. "A_Body"); glTF may also replace dots with underscores.
  const find = (n: string): THREE.Object3D | undefined => {
    let hit: THREE.Object3D | undefined;
    const re = new RegExp(`(^|_)${n}$`);
    model.traverse((o) => {
      if (!hit && re.test(o.name)) hit = o;
    });
    return hit;
  };

  const screen = find('Screen');
  if (screen && (screen as THREE.Mesh).isMesh) {
    // glTF UVs have their origin at the top-left, so the canvas must not be flipped.
    face.texture.flipY = false;
    face.texture.needsUpdate = true;
    (screen as THREE.Mesh).material = new THREE.MeshBasicMaterial({ map: face.texture });
  }

  // Flat cartoon look: render every other material unlit, using its base colour as-is.
  // (Shading is baked into the model's colours: darker sides, lighter top.)
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || o === screen) return;
    const toBasic = (m: THREE.Material) =>
      new THREE.MeshBasicMaterial({ color: (m as THREE.MeshStandardMaterial).color ?? 0xffffff });
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toBasic) : toBasic(mesh.material);
  });

  const root = new THREE.Group();
  root.add(model);
  normalize(model);

  const meshes: THREE.Object3D[] = [];
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o);
  });

  // The model carries one animation with every clip on a single timeline; cut it into named clips.
  const clips = new Map<ClipName, THREE.AnimationClip>();
  const all = gltf.animations[0];
  if (all) {
    for (const [name, [start, end]] of Object.entries(CLIPS) as [ClipName, readonly [number, number]][]) {
      clips.set(name, THREE.AnimationUtils.subclip(all, name, start, end, CLIP_FPS));
    }
  }

  const notepad = find('Notepad');
  const mug = find('Mug');
  const hammer = find('Hammer');
  for (const prop of [notepad, mug, hammer]) if (prop) prop.visible = false;

  return {
    root,
    body: find('Body') ?? model,
    armL: find('ArmL'),
    armR: find('ArmR'),
    legL: find('LegL'),
    legR: find('LegR'),
    rigRoot: find('Root'),
    notepad,
    mug,
    hammer,
    // Hidden props must not catch clicks.
    meshes: meshes.filter((m) => !isInside(m, notepad) && !isInside(m, mug) && !isInside(m, hammer)),
    clips,
    animRoot: model,
  };
}

function isInside(o: THREE.Object3D, ancestor: THREE.Object3D | undefined): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === ancestor) return true;
  return false;
}

/** Plays the Blender clips one at a time. While a clip plays, the procedural posing is paused. */
export class ClipPlayer {
  private mixer: THREE.AnimationMixer;
  private current: THREE.AnimationAction | null = null;

  constructor(private parts: RobotParts) {
    this.mixer = new THREE.AnimationMixer(parts.animRoot);
    this.mixer.addEventListener('finished', () => {
      this.current?.stop();
      this.current = null;
    });
  }

  has(name: ClipName): boolean {
    return this.parts.clips.has(name);
  }

  get playing(): boolean {
    return this.current !== null;
  }

  play(name: ClipName): boolean {
    const clip = this.parts.clips.get(name);
    if (!clip) return false;
    this.current?.stop();
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    this.current = action;
    return true;
  }

  update(dt: number): void {
    if (this.current) this.mixer.update(dt);
  }
}

/** Scale to fit a fixed height and width (wide variants included), feet on y = 0, centred on x/z. */
function normalize(model: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const s = Math.min(TARGET_HEIGHT / Math.max(size.y, 1e-6), TARGET_WIDTH / Math.max(size.x, 1e-6));
  model.scale.multiplyScalar(s);
  const box2 = new THREE.Box3().setFromObject(model);
  const centre = box2.getCenter(new THREE.Vector3());
  model.position.x -= centre.x;
  model.position.z -= centre.z;
  model.position.y -= box2.min.y;
}

/** Simple stand-in robot built from boxes, used until a Blender model exists in assets/robot.glb. */
function placeholder(face: Face): RobotParts {
  const root = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: CLAUDE_ORANGE, roughness: 0.7, flatShading: true });
  const ink = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.8 });

  const body = new THREE.Group();
  body.position.y = 0.75;
  root.add(body);

  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.15, 0.6), orange);
  shell.position.y = 0.575;
  body.add(shell);

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.585), new THREE.MeshBasicMaterial({ map: face.texture }));
  screen.position.set(0, 0.72, 0.301);
  body.add(screen);

  for (const x of [-0.25, 0.25]) {
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), ink);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(x, 0.2, 0.31);
    body.add(btn);
  }

  const limb = (len: number) => {
    const pivot = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, len, 0.07), ink);
    m.position.y = -len / 2;
    pivot.add(m);
    return pivot;
  };
  const armL = limb(0.5);
  armL.position.set(0.53, 0.7, 0);
  const armR = limb(0.5);
  armR.position.set(-0.53, 0.7, 0);
  body.add(armL, armR);

  const legL = limb(0.75);
  legL.position.set(0.25, 0.75, 0);
  const legR = limb(0.75);
  legR.position.set(-0.25, 0.75, 0);
  root.add(legL, legR);

  const box = new THREE.Box3().setFromObject(root);
  root.scale.setScalar(TARGET_HEIGHT / box.getSize(new THREE.Vector3()).y);

  const meshes: THREE.Object3D[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o);
  });
  return { root, body, armL, armR, legL, legR, meshes, clips: new Map(), animRoot: root };
}

interface Rest {
  bodyY: number;
  bodyRotX: number;
  bodyRotZ: number;
  armL?: THREE.Euler;
  armR?: THREE.Euler;
  legL?: THREE.Euler;
  legR?: THREE.Euler;
  armLQ?: THREE.Quaternion;
  notepadQ?: THREE.Quaternion;
  mugQ?: THREE.Quaternion;
}

/** Length of the dance (seconds); two routines of 2.4 s each. */
export const DANCE_SECONDS = 4.8;

/** Procedural, low-frame-rate posing for each mood. Runs on top of each part's rest pose. */
export class RobotAnimator {
  private rest: Rest;
  /** Full rest transforms of every animated node, to undo whatever a Blender clip left behind. */
  private restTransforms: { o: THREE.Object3D; p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }[];
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  constructor(private parts: RobotParts) {
    const nodes = [parts.body, parts.rigRoot, parts.armL, parts.armR, parts.legL, parts.legR].filter(
      (o): o is THREE.Object3D => Boolean(o),
    );
    this.restTransforms = nodes.map((o) => ({ o, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }));
    this.rest = {
      bodyY: parts.body.position.y,
      bodyRotX: parts.body.rotation.x,
      bodyRotZ: parts.body.rotation.z,
      armL: parts.armL?.rotation.clone(),
      armR: parts.armR?.rotation.clone(),
      legL: parts.legL?.rotation.clone(),
      legR: parts.legR?.rotation.clone(),
      armLQ: parts.armL?.quaternion.clone(),
      notepadQ: parts.notepad?.quaternion.clone(),
      mugQ: parts.mug?.quaternion.clone(),
    };
  }

  /** Put every animated node back in its rest transform (call after a Blender clip finishes). */
  restoreRest(): void {
    for (const r of this.restTransforms) {
      r.o.position.copy(r.p);
      r.o.quaternion.copy(r.q);
      r.o.scale.copy(r.s);
    }
    this.showProps(false, false, false);
  }

  /** t is time in seconds already quantised to the stepped frame rate; moodTime is time since the mood began;
   *  facing is the body's yaw in radians (turned towards the walking direction). */
  pose(mood: Mood, t: number, moodTime: number, facing = 0, seated = false): void {
    const p = this.parts;
    const r = this.rest;
    // In model space the left arm is on +X; a positive Z rotation swings it outwards/up.
    // A negative X rotation swings a limb forward (towards the viewer).
    let armL = 0.15;
    let armR = -0.15;
    let armLx = 0;
    let armRx = 0;
    /** Turn of the right arm about the vertical axis (negative = hand comes towards the viewer). */
    let armRy = 0;
    let bob = Math.sin(t * 2) * 0.015;
    let tilt = 0;
    let lean = 0;
    let legSwing = 0;
    let rootX = 0;
    let notepad = false;
    let mug = false;
    let hammer = false;
    /** Extra tilt of the held prop around its X axis (negative = top away from the viewer). */
    let propTilt = 0;

    switch (mood) {
      case 'greet':
        armL = 2.4 + Math.sin(t * 10) * 0.35;
        bob = Math.abs(Math.sin(t * 5)) * 0.04;
        break;
      case 'happy':
        armL = 2.6;
        armR = -0.5;
        bob = Math.abs(Math.sin(t * 7)) * 0.08;
        break;
      case 'thinking':
        // Sev's sketch: right hand up at the chin, left arm hanging, head tilting slowly.
        // The arm swings inwards across the body, then turns towards the viewer so it passes in front.
        armR = THINK_ARM.z;
        armRy = THINK_ARM.y;
        armL = 0.2;
        tilt = -0.05 + Math.sin(t * 1.2) * 0.04;
        lean = 0.04;
        break;
      case 'working': {
        // Sev's sketch: hammering. Slow lift, fast strike, a little dip on each hit.
        hammer = true;
        const ph = (t * HAMMER_HZ) % 1;
        const lift = ph < 0.7 ? ph / 0.7 : 1 - (ph - 0.7) / 0.3;
        armL = HAMMER_LOW + (HAMMER_HIGH - HAMMER_LOW) * lift;
        armLx = -0.25;
        armR = -0.35;
        armRx = -0.5;
        bob = ph > 0.95 || ph < 0.05 ? -0.025 : 0;
        tilt = 0.05;
        break;
      }
      case 'browsing':
        // Point to the side and lean towards it.
        armR = -1.6;
        tilt = -0.12;
        break;
      case 'researching': {
        // Notepad held up in the left hand, the right hand scribbles; a small nod now and then.
        // Held out to his side at chest height, so the pad is in full view.
        notepad = true;
        armL = 0.8;
        armLx = -0.35;
        armR = -0.3 + Math.sin(t * 9) * 0.08;
        armRx = -0.9 + Math.sin(t * 14) * 0.1;
        propTilt = -0.25;
        const nod = Math.sin(t * 0.9) > 0.8 ? -0.03 : 0;
        bob = nod;
        lean = 0.05 + (nod ? 0.04 : 0);
        tilt = 0.04;
        break;
      }
      case 'permission':
        armL = 2.2 + Math.sin(t * 6) * 0.4;
        armR = -2.2 - Math.sin(t * 6) * 0.4;
        bob = Math.abs(Math.sin(t * 6)) * 0.05;
        break;
      case 'nudge': {
        // Knock-knock: the left hand goes up over his screen's corner and taps it three times.
        const tap = moodTime < 1.8 ? Math.max(0, Math.sin(moodTime * Math.PI * 3.4)) : 0;
        armL = 2.75 + tap * 0.35;
        armLx = -0.25;
        tilt = 0.05 + tap * 0.03;
        bob = -tap * 0.015;
        break;
      }
      case 'talking':
        // Sev's sketch: explaining with both arms, one high, one out to the side.
        armL = 2.55 + Math.sin(t * 2.5) * 0.2;
        armR = -1.1 - Math.sin(t * 2.5 + 1.2) * 0.25;
        armLx = -0.3;
        armRx = -0.3;
        bob = Math.sin(t * 6) * 0.02;
        break;
      case 'walkTalking': {
        // Talking on a stroll (Sev's sketches): legs keep walking while the arms explain,
        // switching between one arm raised and both arms spread wide.
        const ph = t * 7;
        legSwing = Math.sin(ph) * 0.45;
        bob = Math.abs(Math.sin(ph)) * 0.03;
        if (Math.floor(moodTime / 2.5) % 2 === 0) {
          armL = 2.3 + Math.sin(t * 5) * 0.25;
          armLx = -0.3;
          armRx = Math.sin(ph) * 0.4;
        } else {
          armL = 1.45 + Math.sin(t * 3) * 0.12;
          armR = -1.45 - Math.sin(t * 3 + 1) * 0.12;
          armLx = -0.2;
          armRx = -0.2;
        }
        break;
      }
      case 'error':
        rootX = moodTime < 0.8 ? Math.sin(moodTime * 40) * 0.04 : 0;
        armL = 0.05;
        armR = -0.05;
        tilt = 0.08;
        break;
      case 'sleep':
        bob = -0.05 + Math.sin(t * 1.2) * 0.01;
        tilt = 0.1;
        armL = 0.05;
        armR = -0.05;
        break;
      case 'bye':
        armL = 2.4 + Math.sin(t * 10) * 0.35;
        break;
      case 'walking': {
        // Legs swing forward/back, arms counter-swing, small bounce on each step.
        const ph = t * 7;
        legSwing = Math.sin(ph) * 0.45;
        armLx = -Math.sin(ph) * 0.4;
        armRx = Math.sin(ph) * 0.4;
        bob = Math.abs(Math.sin(ph)) * 0.03;
        break;
      }
      case 'running': {
        // Sprint: fast big strides, bent arms pumping, leaning into it.
        const ph = t * 15;
        legSwing = Math.sin(ph) * 0.65;
        armL = 0.25;
        armR = -0.25;
        armLx = -0.35 - Math.sin(ph) * 0.85;
        armRx = -0.35 + Math.sin(ph) * 0.85;
        bob = Math.abs(Math.sin(ph)) * 0.07;
        lean = 0.16;
        break;
      }
      case 'tired': {
        // A big stretch with both arms up, then they flop down.
        const up = moodTime < 1.7;
        armL = up ? 2.7 + Math.sin(t * 3) * 0.1 : 0.1;
        armR = up ? -2.7 - Math.sin(t * 3) * 0.1 : -0.1;
        bob = up ? 0.035 : -0.03;
        tilt = up ? Math.sin(t * 2) * 0.05 : 0.06;
        lean = up ? -0.08 : 0.06;
        break;
      }
      case 'resting':
        // Leaning back on the hands, swaying a little.
        armL = 0.35;
        armR = -0.35;
        armLx = 0.55;
        armRx = 0.55;
        lean = -0.07;
        tilt = Math.sin(t * 0.8) * 0.04;
        bob = 0;
        break;
      case 'dancing': {
        if (Math.floor(moodTime / 2.4) % 2 === 0) {
          // Side-step with arm pumps.
          rootX = Math.sin(t * 6) * 0.09;
          armL = 1.1 + Math.sin(t * 12) * 0.5;
          armR = -1.1 + Math.sin(t * 12) * 0.5;
          armLx = -0.4;
          armRx = -0.4;
          legSwing = Math.sin(t * 6) * 0.3;
          bob = Math.abs(Math.sin(t * 12)) * 0.06;
        } else {
          // Hip sway with both arms waving overhead.
          tilt = Math.sin(t * 5) * 0.16;
          armL = 2.6 + Math.sin(t * 5) * 0.3;
          armR = -2.6 + Math.sin(t * 5) * 0.3;
          bob = Math.abs(Math.sin(t * 10)) * 0.04;
          legSwing = Math.sin(t * 5) * 0.15;
        }
        break;
      }
      case 'sipping': {
        // Raise the mug towards the screen, tip it during the sip, lower it again.
        mug = true;
        const up = moodTime > 0.6 && moodTime < 4.2;
        const sip = moodTime > 1 && moodTime < 3.2;
        armL = up ? -0.45 : 0.3;
        armLx = up ? -2.0 : -0.6;
        propTilt = sip ? -0.6 : 0;
        lean = sip ? -0.06 : 0;
        break;
      }
      case 'idle':
      default:
        legSwing = 0;
        break;
    }

    // Sitting on a window edge or the taskbar: legs hang over the edge and dangle slowly.
    let legForward = 0;
    if (seated && mood !== 'walking' && mood !== 'walkTalking' && mood !== 'running') {
      legForward = 0.35;
      legSwing = Math.sin(t * (mood === 'resting' ? 1.2 : 1.8)) * 0.3;
      bob = 0;
    }

    p.body.position.y = r.bodyY + bob;
    p.body.rotation.x = r.bodyRotX + lean;
    p.body.rotation.z = r.bodyRotZ + tilt;
    p.root.position.x = rootX * ROBOT_SCALE;
    p.root.rotation.y = facing;
    if (p.armL && r.armL) p.armL.rotation.set(r.armL.x + armLx, r.armL.y, r.armL.z + armL);
    if (p.armR && r.armR) p.armR.rotation.set(r.armR.x + armRx, r.armR.y + armRy, r.armR.z + armR);
    if (p.legL && r.legL) p.legL.rotation.set(r.legL.x + legForward + legSwing, r.legL.y, r.legL.z);
    if (p.legR && r.legR) p.legR.rotation.set(r.legR.x + legForward - legSwing, r.legR.y, r.legR.z);

    this.showProps(notepad, mug, hammer);
    if (notepad) this.keepUpright(p.notepad, r.notepadQ, propTilt);
    if (mug) this.keepUpright(p.mug, r.mugQ, propTilt);
  }

  private showProps(notepad: boolean, mug: boolean, hammer: boolean): void {
    if (this.parts.notepad) this.parts.notepad.visible = notepad;
    if (this.parts.mug) this.parts.mug.visible = mug;
    if (this.parts.hammer) this.parts.hammer.visible = hammer;
  }

  /** Cancel the arm's rotation so a held prop keeps its rest orientation (plus a tilt), wherever the hand goes. */
  private keepUpright(prop: THREE.Object3D | undefined, propRest: THREE.Quaternion | undefined, tiltX: number): void {
    const arm = this.parts.armL;
    if (!prop || !propRest || !arm || !this.rest.armLQ) return;
    this.q.setFromEuler(this.e.set(tiltX, 0, 0));
    prop.quaternion.copy(arm.quaternion).invert().multiply(this.rest.armLQ).multiply(propRest).multiply(this.q);
  }
}
