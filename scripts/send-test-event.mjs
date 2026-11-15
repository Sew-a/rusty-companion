// Sends a fake hook event to the running companion, e.g.:
//   npm run test-event -- Stop "All done, tests pass."
//   npm run test-event -- PreToolUse mcp__Claude_Browser__navigate
const [name = 'SessionStart', arg] = process.argv.slice(2);
const port = Number(process.env.COMPANION_PORT ?? 47821);

const body = { hook_event_name: name, session_id: 'manual-test' };
if (name === 'Stop') body.last_assistant_message = arg ?? 'Done! Everything worked.';
else if (name === 'PreToolUse' || name === 'PermissionRequest') body.tool_name = arg ?? 'Bash';
else if (name === 'Notification') body.notification_type = arg ?? 'idle_prompt';
else if (name === 'MessageDisplay') body.delta = arg ?? 'Here is what I found so far.';

const res = await fetch(`http://127.0.0.1:${port}/event`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
console.log(res.status, await res.text());
