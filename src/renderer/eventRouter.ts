import type { HookEvent } from '../shared/events';
import { SessionFilter } from './sessionFilter';
import { BUSY_TIMEOUT_SECONDS, IN_TURN_EVENTS, isBrowserTool, reactionFor, type Mood, type Reaction } from './stateMachine';

/** Events whose bubble text (or speech) Rusty says aloud. */
export const SPOKEN_EVENTS = new Set(['SessionStart', 'PermissionRequest', 'Notification', 'Stop', 'StopFailure', 'SessionEnd']);

/** A turn at least this long ends with a dance instead of the usual cheer. */
export const DANCE_AFTER_SECONDS = 7 * 60;

/** Prompts that sound like a bug fix: Rusty sprints while Claude works on them. */
const FIX_PROMPT = /\b(fix(es|ed|ing)?|bugs?|buggy|broken|breaks?|crash(es|ed|ing)?|errors?|failing|fails?|hotfix)\b/i;
/** Prompts that call a coffee break ("coffee time", "let's have a coffee"): Rusty sips from his mug. */
const COFFEE_PROMPT = /\bcoffee\b/i;
/** Skills and subagents that mean "researching": Rusty takes notes. */
const RESEARCH_HINT = /research|explor|investigat/i;
/** Moods that mean Claude is busy (Rusty may take notes or sprint instead). */
const BUSY_MOODS = new Set<Mood>(['thinking', 'working', 'browsing', 'researching']);

export interface Routed {
  reaction: Reaction;
  /** What to say aloud (undefined = nothing). */
  speak?: string;
  /** The rest of a long reply, offered as "click to hear the rest". */
  offerMore?: string;
  /** Stop any speech in progress (a new prompt). */
  stopSpeech: boolean;
  /** Dance instead of cheering (the turn was long). */
  dance: boolean;
  /** Sev called coffee time: Rusty sips from his mug. */
  coffee: boolean;
}

/**
 * Turns hook events into what Rusty does. Pure (time is passed in), so it can be tested without
 * Electron. Keeps the per-turn state: whether a turn is running, when it started, whether it is a
 * fix (sprint) and whether it is research (notes).
 */
export class EventRouter {
  readonly sessions = new SessionFilter();
  /** True between your prompt (UserPromptSubmit) and Claude's final reply (Stop). */
  turnActive = false;
  turnStart = 0;
  /** The current turn's prompt sounds like a bug fix. */
  fixTurn = false;
  /** The current turn is research (deep research skill, explore agent, or several web tools). */
  research = false;
  /** Time of the last accepted Claude event (0 = none yet). */
  lastEventAt = 0;
  private webTools = 0;

  handle(evt: HookEvent, t: number, voiceEnabled: boolean): Routed | null {
    if (!this.sessions.accept(evt)) return null;
    const name = evt.hook_event_name ?? '';
    if (name === 'UserPromptSubmit') this.startTurn(evt, t);
    // Busy signals outside a turn come from background helpers: ignore them (no dots after replies).
    if (IN_TURN_EVENTS.has(name) && !this.turnActive) return null;
    const turnSeconds = this.turnActive ? t - this.turnStart : 0;
    if (name === 'Stop' || name === 'StopFailure' || name === 'SessionEnd') this.endTurn();
    this.lastEventAt = t;

    const base = reactionFor(evt);
    if (!base) return null;
    let reaction = base;

    if (this.turnActive) {
      const startedResearch = !this.research && this.isResearch(evt);
      if (startedResearch) this.research = true;
      if (this.research && BUSY_MOODS.has(reaction.mood)) {
        reaction = { ...reaction, mood: 'researching', bubble: startedResearch ? 'Let me take some notes.' : undefined };
      }
    }

    const dance = name === 'Stop' && reaction.mood === 'happy' && turnSeconds >= DANCE_AFTER_SECONDS;
    const coffee = name === 'UserPromptSubmit' && typeof evt.prompt === 'string' && COFFEE_PROMPT.test(evt.prompt);
    if (coffee) reaction = { ...reaction, bubble: 'Coffee time!' };
    const routed: Routed = { reaction, stopSpeech: name === 'UserPromptSubmit', dance, coffee };
    if (reaction.more && voiceEnabled && reaction.bubble) routed.offerMore = reaction.more;
    if (SPOKEN_EVENTS.has(name)) {
      // With voice off there is nobody to "click to hear the rest", so don't offer it.
      routed.speak = reaction.more && !voiceEnabled ? reaction.bubble : (reaction.speech ?? reaction.bubble);
    }
    return routed;
  }

  /** True while Rusty should sprint: a fix turn is running and Claude is busy (not waiting on Sev). */
  shouldRun(mood: Mood): boolean {
    return this.turnActive && this.fixTurn && BUSY_MOODS.has(mood);
  }

  /** Claude went quiet while "busy" for too long: assume it was interrupted. */
  busyTimedOut(mood: Mood, t: number): boolean {
    const busy = BUSY_MOODS.has(mood) || mood === 'talking';
    return busy && this.lastEventAt > 0 && t - this.lastEventAt > BUSY_TIMEOUT_SECONDS;
  }

  private startTurn(evt: HookEvent, t: number): void {
    this.turnActive = true;
    this.turnStart = t;
    this.webTools = 0;
    this.research = false;
    this.fixTurn = typeof evt.prompt === 'string' && FIX_PROMPT.test(evt.prompt);
  }

  private endTurn(): void {
    this.turnActive = false;
    this.fixTurn = false;
    this.research = false;
  }

  private isResearch(evt: HookEvent): boolean {
    const name = evt.hook_event_name;
    const tool = typeof evt.tool_name === 'string' ? evt.tool_name : '';
    if (name === 'SubagentStart') return typeof evt.agent_type === 'string' && RESEARCH_HINT.test(evt.agent_type);
    if (name !== 'PreToolUse') return false;
    const input = (evt.tool_input ?? {}) as Record<string, unknown>;
    if (tool === 'Skill') return RESEARCH_HINT.test(String(input.skill ?? ''));
    if (tool === 'Agent' || tool === 'Task') {
      return RESEARCH_HINT.test(`${input.subagent_type ?? ''} ${input.description ?? ''}`);
    }
    if (isBrowserTool(tool)) return ++this.webTools >= 2;
    return false;
  }
}
