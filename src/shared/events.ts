/** The JSON body Claude Code POSTs for each hook event. Every field is optional on purpose:
 *  different Claude Code versions send different fields, and the companion must tolerate that. */
export interface HookEvent {
  hook_event_name?: string;
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: unknown;
  notification_type?: string;
  message?: string;
  last_assistant_message?: string;
  delta?: string;
  [key: string]: unknown;
}

export const DEFAULT_PORT = 47821;
