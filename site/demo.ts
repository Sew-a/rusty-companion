// Live Rusty for the landing page (docs/index.html). Reuses the app's own model loader, poses and
// face, so the page shows the real robot. Plays a scripted Claude Code session on a loop; the mood
// buttons let visitors pick a state. Bundled to docs/demo.js by scripts/build-site.mjs.
import * as THREE from 'three';
import { Face } from '../src/renderer/face';
import { ClipPlayer, loadRobot, RobotAnimator, WIDTH_SQUASH, type ClipName, type RobotParts } from '../src/renderer/robot';
import type { Mood } from '../src/renderer/stateMachine';

// The app reads the model through the preload bridge; here it comes from the page's own folder.
(window as unknown as { companion: unknown }).companion = {
  loadModel: async () => new Uint8Array(await (await fetch('robot.glb')).arrayBuffer()),
};

const BODY_FPS = 12;
const stage = document.getElementById('stage') as HTMLDivElement;
const canvas = document.getElementById('rusty') as HTMLCanvasElement;
const bubbleEl = document.getElementById('bubble') as HTMLDivElement;
const thinkingEl = document.getElementById('thinking') as HTMLDivElement;
const termEl = document.getElementById('term-lines') as HTMLDivElement;
const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-mood]'));

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a6a5a, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(2, 3, 4);
scene.add(sun);

const VIEW_H = 2.3;
/** Share of the stage's height taken by the taskbar strip (must match .taskbar in index.html). */
const TASKBAR = 0.22;
/** Rusty stands this far across the stage (0 = left edge), clear of the terminal. */
const STAND_X = 0.62;
const LOOK_Y = 0.55;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
// Same viewing angle as the app's camera, aimed lower so his feet land on the taskbar's top edge.
camera.position.set(0.9, LOOK_Y + 0.25, 6);
camera.lookAt(0, LOOK_Y, 0);

function resize(): void {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  const below = TASKBAR + LOOK_Y / VIEW_H;
  camera.top = VIEW_H * (1 - below);
  camera.bottom = -VIEW_H * below;
  camera.left = -VIEW_H * aspect * STAND_X;
  camera.right = VIEW_H * aspect * (1 - STAND_X);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

// ---------------------------------------------------------------------------------------------
// The scripted session: what Claude Code does (terminal lines) and how Rusty reacts.
// ---------------------------------------------------------------------------------------------

interface Beat {
  mood: Mood;
  seconds: number;
  bubble?: string;
  /** A line for the fake terminal, with a style class. */
  term?: [string, string];
  /** Clear the terminal first (start of a new loop). */
  clear?: boolean;
  walk?: boolean;
}

const SCRIPT: Beat[] = [
  { mood: 'greet', seconds: 3.5, bubble: "Hi! I'm Rusty, the face of Claude.", clear: true, term: ['claude', 'cmd'] },
  { mood: 'thinking', seconds: 3, term: ['> fix the login redirect bug', 'prompt'] },
  { mood: 'researching', seconds: 3.5, term: ['● Read src/auth/session.ts', 'tool'] },
  { mood: 'working', seconds: 3.5, term: ['● Update src/auth/session.ts', 'tool'] },
  { mood: 'permission', seconds: 3.5, bubble: 'I need your OK to run the tests!', term: ['? Allow Bash(npm test)', 'ask'] },
  { mood: 'working', seconds: 2.5, term: ['● Bash npm test  ✓ 48 passed', 'tool'] },
  { mood: 'happy', seconds: 4, bubble: 'Done! The redirect now keeps you signed in.', term: ['✓ Fixed the redirect after login.', 'done'] },
  { mood: 'dancing', seconds: 4.8 },
  { mood: 'walking', seconds: 5, walk: true },
  { mood: 'resting', seconds: 3.5 },
];

/** Moods that start with a Blender clip (as in the app). */
const MOOD_CLIPS: Partial<Record<Mood, ClipName>> = { greet: 'Wave', happy: 'Cheer', bye: 'Wave' };

/** Lines shown when a visitor picks a mood. */
const PICKED: Partial<Record<Mood, string>> = {
  greet: 'Hello there!',
  permission: 'Claude needs your OK!',
  happy: 'All done!',
  talking: 'Let me explain what Claude found…',
  error: 'Oh no, something broke.',
  researching: 'Let me take some notes.',
  browsing: 'Look, the browser!',
  sipping: 'Coffee time.',
  sleep: 'Zzz…',
};

let parts: RobotParts | null = null;
let animator: RobotAnimator | null = null;
let clips: ClipPlayer | null = null;
let walker: THREE.Group | null = null;
const face = new Face();

let mood: Mood = 'idle';
let moodStart = 0;
let beat = -1;
let beatUntil = 0;
let walking = false;
let walkDir = 1;
let walkX = 0;
/** After a visitor picks a mood, the script waits until this time. */
let pickedUntil = 0;

const now = () => performance.now() / 1000;

function setMood(next: Mood, bubble?: string): void {
  const clip = MOOD_CLIPS[next];
  if (clip) clips?.play(clip);
  mood = next;
  moodStart = now();
  if (bubble) {
    bubbleEl.textContent = bubble;
    bubbleEl.classList.remove('hidden');
  } else bubbleEl.classList.add('hidden');
  for (const c of chips) c.classList.toggle('on', c.dataset.mood === next);
}

function termLine(text: string, cls: string): void {
  const el = document.createElement('div');
  el.className = `line ${cls}`;
  el.textContent = text;
  termEl.appendChild(el);
  while (termEl.children.length > 7) termEl.firstElementChild?.remove();
}

function nextBeat(t: number): void {
  beat = (beat + 1) % SCRIPT.length;
  const b = SCRIPT[beat];
  if (b.clear) termEl.textContent = '';
  if (b.term) termLine(b.term[0], b.term[1]);
  walking = Boolean(b.walk);
  setMood(b.mood, b.bubble);
  beatUntil = t + b.seconds;
}

for (const c of chips) {
  c.addEventListener('click', () => {
    const m = c.dataset.mood as Mood;
    walking = m === 'walking';
    setMood(m, PICKED[m]);
    pickedUntil = now() + 6;
    beatUntil = pickedUntil;
    beat = -1; // the script restarts from the top afterwards
  });
}

// Rusty's eyes follow the mouse, as on the desktop.
let mouseX = 0;
let mouseY = 0;
window.addEventListener('pointermove', (e) => {
  const r = stage.getBoundingClientRect();
  mouseX = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
  mouseY = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height * 0.45)) / (r.height / 2)));
});

