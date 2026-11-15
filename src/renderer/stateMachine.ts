import type { HookEvent } from '../shared/events';

export type Mood =
  | 'idle'
  | 'greet'
  | 'thinking'
  | 'working'
  | 'browsing'
  | 'permission'
  | 'talking'
  | 'happy'
  | 'error'
  | 'sleep'
  | 'bye'
  /** Not driven by Claude: an idle stroll along the taskbar. */
  | 'walking';

export interface Reaction {
  mood: Mood;
  bubble?: string;
  /** What to say aloud, if different from the bubble (e.g. the first sentences of a reply). */
  speech?: string;
  /** The rest of a long reply, read aloud if you click the bubble. */
  more?: string;
  /** Seconds before falling back to idle. Undefined = stay until the next event. */
  holdSeconds?: number;
}

export const USER_NAME = 'Sev';
export const ROBOT_NAME = 'Rusty';

const BROWSER_TOOL = /^(WebFetch|WebSearch|mcp__Claude_Browser__|mcp__claude-in-chrome__|mcp__.*playwright.*__browser_|mcp__computer-use__)/;

/** Tools that pause Claude until you answer. */
const WAITING_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode']);

/** Events that only mean "Claude is busy" while a turn is running (between your prompt and the final
 *  reply). Outside a turn they come from background helpers, e.g. the desktop app fires a
 *  SubagentStop a few seconds after every reply, and must not make Rusty look busy. */
export const IN_TURN_EVENTS = new Set([
  'PreToolUse',
  'PostToolUse',
  'PostToolBatch',
  'SubagentStart',
  'SubagentStop',
  'MessageDisplay',
]);

/** If nothing arrives for this long while "busy", assume Claude was interrupted and go idle. */
export const BUSY_TIMEOUT_SECONDS = 300;

export function reactionFor(evt: HookEvent): Reaction | null {
  const name = evt.hook_event_name ?? '';
  const tool = typeof evt.tool_name === 'string' ? evt.tool_name : '';

  switch (name) {
    case 'SessionStart':
      return { mood: 'greet', bubble: `Hello ${USER_NAME}, what can I do?`, holdSeconds: 4 };
    case 'UserPromptSubmit':
      return { mood: 'thinking' };
    case 'PreToolUse':
      // Tools that wait for YOU (a question, plan approval): no dots, just "your turn".
      if (WAITING_TOOLS.has(tool)) return { mood: 'idle', bubble: 'Your turn! I asked you something.', holdSeconds: 12 };
      if (BROWSER_TOOL.test(tool)) return { mood: 'browsing', bubble: 'Let me look at this…' };
      return { mood: 'working' };
    case 'PostToolUse':
    case 'PostToolBatch':
    case 'SubagentStop':
      return { mood: 'thinking' };
    case 'SubagentStart':
      return { mood: 'working' };
    case 'PermissionRequest':
      return { mood: 'permission', bubble: tool ? `I need your OK to use ${shortTool(tool)}.` : 'I need your OK!' };
    case 'Notification':
      if (evt.notification_type === 'permission_prompt') return { mood: 'permission', bubble: 'I need your OK!' };
      if (evt.notification_type === 'idle_prompt') return { mood: 'sleep', holdSeconds: undefined };
      return null;
    case 'MessageDisplay':
      return typeof evt.delta === 'string' && evt.delta.trim()
        ? { mood: 'talking', bubble: summarize(evt.delta, 160) }
        : null;
    case 'Stop': {
      const raw = typeof evt.last_assistant_message === 'string' ? evt.last_assistant_message : '';
      if (!raw) return { mood: 'happy', bubble: 'Done!', speech: 'Done!', holdSeconds: 8 };
      const text = raw.replace(/<!--[\s\S]*?-->/g, '').trim();
      if (DISCUSSION_MARKER.test(raw)) {
        // Discussion mode: read the whole (short, conversational) reply, no "there's more" offer.
        const { head, rest } = splitSpeech(text, 100);
        return {
          mood: 'talking',
          bubble: summarize(text, 160),
          speech: rest ? `${head} ${rest}` : head,
          holdSeconds: 20,
        };
      }
      const { head, rest } = splitSpeech(text, 3);
      return {
        mood: 'happy',
        bubble: summarize(text, 160),
        speech: rest ? `${head} ${MORE_OFFER}` : head,
        more: rest ?? undefined,
        // Keep the bubble up longer when there's more to hear, so there's time to click it.
        holdSeconds: rest ? 25 : 8,
      };
    }
    case 'StopFailure':
      return { mood: 'error', bubble: 'Oops, something went wrong.', holdSeconds: 6 };
    case 'SessionEnd':
      return { mood: 'bye', bubble: 'Bye!', holdSeconds: 3 };
    default:
      return null;
  }
}

function shortTool(tool: string): string {
  const parts = tool.split('__');
  return parts[parts.length - 1] || tool;
}

/** Hidden marker the "discussion" Claude Code skill puts at the end of discussion replies. */
const DISCUSSION_MARKER = /<!--\s*rusty:discussion\s*-->/i;

/** Said after the first sentences when a reply is longer. */
export const MORE_OFFER = "There's more in my reply. Click my bubble and I'll read the rest, or read it in the chat.";
/** Longest "rest" read aloud on request; beyond this the robot points you to the chat. */
const MAX_REST = 1500;

/** A reply split for speaking: the first `count` sentences or lines, and the rest (null if none).
 *  Markdown, code blocks and links are cleaned out. A <spoken>…</spoken> tag, if present, wins. */
export function splitSpeech(text: string, count: number): { head: string; rest: string | null } {
  const tagged = text.match(/<spoken>([\s\S]*?)<\/spoken>/i);
  if (tagged) return { head: tagged[1].trim(), rest: null };
  const cleaned = text
    .replace(/```[\s\S]*?```/g, '\n')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(#+|[-*+]|\d+\.|>|\|)\s*/gm, '')
    .replace(/[*_~|]/g, '');
  const pieces: string[] = [];
  for (const line of cleaned.split(/\n+/)) {
    for (const s of line.match(/[^.!?]+[.!?]*/g) ?? []) {
      const p = s.trim();
      if (p.length > 1) pieces.push(/[.!?]$/.test(p) ? p : `${p}.`);
    }
  }
  const head = pieces.slice(0, count).join(' ');
  const restPieces = pieces.slice(count);
  if (!restPieces.length) return { head, rest: null };
  let rest = restPieces.join(' ');
  if (rest.length > MAX_REST) {
    rest = rest.slice(0, MAX_REST).replace(/\s+\S*$/, '') + '. The rest is in the chat.';
  }
  return { head, rest };
}

/** Strip markdown/code and keep the first sentence or two, for bubbles. */
export function summarize(text: string, maxLen: number): string {
  const tagged = text.match(/<spoken>([\s\S]*?)<\/spoken>/i);
  let t = tagged ? tagged[1] : text;
  t = t
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen);
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return sentenceEnd > 40 ? cut.slice(0, sentenceEnd + 1) : cut.replace(/\s+\S*$/, '') + '…';
}
