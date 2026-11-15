# Claude integration routes for an external desktop companion (state as of 15 Nov 2026)

Reading notes for the report writer:
- "Confirmed" items below were read directly from the cited official page on 2026-11-15 unless marked "(via search summary)", which means I only saw a search-engine summary of that page and did not open the passage myself.
- Docs base URL is now `code.claude.com/docs`. Version numbers quoted (v2.1.2xx-v2.1.3xx) come from the docs' own version notes.
- Community projects were found through search listings; I did not open the repositories. Treat their descriptions as unverified leads.

## 1. Claude Code hooks: events, payloads, configuration, HTTP hooks, final text at Stop

### Takeaway
Hooks are the primary supported integration route: there are now 33 hook events, a native `http` hook type that POSTs the event JSON to a URL (localhost is fine), and `Stop` carries `last_assistant_message`, which the docs explicitly recommend for read-aloud use instead of parsing the transcript. A newer `MessageDisplay` event delivers assistant text in batches of completed lines while it is displayed, so near-real-time text is available without the SDK.

### Cited Findings

Event list (exact names, 33 in the reference table) — [Hooks reference](https://code.claude.com/docs/en/hooks):
- `SessionStart` (matchers `startup`, `resume`, `clear`, `compact`, `fork`), `Setup` (`init`, `maintenance`), `UserPromptSubmit`, `UserPromptExpansion`, `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Notification`, `MessageDisplay`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `Stop`, `StopFailure`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact` (`manual`, `auto`), `PostCompact`, `PreModelSwitch`, `PostModelSwitch`, `Elicitation`, `ElicitationResult`, `SessionEnd`. — [Hooks reference](https://code.claude.com/docs/en/hooks)
- Events that ignore matchers: `UserPromptSubmit`, `PostToolBatch`, `Stop`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `WorktreeCreate`, `WorktreeRemove`, `MessageDisplay`, `CwdChanged`. — [Hooks reference](https://code.claude.com/docs/en/hooks)

Payload fields — all from [Hooks reference](https://code.claude.com/docs/en/hooks):
- Common fields on every event: `session_id`, `prompt_id`, `transcript_path`, `cwd`, `scratchpad_dir`, `permission_mode` (`default`, `plan`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`), `effort` (object with `level`), `hook_event_name`. Inside subagents also `agent_id`, `agent_type`.
- `SessionStart`: `source` (e.g. `"resume"`, `"fork"`), `model` (not always present).
- `UserPromptSubmit`: `prompt` (pasted content arrives expanded); `session_title` when a custom title is set. Can return `decision: "block"`, `additionalContext`, `sessionTitle`, `suppressOriginalPrompt`.
- `PreToolUse`: `tool_name`, `tool_input`, `tool_use_id`. Example `tool_input` for Bash: `command`, `description`, `timeout`, `run_in_background`.
- `PermissionRequest`: `tool_name`, `tool_input` (no `tool_use_id`), optional `permission_suggestions`; MCP tools add `mcp_server`. A command or HTTP hook can answer with `hookSpecificOutput.decision.behavior` = `"allow"` or `"deny"` (plus `updatedInput`, `updatedPermissions`, `message`, `interrupt`).
- `PermissionDenied`: fires only when auto mode denies a call; `tool_name`, `tool_input`, `tool_use_id`, `reason`.
- `PostToolUse`: `tool_input`, `tool_response` (structured), `tool_use_id`, optional `duration_ms`.
- `PostToolUseFailure`: `tool_name`, `tool_input`, `tool_use_id`, `error`, optional `is_interrupt`, optional `duration_ms`.
- `PostToolBatch`: `tool_calls` array of `{tool_name, tool_input, tool_use_id, tool_response}`; fires once after a parallel batch resolves, before the next model request.
- `Notification`: `message`, optional `title`, `notification_type`. Matcher values: `permission_prompt`, `idle_prompt`, `auth_success`, `auth_storage_failure` (v2.1.288+), `elicitation_dialog`, `elicitation_url_dialog`, `elicitation_complete`, `elicitation_response`, `agent_needs_input`, `agent_completed`, `quota_auto_resume_fired` / `_stale` / `_disabled` (v2.1.234+), `plugin_notification`. Timing: `permission_prompt` and dialog types fire after about six seconds without typing; `idle_prompt` about 60 seconds after a response. No decision control.
- `MessageDisplay`: `turn_id`, `message_id` (not the API `msg_...` id), `index` (zero-based batch index), `final` (true on last batch), `delta` (newly completed lines). Runs once per batch of completed lines, not per token; interactive runs end with a final batch that may have an empty `delta`. In non-interactive runs (SDK or `claude -p`) it fires once per message with the full text. Assistant message text only. Output `hookSpecificOutput.displayContent` changes on-screen text only. Default timeout 10 seconds.
- `Stop`: `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons`. Docs: "`last_assistant_message` field contains the text content of Claude's final response, so hooks can access it without parsing the transcript file. For hooks that act on the just-completed turn, such as read-aloud or notification hooks, use this field rather than reading `transcript_path`: the transcript file isn't guaranteed to include the final message at Stop time on all versions."
- `background_tasks` / `session_crons` "let hooks distinguish 'session is done' from 'session is paused waiting for background work to wake it back up'".
- `SubagentStop`: `stop_hook_active`, `agent_transcript_path`, `last_assistant_message`, `background_tasks`, `session_crons` (plus `agent_id`, `agent_type`). On v2.1.271+ a subagent using `SubagentHandback` delivers its report via that tool's `tool_input.message`, not `last_assistant_message`.
- `StopFailure` (runs instead of `Stop` on API error): `error` (matchers `rate_limit`, `overloaded`, `authentication_failed`, `billing_error`, `server_error`, `unknown`, others), optional `error_details`, optional `last_assistant_message` (here it is the error string, e.g. "API Error: Rate limit reached").
- `SessionEnd`: `reason` = `clear`, `resume`, `logout`, `prompt_input_exit`, `other`. Default timeout 1.5 seconds (raise with per-hook `timeout` or `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`).
- `PreModelSwitch` / `PostModelSwitch`: `from_model`, `to_model`.

