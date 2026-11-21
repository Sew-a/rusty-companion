import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_PORT, type HookEvent } from '../shared/events';
import type { CompanionSettings, Placement, WalkResult } from '../shared/settings';
import { startHookServer } from './hookServer';
import { loadState, saveState, type StoredState } from './store';
import { Voice } from './voice';
import { foregroundWindow, type ForegroundWindow } from './win32';

const PORT = Number(process.env.COMPANION_PORT ?? DEFAULT_PORT);
const WIN_W = 280;
const WIN_H = 330;
const RIGHT_MARGIN = 40;
/** Dropping the robot within this many pixels of the taskbar snaps it onto the taskbar. */
const SNAP_DISTANCE = 60;
/** How often to check which window is active (ms). */
const SIT_POLL_MS = 350;
/** Sit this far left of a window's right edge, clear of the minimise/maximise/close buttons. */
const SEAT_RIGHT_INSET = 150;
/** Windows the robot never sits on: desktop, taskbar, system popups. */
const SKIP_CLASSES = new Set([
  'Progman',
  'WorkerW',
  'Shell_TrayWnd',
  'Shell_SecondaryTrayWnd',
  'NotifyIconOverflowWindow',
  'TopLevelWindowForOverflowXamlIsland',
  'Windows.UI.Core.CoreWindow',
  'XamlExplorerHostIslandWindow',
  'ForegroundStaging',
  'MultitaskingViewFrame',
  '#32768', // menus
]);

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let voice: Voice | null = null;
let state: StoredState = { walk: true, sit: true, voice: true };

const logDir = path.join(app.getAppPath(), 'logs');
const eventLog = path.join(logDir, 'events.jsonl');
const placementLog = path.join(logDir, 'placement.log');

/** Preview mode: render the model once, save a PNG to this path, then quit (no hooks, no tray). */
const PREVIEW_OUT = process.env.COMPANION_PREVIEW;

if (!PREVIEW_OUT && !app.requestSingleInstanceLock()) {
  app.quit();
}

// ---------------------------------------------------------------------------------------------
// Positions: home spot, taskbar "floor", saved position
// ---------------------------------------------------------------------------------------------

function homePosition(): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay();
  return { x: workArea.x + workArea.width - WIN_W - RIGHT_MARGIN, y: workArea.y + workArea.height - WIN_H };
}

/** Saved position if it is still on a connected screen, otherwise the home spot. */
function startPosition(): { x: number; y: number } {
  const { x, y } = state;
  if (x !== undefined && y !== undefined && !PREVIEW_OUT) {
    const area = screen.getDisplayMatching({ x, y, width: WIN_W, height: WIN_H }).workArea;
    const inside = x + WIN_W > area.x && x < area.x + area.width && y + WIN_H > area.y && y <= area.y + area.height;
    if (inside) return { x, y };
  }
  return homePosition();
}

/** The work area of the screen the robot is on, and the y where its feet stand on the taskbar. */
function floorOf(bounds: Electron.Rectangle): { area: Electron.Rectangle; floorY: number } {
  const area = screen.getDisplayMatching(bounds).workArea;
  return { area, floorY: area.y + area.height - WIN_H };
}

function isOnFloor(): boolean {
  if (!win) return false;
  return Math.abs(win.getPosition()[1] - floorOf(win.getBounds()).floorY) <= 4;
}

function rememberPosition(): void {
  if (!win || PREVIEW_OUT || placement === 'sitting' || placement === 'resting') return;
  const [x, y] = win.getPosition();
  state = { ...state, x, y };
  saveState(state);
}

function settings(): CompanionSettings {
  return { walk: state.walk, sit: state.sit, voice: state.voice };
}

// ---------------------------------------------------------------------------------------------
// Sitting on the active window
// ---------------------------------------------------------------------------------------------

