import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { CompanionSettings } from '../shared/settings';

/** Persisted app state, kept in the user's app-data folder (not in the project). */
export interface StoredState extends CompanionSettings {
  x?: number;
  y?: number;
}

const DEFAULTS: StoredState = { walk: true, sit: true, voice: true };

const file = () => path.join(app.getPath('userData'), 'companion-state.json');

export function loadState(): StoredState {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

let pending: NodeJS.Timeout | null = null;

/** Debounced save, so frequent moves (dragging, walking) don't hammer the disk. */
export function saveState(state: StoredState): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    try {
      fs.mkdirSync(path.dirname(file()), { recursive: true });
      fs.writeFileSync(file(), JSON.stringify(state, null, 2));
    } catch {
      // Best effort.
    }
  }, 500);
}