Handler types — [Hooks reference](https://code.claude.com/docs/en/hooks):
- Five types: `command`, `http`, `mcp_tool`, `prompt`, `agent` (experimental).
- `http`: fields `url`, `headers` (supports `$VAR`), `allowedEnvVars`, `onFailure`, `timeout`; the event JSON is POSTed as the body; non-2xx or connection failure is non-blocking unless `onFailure: "block"`. Docs example URL is `http://localhost:8080/hooks/pre-tool-use`. Settings-level controls: `allowedHttpHookUrls`, `httpHookAllowedEnvVars`.
- `command`: `command`, `args` (exec form, no shell), `async`, `asyncRewake`, `shell` (`"bash"` or `"powershell"`), `onFailure` (v2.1.295+). `"async": true` is only available on `type: "command"` hooks.
- `mcp_tool`: `server` (plugin servers are `plugin:<plugin-name>:<server-name>`), `tool`, `input` with `${tool_input.x}` substitution.
- Default timeouts: 600 s for command/http/mcp_tool, 30 s for prompt, 60 s for agent; 30 s on `UserPromptSubmit`; 10 s on `MessageDisplay`.
- Exit codes: 0 success (stdout parsed as JSON if a single object), 2 blocking error, other non-blocking.

Configuration locations — [Hooks reference](https://code.claude.com/docs/en/hooks):
- `~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json`, managed policy, plugin `hooks/hooks.json`, skill frontmatter, subagent frontmatter. Placeholders `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`. Kill switches: `disableAllHooks`, `allowManagedHooksOnly`.

### Inferences
- The lowest-friction design is a companion app that runs a loopback HTTP server and a set of `http` hooks pointing at it; no helper script or shell is involved, which sidesteps most Windows shell problems. A WebSocket is not a hook transport; hooks POST per event, and the companion can fan out internally.
- Because `http` hooks have no `async` field (docs say `async` is command-only), the companion's HTTP endpoint should answer immediately so it never delays Claude; a dead companion produces a non-blocking connection failure rather than breaking sessions (default `onFailure` behaviour).
- A companion can also answer permission prompts (allow/deny) through a `PermissionRequest` HTTP hook, giving it limited "drive" capability without touching the UI. This is a security-sensitive feature to offer.

### Gaps
- I did not read the "HTTP hook" section in full (response body handling, whether loopback URLs need `allowedHttpHookUrls` allow-listing by default). Verify before relying on zero-config localhost posting.
- Whether `MessageDisplay` fires in the desktop app's Code tab (a GUI, not a terminal renderer) is not stated in what I read; it may behave like the non-interactive case (one call per message). Needs an empirical test.
- Exact version in which `MessageDisplay` and `last_assistant_message` were introduced was not captured.

## 2. Do `~/.claude/settings.json` hooks fire in the desktop app Code tab? Windows-specific issues

### Takeaway
Documented behaviour is yes: the desktop Code tab runs Claude Code locally and reads the same user settings, so user-level and plugin hooks apply; cloud sessions do not read local settings. There are community bug reports of hooks not firing in desktop/GUI sessions on specific versions, so the companion needs a self-test and a fallback.

### Cited Findings
- Hooks reference states Claude Code fires the same hook events in terminal sessions, IDE extensions, the Desktop app and cloud sessions, and that cloud sessions do not read local `~/.claude/settings.json` (via search summary). — [Hooks reference](https://code.claude.com/docs/en/hooks)
- Desktop docs treat `~/.claude/settings.json` as applying to local Code-tab sessions: "A new local session can still start in a `defaultMode` from `~/.claude/settings.json` or managed settings"; "To set a variable for every local session, add it to the `env` key in your `~/.claude/settings.json` file." — [Desktop docs](https://code.claude.com/docs/en/desktop)
- "Local sessions load your personal skills from `~/.claude/skills/`." — [Desktop docs](https://code.claude.com/docs/en/desktop)
- Some settings keys "have a different effect or no visible one" in the Code tab (table "Claude Code settings that behave differently in the Code tab", e.g. `askUserQuestionTimeout`, `defaultShell`, `modelPicker`). — [Desktop docs](https://code.claude.com/docs/en/desktop)
- Cowork is different: "Cowork in the Desktop app sources its skills, plugins, and connectors from this Customize configuration, which syncs through your claude.ai account, not from the CLI's `~/.claude` directory." — [Desktop docs](https://code.claude.com/docs/en/desktop)
- "Plugins aren't available in WSL sessions"; desktop-installed plugins are not available in cloud sessions. — [Desktop docs](https://code.claude.com/docs/en/desktop)
- "On Windows, Desktop doesn't read PowerShell profiles, so set `PATH` in your user or system environment variables, then quit and reopen Desktop." — [Desktop docs](https://code.claude.com/docs/en/desktop)
- The desktop app sends its own OS notification "when a Code session finishes a task and you aren't currently viewing that session." — [Desktop docs](https://code.claude.com/docs/en/desktop)
- Windows hook shell rules: without Git Bash, a shell-form command with no `shell` set runs in PowerShell; `"shell": "powershell"` auto-detects `pwsh.exe` then falls back to `powershell.exe` 5.1; Git Bash location can be set with `CLAUDE_CODE_GIT_BASH_PATH`. — [Hooks reference](https://code.claude.com/docs/en/hooks)
- Exec form (`args`) needs a real `.exe`; `.cmd`/`.bat` shims (npm, npx) fail in exec form. — [Hooks reference](https://code.claude.com/docs/en/hooks)
- Do not write bare `$CLAUDE_PROJECT_DIR` in a PowerShell hook (parsed as an undefined variable, resolves to `$null`); use the `${...}` placeholder form. Reading stdin in PowerShell: `[Console]::In.ReadToEnd() | ConvertFrom-Json`. — [Hooks reference](https://code.claude.com/docs/en/hooks)
- On Windows most substituted plugin paths use forward slashes (`C:/Users/you/...`) but keep backslashes in exec-form hooks and PowerShell hooks. — [Plugin components](https://code.claude.com/docs/en/plugins/components)
- Community bug reports (mirror of the GitHub tracker, status not verified): "Hooks stop firing entirely after editing settings.local.json — Desktop 2.1.156 Windows"; "SessionStart hooks don't fire when opening GUI panes"; "PreToolUse hooks are registered and listed by /hooks, but never execute (v2.1.219, Windows)"; "Cowork sessions ignore user hooks and managed settings". — [claudeissues.com 64699](https://claudeissues.com/issue/64699-hooks-stop-firing-entirely-after-editing-settings-local-json-desktop-2-1-156-win), [16763](https://claudeissues.com/issue/16763-sessionstart-hooks-dont-fire-when-opening-gui-panes), [85904](https://claudeissues.com/issue/85904-bug-pretooluse-hooks-are-registered-and-listed-by-hooks-but-never-execute-v2-1-2)
- A third-party guide notes the Code tab runs its own app-managed copy of Claude Code whose version can differ from the terminal `claude` (via search summary). — [developertoolkit.ai](https://developertoolkit.ai/en/claude-code/build/desktop-app/)

### Inferences
- `http` hooks avoid the Windows shell/quoting/PATH class of problems entirely, which is the strongest argument for them on Windows 11.
- Because the desktop app bundles its own Claude Code build, a hook event or field available in the user's CLI may not yet exist in the desktop build (or the reverse); the companion should tolerate missing events and fields.
- Cowork-tab sessions should be assumed not observable through `~/.claude` hooks.

### Gaps
- I did not open the exact sentence in the hooks reference about Desktop; confirm wording.
- No authoritative statement found on whether the reported desktop hook bugs are fixed in current builds.
- Where the desktop app stores local Code-session transcripts on Windows was not found in the docs I read (hook payload `transcript_path` gives it at runtime).

## 3. Real-time visibility and state mapping (thinking, browsing, needs permission, done)

### Takeaway
Hooks give turn boundaries, every tool call, permission requests, notifications and (via `MessageDisplay`) assistant text in line batches; I found no hook that exposes thinking tokens. Token-level partial text and thinking deltas are only available by running the session yourself through the Agent SDK.

### Cited Findings
- `MessageDisplay` delivers `delta` batches of completed lines "not per token" and covers assistant message text. — [Hooks reference](https://code.claude.com/docs/en/hooks)
- `PermissionRequest` fires when a tool call needs a permission decision; `Notification` with `notification_type` `permission_prompt` fires after about six seconds without input; `idle_prompt` about 60 seconds after a response. — [Hooks reference](https://code.claude.com/docs/en/hooks)
- MCP tools are named `mcp__<server>__<tool>` (example `mcp__github__get_issue`); plugin-provided MCP tools are `mcp__plugin_<plugin>_<server>__<tool>`; MCP tool events carry an `mcp_server` object (`name`, `source`) on v2.1.274+. — [Hooks reference](https://code.claude.com/docs/en/hooks), [Plugin components](https://code.claude.com/docs/en/plugins/components)
- The desktop app has a built-in Browser pane with its own tools, toggled by "Browser tools" in Settings; Claude "auto-verifies changes after every edit" by default using it. — [Desktop docs](https://code.claude.com/docs/en/desktop)

### Inferences
Suggested state machine (inference from the payloads above):
- idle: after `SessionStart`, after `Stop` with empty `background_tasks`, or `Notification` `idle_prompt`.
- thinking: `UserPromptSubmit` received and no tool running; also the gap after `PostToolUse` / `PostToolBatch` until the next `PreToolUse` or `MessageDisplay`.
- talking/writing: `MessageDisplay` batches arriving.
- tool use: between `PreToolUse` and `PostToolUse` / `PostToolUseFailure`, keyed by `tool_use_id`; sub-classify by `tool_name` (e.g. `Bash`, `PowerShell`, `Edit`, `Write`, `Read`, `Grep`).
- browsing: `tool_name` of `WebFetch` or `WebSearch`, or matching these prefixes. Observed tool names in a live desktop Code-tab session on this machine (first-hand observation, not from docs): `mcp__Claude_Browser__*` (built-in Browser pane: `navigate`, `computer`, `read_page`, `find`, `form_input`, `get_page_text`, `tabs_create` ...), `mcp__claude-in-chrome__*` (Claude in Chrome extension: `navigate`, `computer`, `read_page`, `tabs_context_mcp` ...), `mcp__plugin_playwright_playwright__browser_*` (Playwright plugin), and `mcp__computer-use__*` for desktop control. A regex such as `^(WebFetch|WebSearch|mcp__Claude_Browser__|mcp__claude-in-chrome__|mcp__.*playwright.*__browser_)` would cover these.
- needs permission: `PermissionRequest` (immediate) or `Notification` `permission_prompt` (delayed about 6 s); `Elicitation` / `elicitation_dialog` and `agent_needs_input` also mean "waiting on user".
- done: `Stop` (speak `last_assistant_message`); error: `StopFailure`; subagent activity: `SubagentStart` / `SubagentStop`.
- In auto or bypass permission modes `PermissionRequest` may rarely fire; `permission_mode` in every payload tells the companion which mode it is in.

### Gaps
- No hook found for extended-thinking content or a "model is generating" heartbeat; "thinking" must be inferred from gaps between events.
- User interrupt (Esc) does not appear to have its own event in what I read; `PostToolUseFailure.is_interrupt` covers tool interrupts only.

## 4. Claude Agent SDK: headless sessions, streaming, subscription auth rules

### Takeaway
The SDK runs the same Claude Code agent loop inside your own process and streams every message, tool call and (optionally) partial deltas, so it gives the richest signal; but Anthropic's docs say third-party products may not offer claude.ai login, so a publicly released companion cannot rely on the user's subscription through the SDK without Anthropic approval, and it would replace rather than follow the user's existing desktop sessions.

### Cited Findings
- "A library that runs the Claude Code binary, with Claude Code's capabilities, such as built-in tools, permissions, sessions, and hooks"; available in Python and TypeScript (`@anthropic-ai/claude-agent-sdk`, `claude-agent-sdk`); both bundle a native Claude Code binary. — [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview), [Quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart)
- `query()` returns an async iterator yielding messages "as Claude works": reasoning text, tool calls, tool results, final `result` message. SDK also supports hooks, MCP servers, sessions (resume/fork), plugins loaded by local path, and loads skills/commands/memory from `.claude/` and `~/.claude/`. — [Quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart), [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Use the API key authentication methods described in this document instead." — [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- Documented auth: `ANTHROPIC_API_KEY`, or Bedrock / Claude Platform on AWS / Google Cloud / Microsoft Foundry env switches. — [Quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart)
- Help-centre article "Use the Claude Agent SDK with your Claude plan": when signed in with a Claude plan, Agent SDK and `claude -p` usage "still draw from your subscription limits"; the change announced for 15 June 2026 (separate credit) was paused ("For now, nothing has changed"); a 7 Oct 2026 update says Max, Ultra and Team plans "now include monthly API credits" covering the Claude API, Managed Agents, the Agent SDK and `claude -p` when using an API key from a linked Console organization. Credit amounts are in a separate article not read. — [Claude Help Center](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
- Branding: products must not use "Claude Code" naming or mimic Claude Code visuals; SDK use is under Anthropic's Commercial Terms. — [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- For other languages: run the CLI as a subprocess with `-p` and `--output-format json`. — [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)

### Inferences
- For personal use on the user's own machine, the SDK or `claude -p` with the existing login draws on subscription limits (per the help article). For a public release the compliant options are: (a) hooks/plugin route, where the user's own Claude Code does the authenticating and the companion never touches credentials, or (b) SDK with the user's own API key or plan API credits.
- Trade-off: SDK = full streaming and control but a separate session and UI the user must adopt; hooks = follows the sessions the user already runs in the desktop app and CLI, with coarser (line-batch, tool-level) granularity.

### Gaps
- Did not read the SDK streaming page for the exact partial-message option name (historically `includePartialMessages` / `include_partial_messages` yielding `stream_event` messages); confirm in [Streaming vs single-turn mode](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode.md).
- Monthly API credit amounts per plan and exhaustion behaviour not confirmed (secondary sources conflict; earlier-announced figures of $20/$100/$200 were tied to the paused June plan).
- Whether an SDK process can attach to or observe a session already running in the desktop app: no evidence found; assume no.

## 5. Plugins, skills, output styles, MCP servers, distribution

### Takeaway
A single plugin can bundle the hooks (`hooks/hooks.json`, including `http` hooks), a local MCP server (`.mcp.json`) exposing tools such as `say` / `set_expression`, a skill and an output style; it is distributed from a public GitHub repo by adding a `.claude-plugin/marketplace.json` and having users run two commands.

### Cited Findings
- Plugin components and default paths: `.claude-plugin/plugin.json` (only `name` required), `skills/<name>/SKILL.md`, `commands/`, `agents/`, `hooks/hooks.json`, `monitors/monitors.json`, `output-styles/<name>.md`, `themes/<slug>.json`, `workflows/`, `bin/`, `.mcp.json`, `.lsp.json`; `userConfig` prompts the user for values. — [Plugin components](https://code.claude.com/docs/en/plugins/components)
- Plugin hooks are registered when a session loads the plugin and "fire on their events from then on"; hook types listed include "a shell command, an HTTP request, an MCP tool call, a prompt to a model, or a subagent". — [Plugin components](https://code.claude.com/docs/en/plugins/components)
- Plugin MCP server declared in `.mcp.json` with `${CLAUDE_PLUGIN_ROOT}`; appears as `plugin:<plugin>:<server>`; tools named `mcp__plugin_<plugin>_<server>__<tool>`. — [Plugin components](https://code.claude.com/docs/en/plugins/components)
- "A local stdio server ... runs in Claude Code and in a Cowork session that runs on your machine in the Claude Desktop app, but not on claude.ai." — [Plugin components](https://code.claude.com/docs/en/plugins/components)
- Output style in a plugin: `output-styles/<name>.md` with `name`, `description`, `keep-coding-instructions` frontmatter; appears in `/output-style` as `<plugin>:<name>`. — [Plugin components](https://code.claude.com/docs/en/plugins/components)
- Monitors: a background shell command whose output "reaches Claude as notifications"; do not start in `-p` mode. Channels: an MCP server plus a `channels` entry "lets an outside system such as a chat app send messages into a session". — [Plugin components](https://code.claude.com/docs/en/plugins/components)
- `${CLAUDE_PLUGIN_DATA}` resolves to `~/.claude/plugins/data/<id>/` and survives updates. — [Plugin components](https://code.claude.com/docs/en/plugins/components)
- "Mods": a `modules` key in `hooks/hooks.json` lets hooks be JavaScript functions that run inside Claude Code and can draw in its interface. — [Plugin components](https://code.claude.com/docs/en/plugins/components)
- Marketplace: a repo with `.claude-plugin/marketplace.json` (`name`, `owner`, `plugins[]` with `name` and `source`); users run `claude plugin marketplace add <owner>/<repo>` then `claude plugin install <plugin>@<marketplace>` (or `/plugin marketplace add`, `/plugin install` in a session); validate with `claude plugin validate`. Sources: relative path, `github`, `git-subdir`, `url`, `archive`, `npm`, `command`. Public listing: "Submit to Anthropic's directory". — [Create a marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
- Desktop app: plugins can be installed from the desktop app scoped to user, project or local. — [Desktop docs](https://code.claude.com/docs/en/desktop)

### Inferences
- An output style or always-on skill can instruct Claude to end each reply with a short spoken-summary line (e.g. a tagged line the companion extracts from `last_assistant_message`). An MCP `say(text, emotion)` tool is the more robust alternative because the spoken text arrives as structured `tool_input` (observable via `PreToolUse` on `mcp__plugin_<plugin>_<server>__say`, or handled directly by the companion acting as the MCP server). Several community TTS plugins already use the "speak a summary / first sentence" pattern (section 8).
- The companion app itself can be the MCP server (HTTP transport on loopback), so one process serves hook POSTs and MCP tools; plugin `.mcp.json` then just points at its URL. Tool calls cost tokens and may trigger permission prompts unless pre-allowed.
- A "channel" could let the companion push user speech or events into a running session; this is the only documented inbound route found besides hook `additionalContext` and `asyncRewake`.

### Gaps
- Did not verify output-style behaviour in the desktop Code tab, or the status line (terminal-only feature; not researched further).
- Channels reference not read; requirements and whether channels work in the desktop Code tab are unknown.
- Whether plugin hooks of type `http` to localhost need user approval or URL allow-listing on install was not confirmed.

## 6. Regular Claude desktop chat app (not Code) and Cowork

### Takeaway
I found no supported way for an external app to observe ordinary chat conversations; the only extension points are MCP servers / connectors / desktop extensions, which see only the tool calls Claude chooses to make to them.

### Cited Findings
- Desktop "Connectors are MCP servers with a graphical setup flow"; other integrations are added "via settings files"; `claude_desktop_config.json` servers exist as a separate desktop-app mechanism. — [Desktop docs](https://code.claude.com/docs/en/desktop)
- Cowork takes its skills, plugins and connectors from the claude.ai-synced Customize configuration, "not from the CLI's `~/.claude` directory". — [Desktop docs](https://code.claude.com/docs/en/desktop)
- Packaged MCP servers use the MCPB format (`.mcpb`, older `.dxt`). — [Plugin components](https://code.claude.com/docs/en/plugins/components)
- Community reports that Cowork sessions ignore user hooks. — [claudeissues.com hooks listing](https://claudeissues.com/platform/macos-hooks)

### Inferences
- A local MCP server attached to the chat app sees only: its own tool invocations and arguments, and nothing of the conversation text, streaming, or state. So for Chat, the companion could at most offer `say` / `set_expression` tools that Claude may call; it cannot know idle/thinking/done.
- Screen-scraping or UI Automation of the Electron window would be the only other route; unsupported and fragile.

### Gaps
- Did not read the chat-app MCP / desktop-extension docs directly this session; statement on "what a local MCP server can see" is inference from how MCP works, not a quoted source.

## 7. Built-in voice features

### Takeaway
Claude Code has voice dictation (speech-to-text input only, `/voice`), with no speech output. The Claude apps (mobile, desktop, web) have a two-way "voice mode" in beta, but Anthropic states it is not available in Claude Code or Cowork, and no third-party/API access to either was found, so the companion must bring its own TTS.

### Cited Findings
- Claude Code CLI: `/voice` toggles dictation; `/voice hold` (push-to-talk, default key `Space`), `/voice tap`, `/voice off`; settings `"voice": {"enabled": true, "mode": "tap"}`, `"autoSubmit": true`; keybinding action `voice:pushToTalk` in `~/.claude/keybindings.json`. — [Voice dictation](https://code.claude.com/docs/en/voice-dictation)
- "Voice dictation streams your recorded audio to Anthropic's servers for transcription. Audio is not processed locally." Requires a Claude.ai account (not API key, Bedrock, etc.); "Transcription does not consume Claude messages or tokens". — [Voice dictation](https://code.claude.com/docs/en/voice-dictation)
- "Audio recording uses a built-in native module on macOS, Linux, and Windows"; WSL needs WSLg; VS Code extension also supports dictation; 20 dictation languages; recording stops after 15 seconds of silence or two minutes. — [Voice dictation](https://code.claude.com/docs/en/voice-dictation)
- The dictation page describes input only; no text-to-speech is described. — [Voice dictation](https://code.claude.com/docs/en/voice-dictation)
- Voice mode (talk and hear spoken replies) is in beta on Claude Mobile (iOS and Android), Claude Desktop and web, on all plans; preset voices; counts toward usage limits; "in Claude Cowork and Claude Code, dictation is available but voice mode isn't". — [Claude Help Center: Use voice mode](https://support.claude.com/en/articles/11101966-use-voice-mode)
- Community bug reports mention a mic/dictation button in the Windows desktop app that fails on some versions. — [claudeissues.com 59849](https://claudeissues.com/issue/59849-voice-dictation-mic-button-silently-fails-audio-captured-but-no-transcript-inser)

### Inferences
- Nothing in the dictation or voice-mode docs exposes a scriptable interface; treat both as closed. The companion could coexist with dictation (user dictates into Claude Code; companion speaks replies via its own TTS from `Stop.last_assistant_message`).

### Gaps
- Help article does not say explicitly that "Claude Desktop" voice mode covers Windows as well as Mac.
- No source found confirming or denying a separate "read aloud" button for typed chat replies in current apps.
- Dictation availability inside the desktop Code tab is implied by the help article ("in ... Claude Code, dictation is available") and bug reports, but not documented on the Claude Code desktop page I read.

## 8. Existing community TTS and desktop-pet projects

### Takeaway
Both ideas already exist as small community projects, nearly all hook-driven: TTS notifiers hang off `Stop` (often speaking a summary or first sentence), and several desktop pets map hook events to sprite states via a file, TCP socket or auto-installed hooks. None found is an official Anthropic project. All details below come from search listings, not from reading the repos.

### Cited Findings
TTS / spoken notifications:
- clarvis (nickpending): TypeScript/Bun hook processor, speaks updates via ElevenLabs. — [GitHub](https://github.com/nickpending/clarvis)
- herald (al3xjohnson): plugin offering TTS summaries or alert sounds; built-in macOS/Windows speech or ElevenLabs; installed via `/plugin install`. — [GitHub](https://github.com/al3xjohnson/herald)
- cc-vox (BestSithInEU): speaks a summary after each response; backends Qwen3-TTS, Kokoro, Fish-Speech, Chatterbox. — [GitHub](https://github.com/BestSithInEU/cc-vox)
- claude-code-tts (ybouhjira): Go MCP server plugin using OpenAI TTS; `Stop` hook speaks the first sentence of each response. — [listing](https://enterprisedna.co/directories/mcp/ybouhjira-claude-code-tts)
- claude-speak (PyPI): hook-based, no API keys; also speaks tool-use steps. — [PyPI](https://pypi.org/project/claude-speak/)
- claude_voice (cris-m), claude-code-voice-hook (praneybehl), claude-mlx-tts (aperepel; Chatterbox Turbo voice cloning on Apple Silicon). — [claude_voice](https://github.com/cris-m/claude_voice), [claude-code-voice-hook](https://github.com/praneybehl/claude-code-voice-hook), [claude-mlx-tts](https://github.com/aperepel/claude-mlx-tts)
- sound-hooks (jtcressy), cc-hooks (husniadil): sound effects across many hook events. — [claudepluginhub](https://claudepluginhub.com/plugins/jtcressy-sound-hooks), [listing](https://skillselion.com/plugin/husniadil/cc-hooks)
- VoiceMode (MCP-based two-way voice for Claude Code) is described in a Windows/WSL2 walkthrough. — [Medium](https://medium.com/@sankeththesmasher/running-voicemode-with-claude-code-on-windows-using-wsl2-23c9be3e6ca8)

Desktop pets / mascots:
- claude-pet (xtrimsystems): transparent always-on-top pixel character showing thinking/working/waiting/error; hooks write state to a file; Linux X11 only; MIT. — [GitHub](https://github.com/xtrimsystems/claude-pet)
- claude-pet (IMMINJU): Tauri 2 widget; hooks send events over a TCP socket; registers hooks automatically on start; built to see which of several sessions needs input. — [GitHub](https://github.com/IMMINJU/claude-pet)
- woofy (dashty8): 3D Shiba Inu; opt-in installer merges five tagged hooks into `~/.claude/settings.json`. — [GitHub](https://github.com/dashty8/woofy)
- petdex-cc: levelling tied to Claude Code events plus optional AI-generated speech. — [README](https://cdn.jsdelivr.net/npm/petdex-cc@0.1.14/README.md)
- claudlet: Python pixel pet with a Claude Code skill; pets perch on windows and spawn companions for subagents; has `claudlet-uninstall` to remove hooks. — [PyPI](https://pypi.org/project/claudlet/1.3.0/)

### Inferences
- Common patterns worth copying: tagged, removable hook entries; opt-in hook installation; an explicit uninstall; multi-session tracking keyed by `session_id`; subagent visualisation via `SubagentStart`/`SubagentStop`.
- The apparent gap is a cross-platform (Windows-first) pet that combines expressive character animation, spoken replies and MCP-driven expressions, packaged as a plugin plus app.

### Gaps
- Star counts, maintenance status, licences and Windows support of these projects were not verified.
- No official Anthropic TTS or mascot plugin was found; absence not proven.

## 9. Claude API (Messages API streaming) as a comparison

### Takeaway
Calling the API directly gives full token-level streaming but is a separate, pay-per-token product that shares nothing with the user's existing sessions, tools, permissions or subscription workflow.

### Cited Findings
- The Client SDK gives "Direct access to the Claude API ... You write the tool loop yourself, or let the client SDK's beta tool runner drive it", in contrast to the Agent SDK's built-in tools, permissions, sessions and hooks. — [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- API usage is authenticated with a Console API key; Max, Ultra and Team plans include monthly API credits usable for the Claude API (7 Oct 2026 update). — [Claude Help Center](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)

### Inferences
- Losses versus wrapping the existing workflow: no access to the user's Code-tab sessions, history, CLAUDE.md, skills, plugins, browser tools or permission UI; the companion would have to reimplement the agent loop; cost is per token beyond any included credit.
- Sensible use of the API in this product is limited to optional side tasks (e.g. summarising a long reply into one spoken sentence), and even that can be done inside the session via an output style at no extra integration cost.

### Gaps
- Current per-token prices and the size of plan-included API credits were not researched in this pass.
