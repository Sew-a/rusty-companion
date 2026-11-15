import type { HookEvent } from '../shared/events';

/** Test events from the tray menu and the test script always get through. */
const ALWAYS = new Set(['tray-test', 'manual-test']);

/**
 * Decides which Claude Code session the robot follows.
 *
 * The "active" session is the one you last typed a prompt into (UserPromptSubmit). Events from
 * other sessions, such as background or helper sessions, are ignored, except permission requests,
 * because any session waiting for your OK needs your attention.
 */
export class SessionFilter {
  private active: string | null = null;

  get activeSession(): string | null {
    return this.active;
  }

  accept(evt: HookEvent): boolean {
    const sid = typeof evt.session_id === 'string' ? evt.session_id : '';
    const name = evt.hook_event_name;
    if (!sid || ALWAYS.has(sid)) return true;

    if (name === 'UserPromptSubmit') {
      this.active = sid;
      return true;
    }
    if (name === 'PermissionRequest' || (name === 'Notification' && evt.notification_type === 'permission_prompt')) {
      return true;
    }
    if (this.active === null) {
      // Nothing followed yet: adopt a session when it starts, ignore stray events.
      if (name === 'SessionStart') {
        this.active = sid;
        return true;
      }
      return false;
    }
    if (sid !== this.active) return false;
    if (name === 'SessionEnd') this.active = null;
    return true;
  }
}
