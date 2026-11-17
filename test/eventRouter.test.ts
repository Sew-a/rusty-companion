import { describe, expect, it } from 'vitest';
import { DANCE_AFTER_SECONDS, EventRouter } from '../src/renderer/eventRouter';

const ev = (hook_event_name: string, extra: Record<string, unknown> = {}) => ({ hook_event_name, session_id: 's', ...extra });

function inTurn(prompt = 'hello', t = 0): EventRouter {
  const r = new EventRouter();
  r.handle(ev('UserPromptSubmit', { prompt }), t, true);
  return r;
}

const tool = (tool_name: string, tool_input?: Record<string, unknown>) => ev('PreToolUse', { tool_name, tool_input });

describe('EventRouter turn gating', () => {
  it('ignores the background SubagentStop after a reply (no thinking dots)', () => {
    const r = inTurn();
    expect(r.handle(ev('Stop', { last_assistant_message: 'Done.' }), 10, true)?.reaction.mood).toBe('happy');
    expect(r.handle(ev('SubagentStop'), 15, true)).toBeNull();
    expect(r.handle(tool('Edit'), 16, true)).toBeNull();
  });

  it('shows busy moods during a turn', () => {
    const r = inTurn();
    expect(r.handle(tool('Edit'), 1, true)?.reaction.mood).toBe('working');
    expect(r.handle(ev('PostToolUse'), 2, true)?.reaction.mood).toBe('thinking');
  });

  it('stops speech on a new prompt and speaks replies', () => {
    const r = new EventRouter();
    expect(r.handle(ev('UserPromptSubmit'), 0, true)?.stopSpeech).toBe(true);
    expect(r.handle(ev('Stop', { last_assistant_message: 'All good.' }), 1, true)?.speak).toBe('All good.');
  });

  it('offers the rest of a long reply only with voice on', () => {
    const msg = { last_assistant_message: 'One. Two. Three. Four.' };
    const on = inTurn().handle(ev('Stop', msg), 1, true)!;
    expect(on.offerMore).toBe('Four.');
    const off = inTurn().handle(ev('Stop', msg), 1, false)!;
    expect(off.offerMore).toBeUndefined();
    expect(off.speak).toBe(off.reaction.bubble);
  });

  it('times out a busy mood after a long silence', () => {
    const r = inTurn();
    r.handle(tool('Edit'), 1, true);
    expect(r.busyTimedOut('working', 100)).toBe(false);
    expect(r.busyTimedOut('working', 1000)).toBe(true);
    expect(r.busyTimedOut('idle', 1000)).toBe(false);
  });
});

describe('EventRouter research (notes)', () => {
  it('starts taking notes on the second web tool of a turn', () => {
    const r = inTurn();
    expect(r.handle(tool('WebSearch'), 1, true)?.reaction.mood).toBe('browsing');
    const second = r.handle(tool('WebFetch'), 2, true)!;
    expect(second.reaction.mood).toBe('researching');
    expect(second.reaction.bubble).toBe('Let me take some notes.');
    // Stays on notes for the rest of the turn, without repeating the line.
    expect(r.handle(tool('Edit'), 3, true)!.reaction).toMatchObject({ mood: 'researching', bubble: undefined });
  });

  it('takes notes for research skills and explore agents', () => {
    const mood = (e: ReturnType<typeof ev>) => inTurn().handle(e, 1, true)?.reaction.mood;
    expect(mood(tool('Skill', { skill: 'anthropic-skills:deep-research' }))).toBe('researching');
    expect(mood(tool('Agent', { subagent_type: 'Explore' }))).toBe('researching');
    expect(mood(ev('SubagentStart', { agent_type: 'Explore' }))).toBe('researching');
    expect(mood(tool('Agent', { subagent_type: 'general-purpose', description: 'write code' }))).toBe('working');
  });

  it('still asks for permission while researching, and resets next turn', () => {
    const r = inTurn();
    r.handle(tool('Skill', { skill: 'deep-research' }), 1, true);
    expect(r.handle(ev('PermissionRequest', { tool_name: 'Bash' }), 2, true)?.reaction.mood).toBe('permission');
    r.handle(ev('Stop'), 3, true);
    r.handle(ev('UserPromptSubmit'), 4, true);
    expect(r.handle(tool('Edit'), 5, true)?.reaction.mood).toBe('working');
  });
});

describe('EventRouter fixes (sprint)', () => {
  it.each(['fix the login', 'there is a bug in X', 'tests are failing', 'it crashes on start', 'quick hotfix please'])(
    'sprints for "%s"',
    (prompt) => {
      expect(inTurn(prompt).shouldRun('working')).toBe(true);
    },
  );

  it('does not sprint for other prompts, when waiting, or after the turn', () => {
    expect(inTurn('add a dance animation').shouldRun('working')).toBe(false);
    const r = inTurn('fix it');
    expect(r.shouldRun('permission')).toBe(false);
    r.handle(ev('Stop'), 5, true);
    expect(r.shouldRun('working')).toBe(false);
  });
});

describe('EventRouter dance', () => {
  it('dances only after a long turn', () => {
    expect(inTurn('x', 0).handle(ev('Stop'), 60, true)?.dance).toBe(false);
    expect(inTurn('x', 0).handle(ev('Stop'), DANCE_AFTER_SECONDS + 1, true)?.dance).toBe(true);
  });

  it('does not dance for discussion replies or errors', () => {
    const msg = { last_assistant_message: 'Hi.\n<!-- rusty:discussion -->' };
    expect(inTurn('x', 0).handle(ev('Stop', msg), 9999, true)?.dance).toBe(false);
    expect(inTurn('x', 0).handle(ev('StopFailure'), 9999, true)?.dance).toBe(false);
  });
});
