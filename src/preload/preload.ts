import { contextBridge, ipcRenderer } from 'electron';
import type { HookEvent } from '../shared/events';
import type { CompanionSettings, Placement, WalkResult } from '../shared/settings';

const api = {
  onEvent(cb: (evt: HookEvent) => void): void {
    ipcRenderer.on('hook-event', (_e, evt: HookEvent) => cb(evt));
  },
  onSettings(cb: (settings: CompanionSettings) => void): void {
    ipcRenderer.on('settings', (_e, s: CompanionSettings) => cb(s));
  },
  onPlacement(cb: (placement: Placement) => void): void {
    ipcRenderer.on('placement', (_e, p: Placement) => cb(p));
  },
  /** Cursor position relative to the top-left of the robot's window, in px. */
  onCursor(cb: (pos: { x: number; y: number }) => void): void {
    ipcRenderer.on('cursor', (_e, pos: { x: number; y: number }) => cb(pos));
  },
  /** Ask for a line to be spoken. Resolves to the line id (0 if voice is off). */
  speak(text: string): Promise<number> {
    return ipcRenderer.invoke('speak', text);
  },
  onVoiceChunk(cb: (chunk: { id: number; rate: number; samples: Float32Array }) => void): void {
    ipcRenderer.on('voice-chunk', (_e, c) => cb(c));
  },
  onVoiceEnd(cb: (id: number) => void): void {
    ipcRenderer.on('voice-end', (_e, id: number) => cb(id));
  },
  /** The main process is about to move the window to a new spot: play the hop animation. */
  onHop(cb: () => void): void {
    ipcRenderer.on('hop', () => cb());
  },
  setIgnoreMouse(ignore: boolean): void {
    ipcRenderer.send('set-ignore-mouse', ignore);
  },
  moveBy(dx: number, dy: number): void {
    ipcRenderer.send('move-by', dx, dy);
  },
  dragEnd(): void {
    ipcRenderer.send('drag-end');
  },
  walkBy(dx: number): Promise<WalkResult> {
    return ipcRenderer.invoke('walk-by', dx);
  },
  /** Tell the main process how far below the window top the robot's body bottom is (for sitting). */
  setSeatOffset(px: number): void {
    ipcRenderer.send('seat-offset', px);
  },
  loadModel(): Promise<Uint8Array | null> {
    return ipcRenderer.invoke('load-model');
  },
  /** Sprint mode: leave any window seat and stay on the taskbar (true), or allow sitting again (false). */
  setRoam(on: boolean): void {
    ipcRenderer.send('roam', on);
  },
  /** Sit down on the taskbar edge (true) or stand back up onto it (false). */
  setRest(on: boolean): void {
    ipcRenderer.send('rest', on);
  },
};

export type CompanionApi = typeof api;

contextBridge.exposeInMainWorld('companion', api);