const headBox = new THREE.Box3();
const p3 = new THREE.Vector3();

/** Keep the speech bubble and thought cloud just above Rusty's head. */
function placeOverHead(): void {
  if (!parts) return;
  headBox.setFromObject(parts.body);
  p3.set((headBox.min.x + headBox.max.x) / 2, headBox.max.y, 0).project(camera);
  const x = ((p3.x + 1) / 2) * stage.clientWidth;
  const y = ((1 - p3.y) / 2) * stage.clientHeight;
  bubbleEl.style.left = `${x}px`;
  bubbleEl.style.top = `${y - 14}px`;
  thinkingEl.style.left = `${x + 46}px`;
  thinkingEl.style.top = `${y - 10}px`;
  const think = (mood === 'thinking' || mood === 'working') && bubbleEl.classList.contains('hidden');
  thinkingEl.classList.toggle('hidden', !think);
}

let lastStep = 0;
let clipWasPlaying = false;
let visible = true;
new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(stage);

function frame(): void {
  requestAnimationFrame(frame);
  if (!visible || !animator || !parts || !walker) return;
  const t = now();
  if (t > beatUntil) nextBeat(t);

  const stepped = Math.floor(t * BODY_FPS) / BODY_FPS;
  if (stepped !== lastStep) {
    if (clips?.playing) {
      clips.update(lastStep ? stepped - lastStep : 1 / BODY_FPS);
      clipWasPlaying = true;
    }
    if (walking) {
      const limit = 0.6;
      walkX += (walkDir * 0.55) / BODY_FPS;
      if (Math.abs(walkX) > limit) {
        walkX = Math.sign(walkX) * limit;
        walkDir = -walkDir;
      }
    } else walkX *= 0.8; // drift back to the middle
    walker.position.x = walkX;
    lastStep = stepped;
  }
  if (!clips?.playing) {
    if (clipWasPlaying) {
      animator.restoreRest();
      clipWasPlaying = false;
    }
    const body: Mood = MOOD_CLIPS[mood] ? 'idle' : mood;
    const facing = walking ? walkDir * 0.9 : 0;
    animator.pose(walking ? 'walking' : body, stepped, stepped - moodStart, facing, mood === 'resting');
  }
  face.setGaze(mouseX, mouseY);
  const talking = !bubbleEl.classList.contains('hidden') && t - moodStart < 2.5;
  face.setMouth(talking ? 0.5 + 0.5 * Math.sin(t * 18) : null);
  face.draw(mood, t);
  placeOverHead();
  renderer.render(scene, camera);
}

loadRobot(face).then((p) => {
  parts = p;
  animator = new RobotAnimator(p);
  clips = new ClipPlayer(p);
  walker = new THREE.Group();
  const squash = new THREE.Group();
  squash.scale.x = WIDTH_SQUASH;
  squash.add(p.root);
  walker.add(squash);
  scene.add(walker);
  resize();
  stage.classList.add('ready');
  frame();
});