let placement: Placement = 'floor';
let returnPos: { x: number; y: number } | null = null;
/** Distance in px from the top of our window to the robot's body bottom (sent by the renderer). */
let seatOffset = 0;
let seatedHwnd = 0;
/** After the user drags the robot off a window, don't sit on that window again until focus changes. */
let ignoreHwnd = 0;
let lastDragAt = 0;
let noSeatTicks = 0;
const LEAVE_AFTER_TICKS = 3;
let hopping = false;
/** When to move the window after the hop starts: the clip's take-off (Hop peaks at frame 9 of 24 fps). */
const HOP_MOVE_MS = 300;

function setPlacement(next: Placement, why: string): void {
  if (next === placement) return;
  placement = next;
  win?.webContents.send('placement', placement);
  logPlacement(`${next} (${why})`);
}

function logPlacement(line: string): void {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(placementLog, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // Best effort.
  }
}

/** Where our window must go so the robot sits on the top edge of `fg`, or null if it can't. */
function seatFor(fg: ForegroundWindow): { x: number; y: number } | null {
  if (fg.minimized || fg.pid === process.pid || SKIP_CLASSES.has(fg.className)) return null;
  const r = screen.screenToDipRect(null, fg.rect);
  if (r.width < 420 || r.height < 200) return null;
  const area = screen.getDisplayMatching(r).workArea;
  const y = Math.round(r.y - seatOffset);
  if (y < area.y - 2) return null; // no room above the window (e.g. maximised)
  const x = Math.round(Math.max(r.x, r.x + r.width - WIN_W - SEAT_RIGHT_INSET));
  return { x, y };
}

/** Sprinting along the taskbar (a bug fix is running): don't sit on windows meanwhile. */
let roaming = false;
/** Where to stand up to after resting on the taskbar edge. */
let restReturn: { x: number; y: number } | null = null;

/** Window position that puts the robot's body bottom on the taskbar's top edge (legs over the taskbar). */
function restSeat(): { x: number; y: number } | null {
  if (!win || !seatOffset) return null;
  const { area } = floorOf(win.getBounds());
  return { x: win.getPosition()[0], y: Math.round(area.y + area.height - seatOffset) };
}

function sitDownOnTaskbar(): void {
  if (!win || hopping || placement !== 'floor') return;
  const seat = restSeat();
  if (!seat) return;
  const [x, y] = win.getPosition();
  restReturn = { x, y };
  hopTo(seat, () => setPlacement('resting', 'tired'));
}

function standUpFromTaskbar(why: string): void {
  if (!win || placement !== 'resting') return;
  const [x] = win.getPosition();
  const back = { x, y: restReturn?.y ?? floorOf(win.getBounds()).floorY };
  restReturn = null;
  hopTo(back, () => setPlacement('floor', why));
}

function sitTick(): void {
  if (!win || !state.sit || !seatOffset || roaming || Date.now() - lastDragAt < 1500) return;
  const fg = foregroundWindow();
  if (!fg) return;
  if (fg.pid === process.pid) return; // our own window or tray menu: keep whatever we're doing
  if (ignoreHwnd && fg.hwnd !== ignoreHwnd) ignoreHwnd = 0;

  if (hopping) return;
  const seat = fg.hwnd === ignoreHwnd ? null : seatFor(fg);
  noSeatTicks = seat ? 0 : noSeatTicks + 1;
  if (seat) {
    if (placement !== 'sitting') {
      // Hop from the taskbar (or wherever it is) up onto the window.
      const [x, y] = win.getPosition();
      // Resting on the taskbar edge: come back to standing on the taskbar, not to the resting spot.
      returnPos = placement === 'resting' ? { x, y: restReturn?.y ?? floorOf(win.getBounds()).floorY } : { x, y };
      restReturn = null;
      seatedHwnd = fg.hwnd;
      hopTo(seat, () => setPlacement('sitting', `${fg.exe || fg.className}`));
    } else if (fg.hwnd !== seatedHwnd) {
      // Hop across to another window.
      seatedHwnd = fg.hwnd;
      hopTo(seat);
    } else {
      // Same window moved or resized: just follow it.
      const [cx, cy] = win.getPosition();
      if (Math.abs(cx - seat.x) > 1 || Math.abs(cy - seat.y) > 1) win.setPosition(seat.x, seat.y);
    }
  } else if (placement === 'sitting' && noSeatTicks >= LEAVE_AFTER_TICKS) {
    // Only leave after ~1 s without a seat, so short-lived popups and menus don't make it hop.
    leaveSeat(`active: ${fg.exe || fg.className}${fg.maximized ? ' (maximised)' : ''}`);
  }
}

