// Adds (or removes with --uninstall) the companion's `http` hooks in ~/.claude/settings.json.
// A timestamped backup of the settings file is written first. Only entries pointing at the
// companion URL are touched, so other hooks are left alone.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const port = Number(process.env.COMPANION_PORT ?? 47821);
const URL = `http://127.0.0.1:${port}/event`;
const uninstall = process.argv.includes('--uninstall');
const settingsPath = path.join(homedir(), '.claude', 'settings.json');

const EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolBatch',
  'PermissionRequest',
  'Notification',
  'MessageDisplay',
  'Stop',
  'StopFailure',
  'SubagentStart',
  'SubagentStop',
  'SessionEnd',
];
const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'PermissionRequest']);

const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {};
if (existsSync(settingsPath)) {
  const backup = `${settingsPath}.companion-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  copyFileSync(settingsPath, backup);
  console.log('Backup written to', backup);
}

const isOurs = (h) => h && h.type === 'http' && typeof h.url === 'string' && h.url.startsWith(URL);
settings.hooks ??= {};

// Remove any existing companion entries first (makes install idempotent).
for (const [event, groups] of Object.entries(settings.hooks)) {
  if (!Array.isArray(groups)) continue;
  const kept = groups
    .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !isOurs(h)) }))
    .filter((g) => g.hooks.length > 0);
  if (kept.length) settings.hooks[event] = kept;
  else delete settings.hooks[event];
}

if (!uninstall) {
  for (const event of EVENTS) {
    const group = { hooks: [{ type: 'http', url: URL, timeout: 5 }] };
    if (TOOL_EVENTS.has(event)) group.matcher = '*';
    (settings.hooks[event] ??= []).push(group);
  }
}
if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log(uninstall ? 'Companion hooks removed from' : `Companion hooks for ${EVENTS.length} events added to`, settingsPath);
