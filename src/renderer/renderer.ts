import * as THREE from 'three';
import type { Placement } from '../shared/settings';
import { Face } from './face';
import { ClipPlayer, loadRobot, RobotAnimator, type ClipName, type RobotParts } from './robot';
import { SessionFilter } from './sessionFilter';
import { Speaker } from './speaker';
import { BUSY_TIMEOUT_SECONDS, reactionFor, ROBOT_NAME, USER_NAME, type Mood } from './stateMachine';
import { TOUR } from './tour';

const BODY_FPS = 12; // stepped, stop-motion feel for the body
const RENDER_FPS = 30; // the face (blink, mouth, eyes) updates at this rate

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const bubbleEl = document.getElementById('bubble') as HTMLDivElement;
const thinkingEl = document.getElementById('thinking') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a6a5a, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(2, 3, 4);
scene.add(sun);

// Orthographic camera: keeps the face undistorted; feet sit near the bottom of the window.
const VIEW_H = 3.2;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
camera.position.set(0.9, 1.45, 6);
camera.lookAt(0, 1.2, 0);

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  camera.top = VIEW_H * 0.62;
  camera.bottom = -VIEW_H * 0.38;
  camera.left = (-VIEW_H * aspect) / 2;
  camera.right = (VIEW_H * aspect) / 2;
  camera.updateProjectionMatrix();
  reportSeatOffset();
}
window.addEventListener('resize', resize);

const face = new Face();
let parts: RobotParts | null = null;
let animator: RobotAnimator | null = null;
let clips: ClipPlayer | null = null;

/** Moods that start with a Blender clip. After the clip, the body rests (the face keeps the mood). */
const MOOD_CLIPS: Partial<Record<Mood, ClipName>> = { greet: 'Wave', happy: 'Cheer', bye: 'Wave' };

/** The body pose to use for a mood: moods covered by a clip settle into the idle pose afterwards. */
function bodyMood(m: Mood): Mood {
  const clip = MOOD_CLIPS[m];
  return clip && clips?.has(clip) ? 'idle' : m;
}

let mood: Mood = 'idle';
let moodStart = 0;
let holdUntil = Infinity;
let lastEventAt = 0;
let seated = false;

