import * as THREE from 'three';
import type { Placement } from '../shared/settings';
import { EventRouter } from './eventRouter';
import { Face } from './face';
import { IdleScheduler, SIP_SECONDS, YAWN_SECONDS } from './idleScheduler';
import { ClipPlayer, DANCE_SECONDS, loadRobot, ROBOT_SCALE, RobotAnimator, WIDTH_SQUASH, type ClipName, type RobotParts } from './robot';
import { Speaker } from './speaker';
import { ROBOT_NAME, USER_NAME, type Mood } from './stateMachine';
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
let seated = false;

/** A short animation on top of the mood (dance, knock, sip, late-night yawn): owns body and face. */
let overlay: { mood: Mood; start: number; until: number } | null = null;

function now(): number {
  return performance.now() / 1000;
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function setMood(next: Mood, bubble?: string, holdSeconds?: number, skipClip = false): void {
  const t = now();
  const clip = MOOD_CLIPS[next];
  // Start the mood's clip when the mood changes; a repeated greeting waves again.
  if (clip && !skipClip && (next !== mood || next === 'greet')) clips?.play(clip);
  if (next !== mood) moodStart = t;
  mood = next;
  holdUntil = holdSeconds === undefined ? Infinity : t + holdSeconds;
  if (bubble) showBubble(bubble);
  else if (next !== 'talking') hideBubble();
}

function setOverlay(m: Mood, seconds: number): void {
  const t = now();
  overlay = { mood: m, start: t, until: t + seconds };
  if (strolling) stopStroll(t);
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

const router = new EventRouter();
const idle = new IdleScheduler(now());
let touring = false;
let tourTimer: ReturnType<typeof setTimeout> | null = null;

// --- Voice ---
const speaker = new Speaker();
let voiceEnabled = true;

function say(text: string | undefined): void {
  if (voiceEnabled && text) void speaker.say(text);
}

/** Something happened (a Claude event, a click, a drag): stand up if resting. */
function wake(t: number): void {
  if (idle.activity(t)) window.companion.setRest(false);
}

window.companion.onEvent((evt) => {
  const name = evt.hook_event_name ?? '';
  if (name === 'CompanionDemo') return startTour();
  if (name === 'CompanionMood') return demoMood(String(evt.mood ?? ''));
  if (touring) return;
  const t = now();
  const routed = router.handle(evt, t, voiceEnabled);
  if (!routed) return;
  wake(t);
  overlay = null;
  const r = routed.reaction;
  idle.setWaiting(Boolean(r.waiting), t);
  // A long task ends with a dance instead of the cheer clip.
  setMood(r.mood, r.bubble, r.holdSeconds, routed.dance);
  if (routed.dance) setOverlay('dancing', DANCE_SECONDS);
  if (routed.offerMore && r.bubble) {
    showBubble(r.bubble, true);
    pendingMore = routed.offerMore;
  }
  // A new prompt means a new turn: stop talking about the last one.
  if (routed.stopSpeech) speaker.stop();
  say(routed.speak);
});

/** Show a state on request (tray "Test states", previews), without Claude. */
function demoMood(m: string): void {
  const t = now();
  wake(t);
  switch (m) {
    case 'researching':
      setMood('researching', 'Let me take some notes.', 8);
      break;
    case 'running':
      forcedRunUntil = t + 7;
      setMood('working', 'A bug? On my way!', 7);
      break;
    case 'tired':
      setMood('idle');
      idle.tireNow();
      break;
    case 'dancing':
      setMood('happy', 'Woohoo, all done!', 8, true);
      setOverlay('dancing', DANCE_SECONDS);
      break;
    case 'nudge':
      setMood('permission', 'I need your OK!', 8);
      nudge();
      break;
    case 'sipping':
      setMood('idle');
      setOverlay('sipping', SIP_SECONDS);
      break;
  }
}

/** Knock on the screen: something has waited on Sev for a while. Said once per request. */
function nudge(): void {
  const line = mood === 'permission' ? `Still waiting for your OK, ${USER_NAME}.` : `${USER_NAME}, I asked you something.`;
  setOverlay('nudge', 3);
  showBubble(line);
  say(line);
}

function startTour(): void {
  if (tourTimer) clearTimeout(tourTimer);
  touring = true;
  const run = (i: number) => {
    strolling = false;
    overlay = null;
    if (i >= TOUR.length) {
      touring = false;
      tourTimer = null;
      setMood('idle');
      nextWalkAt = now() + rand(...STROLL_GAP);
      return;
    }
    const step = TOUR[i];
    if (step.mood === 'walking') {
      // The walking step is a stroll with the idle face.
      strolling = true;
      walkDir = Math.random() < 0.5 ? -1 : 1;
      walkUntil = now() + step.seconds;
      setMood('idle', step.bubble);
    } else if (step.mood === 'running') {
      forcedRunUntil = now() + step.seconds;
      setMood('working', step.bubble);
    } else if (step.mood === 'dancing' || step.mood === 'sipping') {
      setMood(step.mood === 'dancing' ? 'happy' : 'idle', step.bubble, undefined, true);
      setOverlay(step.mood, step.seconds);
    } else {
      setMood(step.mood, step.bubble);
    }
    say(step.bubble);
    tourTimer = setTimeout(() => run(i + 1), step.seconds * 1000);
  };
  run(0);
}

// ---------------------------------------------------------------------------------------------
// Placement (taskbar / sitting on a window) and the cursor
// ---------------------------------------------------------------------------------------------

window.companion.onPlacement((p: Placement) => {
  seated = p === 'sitting' || p === 'resting';
  if (seated && !touring) strolling = false;
  // Woken up while sitting down (an event arrived mid-hop): stand straight back up.
  if (p === 'resting' && !idle.resting) window.companion.setRest(false);
});

window.companion.onHop(() => clips?.play('Hop'));

let cursor: { x: number; y: number } | null = null;
// The main process polls the cursor: this is what makes Rusty grabbable, because Windows doesn't
// reliably forward mouse moves to a click-through window.
window.companion.onCursor((pos) => {
  cursor = pos;
  updateHover(pos.x, pos.y);
});

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

function overBubble(clientX: number, clientY: number): boolean {
  if (bubbleEl.classList.contains('hidden')) return false;
  const r = bubbleEl.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

/** Catch clicks only while the cursor is over Rusty or his bubble; click through everywhere else. */
function updateHover(clientX: number, clientY: number): void {
  if (dragging) return;
  setInteractive(overBubble(clientX, clientY) || overRobot(clientX, clientY));
}

window.addEventListener('mousemove', (e) => updateHover(e.clientX, e.clientY));

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
  const t = now();
  wake(t);
  if (mood === 'resting' || mood === 'tired') setMood('idle');
  if (!touring) stopStroll(t);
});

canvas.addEventListener('dblclick', () => {
  wake(now());
  const line = `Hi ${USER_NAME}! It's ${ROBOT_NAME}.`;
  setMood('greet', line, 3);
  say(line);
});
bubbleEl.addEventListener('click', () => {
  wake(now());
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
// Walking along the taskbar: idle strolls, and sprints while Claude fixes a bug
// ---------------------------------------------------------------------------------------------

// Strolling is separate from the mood, so Rusty can walk while he talks (bubble and face stay).
const WALK_SPEED = 36 * ROBOT_SCALE; // screen pixels per second, moved in stepped increments
const RUN_SPEED = 220 * ROBOT_SCALE;
const FACING = 0.55; // yaw while walking (radians), keeps the face visible
/** Pause between strolls and stroll length (seconds). */
const STROLL_GAP: [number, number] = [3, 9];
const STROLL_LENGTH: [number, number] = [3, 8];
let walkEnabled = true;
let strolling = false;
let running = false;
/** Sprint on request until this time (tray test, tour). */
let forcedRunUntil = 0;
let walkDir = 1;
let walkUntil = 0;
let nextWalkAt = now() + rand(4, 9);
let walkInFlight = false;
let facing = 0;

window.companion.onSettings((s) => {
  walkEnabled = s.walk;
  voiceEnabled = s.voice;
  if (!voiceEnabled) speaker.stop();
  if (!walkEnabled && !touring) strolling = false;
});

/** Moods in which Rusty may wander: idle, or while he is talking/cheering about a finished reply. */
function mayStroll(): boolean {
  if (!walkEnabled || seated || dragging || running || overlay || clips?.playing) return false;
  if (mood === 'idle') return true;
  return (mood === 'happy' || mood === 'talking') && speaker.speaking;
}

function stopStroll(t: number): void {
  strolling = false;
  nextWalkAt = t + rand(...STROLL_GAP);
}

/** Sprint while a bug-fix turn keeps Claude busy (or on request). Tells the main process to stay off windows. */
function updateRunning(t: number): void {
  const want = walkEnabled && !dragging && !overlay && (router.shouldRun(mood) || t < forcedRunUntil);
  if (want === running) return;
  running = want;
  window.companion.setRoam(running);
  if (running) strolling = false;
  else nextWalkAt = t + rand(...STROLL_GAP);
}

/** Called once per body step (BODY_FPS). Starts, advances and ends strolls and sprints. */
function walkStep(t: number): void {
  updateRunning(t);
  if (!touring && !running) {
    if (!strolling && t > nextWalkAt && mayStroll()) {
      strolling = true;
      walkDir = Math.random() < 0.5 ? -1 : 1;
      walkUntil = t + rand(...STROLL_LENGTH);
    } else if (strolling && (t > walkUntil || !mayStroll())) {
      stopStroll(t);
    } else if (!strolling && !mayStroll() && mood !== 'idle') {
      // Claude is busy: don't start a stroll the moment it finishes.
      nextWalkAt = Math.max(nextWalkAt, t + rand(2, 5));
    }
  }
  if ((strolling || running) && !walkInFlight) {
    walkInFlight = true;
    const speed = running ? RUN_SPEED : WALK_SPEED;
    window.companion
      .walkBy((walkDir * speed) / BODY_FPS)
      .then((r) => {
        // Not on the taskbar (sitting or dropped elsewhere): walk/run on the spot in the tour or a sprint, else stop.
        if (!r.onFloor && !touring && !running) stopStroll(now());
        else if (r.onFloor && r.blocked) walkDir = -walkDir;
      })
      .finally(() => (walkInFlight = false));
  }
  // Turn towards the walking direction, back to the front when stopped (stepped easing).
  const target = strolling || running ? walkDir * FACING : 0;
  facing += (target - facing) * 0.35;
  if (Math.abs(facing) < 0.01) facing = 0;
}

/** Rusty's own idle life: getting tired and sitting down, morning coffee, late yawns, the waiting nudge. */
function idleStep(t: number): void {
  if (touring) return;
  const busyBody = strolling || running || dragging || Boolean(clips?.playing) || overlay !== null;
  switch (idle.tick({ t, hour: new Date().getHours(), mood, busyBody })) {
    case 'yawn':
      setMood('tired');
      break;
    case 'rest':
      setMood('resting');
      window.companion.setRest(true);
      break;
    case 'nightYawn':
      setOverlay('tired', YAWN_SECONDS);
      break;
    case 'sip':
      setOverlay('sipping', SIP_SECONDS);
      break;
    case 'nudge':
      nudge();
      break;
  }
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
    if (router.busyTimedOut(mood, t)) setMood('idle');
  }
  if (overlay && t > overlay.until) overlay = null;

  const stepped = Math.floor(t * BODY_FPS) / BODY_FPS;
  if (stepped !== lastStep) {
    // Advance a playing Blender clip in the same stepped rhythm as the rest of the body.
    if (clips?.playing) {
      clips.update(lastStep ? stepped - lastStep : 1 / BODY_FPS);
      clipWasPlaying = true;
    }
    lastStep = stepped;
    walkStep(t);
    idleStep(t);
  }
  if (clips?.playing) {
    // The clip owns the body for now.
  } else {
    if (clipWasPlaying) {
      animator?.restoreRest();
      clipWasPlaying = false;
    }
    if (overlay) animator?.pose(overlay.mood, stepped, stepped - overlay.start, facing, seated);
    else {
      const body = running ? 'running' : strolling ? 'walking' : bodyMood(mood);
      animator?.pose(body, stepped, stepped - moodStart, facing, seated);
    }
  }
  updateGaze();
  face.setMouth(speaker.mouth());
  face.draw(overlay?.mood ?? mood, t);
  updateThinkingCloud();
  renderer.render(scene, camera);
}

const headTop = new THREE.Vector3();
const headBox = new THREE.Box3();

/** Show the thought cloud while Claude is thinking or working (and no speech bubble is up),
 *  placed just above and to the right of the robot's head. */
function updateThinkingCloud(): void {
  // Dots only while Claude is actually thinking/working, never while Rusty is talking.
  const show =
    (mood === 'thinking' || mood === 'working') &&
    !overlay &&
    bubbleEl.classList.contains('hidden') &&
    !speaker.speaking &&
    parts;
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
  const squash = new THREE.Group(); // narrows him on screen without touching his height
  squash.scale.x = WIDTH_SQUASH;
  squash.add(p.root);
  scene.add(squash);
  squash.updateMatrixWorld(true);
  resize();
  const hello = `Hello ${USER_NAME}, what can I do?`;
  setMood('greet', hello, 4);
  say(hello); // spoken once the voice model has loaded (~10 s after start)
  frame();
});