function leaveSeat(why: string, hop = true): void {
  if (!win) return;
  const back = returnPos ?? homePosition();
  returnPos = null;
  seatedHwnd = 0;
  const done = () => setPlacement(isOnFloor() ? 'floor' : 'free', why);
  if (hop) hopTo(back, done);
  else {
    win.setPosition(back.x, back.y);
    done();
  }
}

/** Play the hop animation, then move the window while the robot is in the air. */
function hopTo(pos: { x: number; y: number }, after?: () => void): void {
  if (!win) return;
  hopping = true;
  win.webContents.send('hop');
  setTimeout(() => {
    win?.setPosition(pos.x, pos.y);
    after?.();
    hopping = false;
  }, HOP_MOVE_MS);
}

// ---------------------------------------------------------------------------------------------
// Window, events, tray
// ---------------------------------------------------------------------------------------------

function createWindow(): void {
  const { x, y } = startPosition();
  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x,
    y,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required', // the robot speaks without being clicked first
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  // The timers below keep running while the app quits. Using a destroyed window throws
  // ("Object has been destroyed") and Electron shows a JS error dialog every tick, so drop it.
  win.on('closed', () => {
    win = null;
  });
  win.once('ready-to-show', () => {
    win?.showInactive();
    win?.webContents.send('settings', settings());
    placement = isOnFloor() ? 'floor' : 'free';
    win?.webContents.send('placement', placement);
  });

  // The taskbar can push itself above other topmost windows when clicked; re-assert periodically.
  setInterval(() => win?.setAlwaysOnTop(true, 'screen-saver'), 5000);

  // Feed the cursor position (relative to our window): the eyes follow it, and the renderer uses it
  // to decide when the window should catch clicks. Windows doesn't reliably forward mouse moves to a
  // click-through window, so this poll is what makes Rusty grabbable. Compare relative positions so
  // a window that walks under a still cursor also updates.
  let lastCursor = { x: Number.NaN, y: Number.NaN };
  setInterval(() => {
    if (!win) return;
    const p = screen.getCursorScreenPoint();
    const [wx, wy] = win.getPosition();
    const rel = { x: p.x - wx, y: p.y - wy };
    if (rel.x === lastCursor.x && rel.y === lastCursor.y) return;
    lastCursor = rel;
    win.webContents.send('cursor', rel);
  }, 33);

  if (PREVIEW_OUT) {
    const previewPlacement = process.env.COMPANION_PREVIEW_PLACEMENT as Placement | undefined;
    if (previewPlacement) setTimeout(() => win?.webContents.send('placement', previewPlacement), 1500);
    // A sequence of events: COMPANION_PREVIEW_EVENTS='[{"at":1000,"evt":{...}}, ...]'
    const previewEvents = process.env.COMPANION_PREVIEW_EVENTS;
    if (previewEvents) {
      for (const { at, evt } of JSON.parse(previewEvents) as { at: number; evt: HookEvent }[]) {
        setTimeout(() => win?.webContents.send('hook-event', evt), at);
      }
    }
    const previewHop = Number(process.env.COMPANION_PREVIEW_HOP);
    if (previewHop) setTimeout(() => win?.webContents.send('hop'), previewHop);
    const previewEvent = process.env.COMPANION_PREVIEW_EVENT;
    if (previewEvent) {
      // Show a given state in the preview, e.g. COMPANION_PREVIEW_EVENT=UserPromptSubmit.
      const last_assistant_message = process.env.COMPANION_PREVIEW_TEXT;
      setTimeout(() => win?.webContents.send('hook-event', { hook_event_name: previewEvent, last_assistant_message }), 4500);
    }
    setTimeout(async () => {
      const img = await win?.webContents.capturePage();
      if (img) fs.writeFileSync(PREVIEW_OUT, img.toPNG());
      app.quit();
    }, Number(process.env.COMPANION_PREVIEW_DELAY) || 2500);
  } else {
    setInterval(sitTick, SIT_POLL_MS);
  }
}