function now(): number {
  return performance.now() / 1000;
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function setMood(next: Mood, bubble?: string, holdSeconds?: number): void {
  const t = now();
  const clip = MOOD_CLIPS[next];
  // Start the mood's clip when the mood changes; a repeated greeting waves again.
  if (clip && (next !== mood || next === 'greet')) clips?.play(clip);
  if (next !== mood) moodStart = t;
  mood = next;
  holdUntil = holdSeconds === undefined ? Infinity : t + holdSeconds;
  if (bubble) showBubble(bubble);
  else if (next !== 'talking') hideBubble();
}

/** The rest of the last long reply, waiting to be read aloud if you click the bubble. */
let pendingMore: string | null = null;

function showBubble(text: string, moreHint = false): void {
  bubbleEl.textContent = text;
  if (moreHint) {
    const hint = document.createElement('div');
    hint.className = 'more';
    hint.textContent = '▶ Click to hear the rest';
    bubbleEl.appendChild(hint);
  } else {
    pendingMore = null;
  }
  bubbleEl.classList.remove('hidden');
}

function hideBubble(): void {
  bubbleEl.classList.add('hidden');
  pendingMore = null;
}

// ---------------------------------------------------------------------------------------------
// Claude events (filtered to the session you're working in) and the guided tour
// ---------------------------------------------------------------------------------------------

const sessions = new SessionFilter();
let touring = false;
let tourTimer: ReturnType<typeof setTimeout> | null = null;

// --- Voice: which events are spoken aloud (their bubble text) ---
const speaker = new Speaker();
let voiceEnabled = true;
const SPOKEN_EVENTS = new Set(['SessionStart', 'PermissionRequest', 'Notification', 'Stop', 'StopFailure', 'SessionEnd']);

function say(text: string | undefined): void {
  if (voiceEnabled && text) void speaker.say(text);
}

window.companion.onEvent((evt) => {
  if (evt.hook_event_name === 'CompanionDemo') return startTour();
  if (touring || !sessions.accept(evt)) return;
  lastEventAt = now();
  const r = reactionFor(evt);
  if (!r) return;
  setMood(r.mood, r.bubble, r.holdSeconds);
  if (r.more && voiceEnabled && r.bubble) {
    showBubble(r.bubble, true);
    pendingMore = r.more;
  }
  if (SPOKEN_EVENTS.has(evt.hook_event_name ?? '')) {
    // With voice off there is nobody to "click to hear the rest", so don't offer it.
    say(r.more && !voiceEnabled ? r.bubble : (r.speech ?? r.bubble));
  }
  // A new prompt means a new turn: stop talking about the last one.
  if (evt.hook_event_name === 'UserPromptSubmit') speaker.stop();
});

function startTour(): void {
  if (tourTimer) clearTimeout(tourTimer);
  touring = true;
  const run = (i: number) => {
    if (i >= TOUR.length) {
      touring = false;
      tourTimer = null;
      setMood('idle');
      nextWalkAt = now() + rand(8, 16);
      return;
    }
    const step = TOUR[i];
    if (step.mood === 'walking') {
      walkDir = Math.random() < 0.5 ? -1 : 1;
      walkUntil = now() + step.seconds;
    }
    setMood(step.mood, step.bubble);
    say(step.bubble);
    tourTimer = setTimeout(() => run(i + 1), step.seconds * 1000);
  };
  run(0);
}

// ---------------------------------------------------------------------------------------------
// Placement (taskbar / sitting on a window) and the cursor
// ---------------------------------------------------------------------------------------------

window.companion.onPlacement((p: Placement) => {
  seated = p === 'sitting';
  if (seated && mood === 'walking' && !touring) setMood('idle');
});

window.companion.onHop(() => clips?.play('Hop'));

let cursor: { x: number; y: number } | null = null;
window.companion.onCursor((pos) => (cursor = pos));

const tmp = new THREE.Vector3();

/** Tell the main process where the robot's body bottom is in the window, so it can sit it on an edge. */
function reportSeatOffset(): void {
  if (!parts) return;
  parts.root.updateMatrixWorld(true);
  camera.updateMatrixWorld();
  parts.body.getWorldPosition(tmp).project(camera);
  window.companion.setSeatOffset(((1 - tmp.y) / 2) * window.innerHeight);
}

/** Point the eyes at the mouse cursor (or straight ahead if unknown). */
function updateGaze(): void {
  if (!parts || !cursor) return face.setGaze(0, 0);
  headBox.setFromObject(parts.body);
  headBox.getCenter(tmp).project(camera);
  const hx = ((tmp.x + 1) / 2) * window.innerWidth;
  const hy = ((1 - tmp.y) / 2) * window.innerHeight;
  const dx = cursor.x - hx;
  const dy = cursor.y - hy;
  const len = Math.hypot(dx, dy) || 1;
  const strength = Math.min(1, len / 160);
  face.setGaze((dx / len) * strength, (dy / len) * strength);
}

// ---------------------------------------------------------------------------------------------
// Mouse: click-through except on the robot and the bubble; drag to move
// ---------------------------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let interactive = false;
let dragging = false;
let lastScreen = { x: 0, y: 0 };

function overRobot(clientX: number, clientY: number): boolean {
  if (!parts) return false;
  pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(parts.meshes, false).length > 0;
}

function setInteractive(v: boolean): void {
  if (v === interactive) return;
  interactive = v;
  window.companion.setIgnoreMouse(!v);
}

window.addEventListener('mousemove', (e) => {
  if (dragging) return;
  const onBubble = !bubbleEl.classList.contains('hidden') && bubbleEl.contains(e.target as Node);
  setInteractive(onBubble || overRobot(e.clientX, e.clientY));
});

window.addEventListener('mouseleave', () => {
  if (!dragging) setInteractive(false);
});

canvas.addEventListener('pointerdown', (e) => {
  if (!overRobot(e.clientX, e.clientY)) return;
  dragging = true;
  lastScreen = { x: e.screenX, y: e.screenY };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.screenX - lastScreen.x;
  const dy = e.screenY - lastScreen.y;
  if (dx || dy) {
    window.companion.moveBy(dx, dy);
    lastScreen = { x: e.screenX, y: e.screenY };
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (!dragging) return;
  dragging = false;
  canvas.releasePointerCapture(e.pointerId);
  window.companion.dragEnd();
  if (mood === 'walking' && !touring) setMood('idle');
});

canvas.addEventListener('dblclick', () => {
  const line = `Hi ${USER_NAME}! It's ${ROBOT_NAME}.`;
  setMood('greet', line, 3);
  say(line);
});
bubbleEl.addEventListener('click', () => {
  if (pendingMore) {
    // Read the rest of the long reply.
    const rest = pendingMore;
    pendingMore = null;
    setMood('talking', 'Reading the rest of my reply…', 150);
    say(rest);
    return;
  }
  hideBubble();
  speaker.stop();
  if (!touring && (mood === 'happy' || mood === 'permission' || mood === 'talking')) setMood('idle');
});

// ---------------------------------------------------------------------------------------------
// Idle walking along the taskbar
// ---------------------------------------------------------------------------------------------

const WALK_SPEED = 36; // screen pixels per second, moved in stepped increments
const FACING = 0.55; // yaw while walking (radians), keeps the face visible
let walkEnabled = true;
let walkDir = 1;
let walkUntil = 0;
let nextWalkAt = now() + rand(6, 14);
let walkInFlight = false;
let facing = 0;

window.companion.onSettings((s) => {
  walkEnabled = s.walk;
  voiceEnabled = s.voice;
  if (!voiceEnabled) speaker.stop();
  if (!walkEnabled && mood === 'walking' && !touring) setMood('idle');
});

/** Called once per body step (BODY_FPS). Starts, advances and ends idle strolls. */
function walkStep(t: number): void {
  if (!touring && mood === 'idle' && walkEnabled && !seated && !dragging && t > nextWalkAt) {
    walkDir = Math.random() < 0.5 ? -1 : 1;
    walkUntil = t + rand(3, 7);
    setMood('walking');
  }
  if (mood === 'walking') {
    if (t > walkUntil) {
      if (!touring) {
        setMood('idle');
        nextWalkAt = t + rand(8, 20);
      }
    } else if (!walkInFlight && !seated) {
      walkInFlight = true;
      window.companion
        .walkBy((walkDir * WALK_SPEED) / BODY_FPS)
        .then((r) => {
          if (!r.onFloor) {
            // Not on the taskbar (dragged elsewhere): during the tour walk on the spot, else stop.
            if (!touring) {
              setMood('idle');
              nextWalkAt = now() + rand(8, 20);
            }
          } else if (r.blocked) {
            walkDir = -walkDir;
          }
        })
        .finally(() => (walkInFlight = false));
    }
  } else if (mood !== 'idle') {
    // Claude is doing something: postpone the next stroll.
    nextWalkAt = Math.max(nextWalkAt, t + rand(6, 12));
  }
  // Turn towards the walking direction, back to the front when stopped (stepped easing).
  const target = mood === 'walking' ? walkDir * FACING : 0;
  facing += (target - facing) * 0.35;
  if (Math.abs(facing) < 0.01) facing = 0;
}

// ---------------------------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------------------------

let lastRender = 0;
let lastStep = 0;
let clipWasPlaying = false;
function frame(): void {
  requestAnimationFrame(frame);
  const t = now();
  if (t - lastRender < 1 / RENDER_FPS) return;
  lastRender = t;

  if (!touring) {
    if (t > holdUntil) setMood('idle');
    const busy = mood === 'thinking' || mood === 'working' || mood === 'browsing' || mood === 'talking';
    if (busy && lastEventAt && t - lastEventAt > BUSY_TIMEOUT_SECONDS) setMood('idle');
  }

  const stepped = Math.floor(t * BODY_FPS) / BODY_FPS;
  if (stepped !== lastStep) {
    // Advance a playing Blender clip in the same stepped rhythm as the rest of the body.
    if (clips?.playing) {
      clips.update(lastStep ? stepped - lastStep : 1 / BODY_FPS);
      clipWasPlaying = true;
    }
    lastStep = stepped;
    walkStep(t);
  }
  if (clips?.playing) {
    // The clip owns the body for now.
  } else {
    if (clipWasPlaying) {
      animator?.restoreRest();
      clipWasPlaying = false;
    }
    animator?.pose(bodyMood(mood), stepped, stepped - moodStart, facing, seated);
  }
  updateGaze();
  face.setMouth(speaker.mouth());
  face.draw(mood, t);
  updateThinkingCloud();
  renderer.render(scene, camera);
}

const headTop = new THREE.Vector3();
const headBox = new THREE.Box3();

/** Show the thought cloud while Claude is thinking or working (and no speech bubble is up),
 *  placed just above and to the right of the robot's head. */
function updateThinkingCloud(): void {
  const show = (mood === 'thinking' || mood === 'working') && bubbleEl.classList.contains('hidden') && parts;
  thinkingEl.classList.toggle('hidden', !show);
  if (!show || !parts) return;
  headBox.setFromObject(parts.body);
  headTop.set(headBox.max.x * 0.55, headBox.max.y, 0).project(camera);
  thinkingEl.style.left = `${((headTop.x + 1) / 2) * window.innerWidth + 18}px`;
  thinkingEl.style.top = `${((1 - headTop.y) / 2) * window.innerHeight - 22}px`;
}

loadRobot(face).then((p) => {
  parts = p;
  animator = new RobotAnimator(p);
  clips = new ClipPlayer(p);
  scene.add(p.root);
  resize();
  const hello = `Hello ${USER_NAME}, what can I do?`;
  setMood('greet', hello, 4);
  say(hello); // spoken once the voice model has loaded (~10 s after start)
  frame();
});
