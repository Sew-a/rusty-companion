import { describe, expect, it } from 'vitest';
import { MORE_OFFER, reactionFor, splitSpeech, summarize } from '../src/renderer/stateMachine';

const ev = (hook_event_name: string, extra: Record<string, unknown> = {}) => ({ hook_event_name, session_id: 's', ...extra });

describe('reactionFor', () => {
  it.each([
    ['SessionStart', {}, 'greet'],
    ['UserPromptSubmit', {}, 'thinking'],
    ['PreToolUse', { tool_name: 'Edit' }, 'working'],
    ['PreToolUse', { tool_name: 'Bash' }, 'working'],
    ['PreToolUse', { tool_name: 'Read' }, 'researching'],
    ['PreToolUse', { tool_name: 'Grep' }, 'researching'],
    ['PreToolUse', { tool_name: 'WebSearch' }, 'browsing'],
    ['PreToolUse', { tool_name: 'mcp__Claude_Browser__navigate' }, 'browsing'],
    ['PreToolUse', { tool_name: 'AskUserQuestion' }, 'idle'],
    ['PostToolUse', {}, 'thinking'],
    ['SubagentStart', {}, 'working'],
    ['SubagentStop', {}, 'thinking'],
    ['PermissionRequest', { tool_name: 'Bash' }, 'permission'],
    ['Notification', { notification_type: 'permission_prompt' }, 'permission'],
    ['Notification', { notification_type: 'idle_prompt' }, 'sleep'],
    ['MessageDisplay', { delta: 'Hello there' }, 'talking'],
    ['Stop', {}, 'happy'],
    ['StopFailure', {}, 'error'],
    ['SessionEnd', {}, 'bye'],
  ])('%s %o -> %s', (name, extra, mood) => {
    expect(reactionFor(ev(name, extra))?.mood).toBe(mood);
  });

  it('ignores unknown events and empty deltas', () => {
    expect(reactionFor(ev('Whatever'))).toBeNull();
    expect(reactionFor(ev('MessageDisplay', { delta: '  ' }))).toBeNull();
    expect(reactionFor(ev('Notification', { notification_type: 'other' }))).toBeNull();
  });

  it('marks states that wait on Sev', () => {
    expect(reactionFor(ev('PermissionRequest'))?.waiting).toBe(true);
    expect(reactionFor(ev('PreToolUse', { tool_name: 'ExitPlanMode' }))?.waiting).toBe(true);
    expect(reactionFor(ev('PreToolUse', { tool_name: 'Edit' }))?.waiting).toBeUndefined();
  });

  it('names the tool in permission bubbles', () => {
    expect(reactionFor(ev('PermissionRequest', { tool_name: 'mcp__github__create_pr' }))?.bubble).toContain('create_pr');
  });

  it('speaks three sentences of a long reply and offers the rest', () => {
    const r = reactionFor(ev('Stop', { last_assistant_message: 'One. Two. Three. Four. Five.' }))!;
    expect(r.speech).toBe(`One. Two. Three. ${MORE_OFFER}`);
    expect(r.more).toBe('Four. Five.');
    expect(r.holdSeconds).toBe(25);
  });

  it('reads the whole reply in discussion mode', () => {
    const r = reactionFor(ev('Stop', { last_assistant_message: 'A. B. C. D. E.\n<!-- rusty:discussion -->' }))!;
    expect(r.mood).toBe('talking');
    expect(r.speech).toBe('A. B. C. D. E.');
    expect(r.more).toBeUndefined();
  });
});

describe('splitSpeech', () => {
  it('drops code blocks, inline code, links and list markers', () => {
    const { head } = splitSpeech('# Title\n- Use `npm test` now\n```js\nx()\n```\nSee [docs](http://x).', 5);
    expect(head).toBe('Title. Use npm test now. See docs.');
  });

  it('prefers a <spoken> tag', () => {
    expect(splitSpeech('ignored <spoken>Say this.</spoken> ignored', 1)).toEqual({ head: 'Say this.', rest: null });
  });

  it('cuts a very long rest and points to the chat', () => {
    const long = Array.from({ length: 400 }, (_, i) => `Sentence ${i}.`).join(' ');
    const { rest } = splitSpeech(long, 3);
    expect(rest!.length).toBeLessThan(1600);
    expect(rest).toMatch(/The rest is in the chat\.$/);
  });
});

describe('summarize', () => {
  it('keeps short text and strips markdown', () => {
    expect(summarize('**Done** with `x`.', 160)).toBe('Done with x.');
  });
  it('cuts at a sentence end when possible', () => {
    const s = summarize('This is the first sentence of the reply here. And this second one is long enough to cut.', 60);
    expect(s).toBe('This is the first sentence of the reply here.');
  });
});