function sendEvent(evt: HookEvent): void {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(eventLog, JSON.stringify({ received_at: new Date().toISOString(), ...evt }) + '\n');
  } catch {
    // Logging is best effort.
  }
  win?.webContents.send('hook-event', evt);
}

function trayIcon(): Electron.NativeImage {
  // 16x16 BGRA bitmap: a little orange screen with a cream face area.
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = (py * size + px) * 4;
      const inScreen = px >= 4 && px <= 11 && py >= 3 && py <= 9;
      const [r, g, b] = inScreen ? [244, 237, 228] : [181, 96, 63];
      buf[i] = b;
      buf[i + 1] = g;
      buf[i + 2] = r;
      buf[i + 3] = px >= 2 && px <= 13 && py >= 1 && py <= 14 ? 255 : 0;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

/** Login item that starts this app (in dev: electron.exe with the project folder). */
function loginItem(): { path: string; args: string[] } {
  return app.isPackaged ? { path: process.execPath, args: [] } : { path: process.execPath, args: [app.getAppPath()] };
}

function createTray(): void {
  tray = new Tray(trayIcon());
  tray.setToolTip('Rusty');
  buildTrayMenu();
}

function toggle(key: 'walk' | 'sit' | 'voice', value: boolean): void {
  state = { ...state, [key]: value };
  saveState(state);
  win?.webContents.send('settings', settings());
  if (key === 'sit' && !value && placement === 'sitting') leaveSeat('sitting turned off', false);
  if (key === 'voice' && !value) voice?.cancel();
}

function startVoice(): void {
  voice = new Voice(
    (chunk) => win?.webContents.send('voice-chunk', chunk),
    (id) => win?.webContents.send('voice-end', id),
    (line) => logPlacement(`[voice] ${line}`),
  );
}

function buildTrayMenu(): void {
  if (!tray) return;
  const test = (hook_event_name: string, extra: Partial<HookEvent> = {}) => () =>
    sendEvent({ hook_event_name, session_id: 'tray-test', ...extra });
  const startsWithWindows = app.getLoginItemSettings(loginItem()).openAtLogin;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show me around (tour)', click: test('CompanionDemo') },
      { label: 'Showreel (30 s, for videos)', click: test('CompanionDemo', { reel: true }) },
      {
        label: 'Test states',
        submenu: [
          { label: 'Greet (SessionStart)', click: test('SessionStart') },
          { label: 'Think (UserPromptSubmit)', click: test('UserPromptSubmit') },
          { label: 'Work (PreToolUse: Edit)', click: test('PreToolUse', { tool_name: 'Edit' }) },
          { label: 'Browse (PreToolUse: browser)', click: test('PreToolUse', { tool_name: 'mcp__Claude_Browser__navigate' }) },
          { label: 'Needs permission', click: test('PermissionRequest', { tool_name: 'Bash' }) },
          {
            label: 'Done (Stop)',
            click: test('Stop', { last_assistant_message: 'All done! I fixed the bug and the tests pass now.' }),
          },
          { label: 'Error (StopFailure)', click: test('StopFailure') },
          { label: 'Sleep (idle)', click: test('Notification', { notification_type: 'idle_prompt' }) },
          { type: 'separator' },
          { label: 'Take notes', click: test('CompanionMood', { mood: 'researching' }) },
          { label: 'Sprint (bug fix)', click: test('CompanionMood', { mood: 'running' }) },
          { label: 'Get tired and sit down', click: test('CompanionMood', { mood: 'tired' }) },
          { label: 'Dance', click: test('CompanionMood', { mood: 'dancing' }) },
          { label: 'Knock (waiting nudge)', click: test('CompanionMood', { mood: 'nudge' }) },
          { label: 'Sip coffee', click: test('CompanionMood', { mood: 'sipping' }) },
        ],
      },
      { type: 'separator' },
      { label: 'Walk around when idle', type: 'checkbox', checked: state.walk, click: (i) => toggle('walk', i.checked) },
      { label: 'Sit on the active window', type: 'checkbox', checked: state.sit, click: (i) => toggle('sit', i.checked) },
      { label: 'Speak (voice)', type: 'checkbox', checked: state.voice, click: (i) => toggle('voice', i.checked) },
      {
        label: 'Start with Windows',
        type: 'checkbox',
        checked: startsWithWindows,
        click: (item) => {
          app.setLoginItemSettings({ ...loginItem(), openAtLogin: item.checked });
          buildTrayMenu();
        },
      },
      {
        label: 'Reset position',
        click: () => {
          if (placement === 'sitting') leaveSeat('reset', false);
          win?.setPosition(homePosition().x, homePosition().y);
          setPlacement('floor', 'reset');
          rememberPosition();
        },
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
}

function modelPath(): string {
  return process.env.COMPANION_MODEL ?? path.join(app.getAppPath(), 'assets', 'robot.glb');
}

// ---------------------------------------------------------------------------------------------
// IPC from the renderer
// ---------------------------------------------------------------------------------------------

ipcMain.on('set-ignore-mouse', (_e, ignore: boolean) => {
  win?.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
});

ipcMain.on('move-by', (_e, dx: number, dy: number) => {
  if (!win) return;
  lastDragAt = Date.now();
  const [x, y] = win.getPosition();
  win.setPosition(Math.round(x + dx), Math.round(y + dy));
});

/** End of a drag: leave any seat, snap onto the taskbar if dropped close to it, remember the spot. */
ipcMain.on('drag-end', () => {
  if (!win) return;
  lastDragAt = Date.now();
  if (placement === 'sitting') {
    ignoreHwnd = seatedHwnd;
    seatedHwnd = 0;
    returnPos = null;
  }
  const { floorY } = floorOf(win.getBounds());
  const [x, y] = win.getPosition();
  if (Math.abs(y - floorY) <= SNAP_DISTANCE) win.setPosition(x, floorY);
  setPlacement(isOnFloor() ? 'floor' : 'free', 'dragged');
  rememberPosition();
});

/** One walking step along the taskbar. Only moves when the robot stands on the taskbar line. */
ipcMain.handle('walk-by', (_e, dx: number): WalkResult => {
  if (!win || placement === 'sitting') return { onFloor: false, blocked: true };
  const { area, floorY } = floorOf(win.getBounds());
  const [x, y] = win.getPosition();
  if (Math.abs(y - floorY) > 4) return { onFloor: false, blocked: true };
  const want = Math.round(x + dx);
  const nx = Math.min(Math.max(want, area.x), area.x + area.width - WIN_W);
  if (nx !== x || y !== floorY) win.setPosition(nx, floorY);
  rememberPosition();
  return { onFloor: true, blocked: nx !== want };
});

/** Speak a line (the renderer decides what). Returns the line's id, used to match its audio chunks. */
ipcMain.handle('speak', (_e, text: string): number => {
  if (!voice || !state.voice || !text.trim()) return 0;
  return voice.speak(text);
});

ipcMain.on('roam', (_e, on: boolean) => {
  roaming = Boolean(on);
  if (!roaming) return;
  if (placement === 'sitting') leaveSeat('sprint');
  else if (placement === 'resting') standUpFromTaskbar('sprint');
});

ipcMain.on('rest', (_e, on: boolean) => {
  if (on) sitDownOnTaskbar();
  else standUpFromTaskbar('woke up');
});

ipcMain.on('seat-offset', (_e, px: number) => {
  seatOffset = Math.max(0, Math.round(px));
});

ipcMain.handle('load-model', () => {
  const p = modelPath();
  return fs.existsSync(p) ? new Uint8Array(fs.readFileSync(p)) : null;
});

app.whenReady().then(() => {
  state = loadState();
  createWindow();
  if (PREVIEW_OUT) return;
  createTray();
  startHookServer(PORT, sendEvent);
  startVoice();
});

app.on('window-all-closed', () => app.quit());
