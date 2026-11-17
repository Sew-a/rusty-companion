import { describe, expect, it } from 'vitest';
import { SessionFilter } from '../src/renderer/sessionFilter';

const ev = (hook_event_name: string, session_id: string, extra: Record<string, unknown> = {}) => ({
  hook_event_name,
  session_id,
  ...extra,
});

describe('SessionFilter', () => {
  it('adopts a starting session, then follows the one you last typed into', () => {
    const f = new SessionFilter();
    expect(f.accept(ev('PreToolUse', 'a'))).toBe(false);
    expect(f.accept(ev('SessionStart', 'a'))).toBe(true);
    expect(f.accept(ev('PreToolUse', 'b'))).toBe(false);
    expect(f.accept(ev('UserPromptSubmit', 'b'))).toBe(true);
    expect(f.activeSession).toBe('b');
    expect(f.accept(ev('Stop', 'a'))).toBe(false);
  });

  it('lets permission requests through from any session', () => {
    const f = new SessionFilter();
    f.accept(ev('UserPromptSubmit', 'a'));
    expect(f.accept(ev('PermissionRequest', 'x'))).toBe(true);
    expect(f.accept(ev('Notification', 'x', { notification_type: 'permission_prompt' }))).toBe(true);
    expect(f.accept(ev('Notification', 'x', { notification_type: 'idle_prompt' }))).toBe(false);
  });

  it('forgets the session when it ends', () => {
    const f = new SessionFilter();
    f.accept(ev('UserPromptSubmit', 'a'));
    expect(f.accept(ev('SessionEnd', 'a'))).toBe(true);
    expect(f.activeSession).toBeNull();
  });

  it('always accepts test events and events without a session', () => {
    const f = new SessionFilter();
    expect(f.accept(ev('Stop', 'manual-test'))).toBe(true);
    expect(f.accept({ hook_event_name: 'Stop' })).toBe(true);
  });
});
