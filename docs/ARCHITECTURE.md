# How Rusty works

## The big picture

```
Claude Code session ──http hook POST──▶ Electron main process ──IPC──▶ Renderer (three.js)
 (terminal / desktop app)               • hook server :47821            • session filter
                                        • window placement (Win32)      • state machine → mood
                                        • tray, saved state             • robot pose + Blender clips
                                        • TTS worker (Kokoro) ──audio──▶ • canvas face, bubble, voice
```

1. Claude Code runs `http` hooks (installed by `scripts/install-hooks.mjs` into
   `~/.claude/settings.json`) for 13 events and POSTs each event's JSON to `127.0.0.1:47821/event`.
2. `src/main/hookServer.ts` answers `{}` immediately (it never steers Claude), logs the event to
   `logs/events.jsonl` and forwards it to the window.
3. The renderer keeps only events from the session you last typed into (`sessionFilter.ts`) and only
   treats tool/subagent events as "busy" while a turn is running, between `UserPromptSubmit` and
   `Stop`. The desktop app fires a background `SubagentStop` a few seconds after each reply, which
   must not look like thinking.
4. `stateMachine.ts` turns an event into a **mood** (greet, thinking, working, browsing, permission,
   talking, happy, error, sleep, bye), bubble text and what to say.
5. The body is posed at 12 fps (stop-motion feel), the face is drawn at 30 fps, and Blender clips
   (Hop, Wave, Cheer) take over the body while they play.

## Event → behaviour

| Hook event | Mood | Extra |
|---|---|---|
| `SessionStart` | greet | Wave clip, "Hello Sev, what can I do?" (spoken) |
| `UserPromptSubmit` | thinking | thought cloud with dots; stops any speech |
| `PreToolUse` | working / browsing | browsing for `WebFetch`, `WebSearch`, browser MCP tools; "your turn" for `AskUserQuestion` / `ExitPlanMode` |
| `PostToolUse`, `PostToolBatch`, `SubagentStop` | thinking | only during a turn |
| `PermissionRequest`, `Notification(permission_prompt)` | permission | spoken; accepted from any session |
| `MessageDisplay` | talking | bubble shows the text as it streams |
| `Stop` | happy | Cheer clip; bubble; speaks the first 3 sentences + "there's more" offer |
| `Stop` with `<!-- rusty:discussion -->` | talking | speaks the whole reply (discussion skill) |
| `StopFailure` | error | spoken |
| `Notification(idle_prompt)` | sleep | |
| `SessionEnd` | bye | Wave clip |

## Files

| Path | What it does |
|---|---|
| `src/main/main.ts` | Window (transparent, always on top, click-through), tray, IPC, sitting/walking placement, cursor feed, preview mode |
| `src/main/hookServer.ts` | Local HTTP server for hook events |
| `src/main/win32.ts` | koffi bindings: active window, its exact frame bounds and process name |
| `src/main/store.ts` | Saved position and settings (`%APPDATA%\claude-desktop-companion\companion-state.json`) |
| `src/main/voice.ts` | Owns the TTS worker; robot voice effect (pitch up, bit-crush, ring) |
| `src/main/ttsWorker.ts` | Kokoro-82M (fp32) in a worker thread; splits text into chunks; one generation at a time |
| `src/preload/preload.ts` | The safe bridge between the window and the main process |
| `src/renderer/renderer.ts` | Scene, mouse handling, strolling, tour, gaze, thought cloud, main loop |
| `src/renderer/robot.ts` | Loads the `.glb`, flat unlit materials, procedural poses, Blender clip player |
| `src/renderer/face.ts` | All expressions on a 256×205 canvas, blink, gaze, speaking mouth |
| `src/renderer/stateMachine.ts` | Event → mood/bubble/speech; reply splitting for speech |
| `src/renderer/sessionFilter.ts` | Which session Rusty follows |
| `src/renderer/speaker.ts` | Plays speech chunks with Web Audio; loudness → mouth |
| `src/renderer/tour.ts` | The guided tour script |
| `blender/build_robot.py` | Builds the robot, its colours and animation clips, exports `assets/colors/robot_burnt.glb` |
| `scripts/` | Build, hook installer, test-event sender, voice samples and benchmark |
| `extras/discussion-skill/SKILL.md` | Optional Claude Code skill for discussion mode |

## Placement

The window is small (280×330) and moves with Rusty instead of covering the screen.

- **Floor:** the window's bottom sits on the work area's bottom (the top of the taskbar). Walking
  moves the window sideways in small stepped increments.
- **Sitting:** every 350 ms the main process asks Windows for the foreground window
  (`GetForegroundWindow` + `DWMWA_EXTENDED_FRAME_BOUNDS`). If it has room above it, Rusty hops onto
  its top edge, 150 px left of the right edge (clear of the window buttons). He leaves after ~1 s
  without a valid window (so menus and popups don't make him jump). The Hop clip plays, and the window
  moves at the peak of the jump.
- **Click-through:** `setIgnoreMouseEvents(true, { forward: true })`; the renderer raycasts the
  mouse against the robot and turns clicks on only over him or his bubble.

## Voice

Kokoro-82M runs on the CPU in a worker thread. On a Ryzen 7 the fp32 model makes speech 2–3× faster
than real time (the 8-bit model was slower than real time). Text is cut into a short opening phrase
(5 words) and then pieces of up to ~18 words, so audio starts about 1 s after a reply and the next
piece is ready before the current one ends. A new line cancels the old one after its current piece.
The effect in `voice.ts` pitches up by resampling (1.18×), so Kokoro speaks at 0.85 speed to keep a
natural pace. The renderer measures loudness to open and close the mouth in 4 steps.

## The model and animations

`blender/build_robot.py` builds the robot from primitives (no sculpting), with pivots at the
shoulders and hips, so the app can rotate parts by name (`*_Body`, `*_Screen`, `*_ArmL`, `*_ArmR`,
`*_LegL`, `*_LegR`). All clips are keyed on one timeline and exported as a single glTF animation; the
app cuts it by frame range (`CLIPS` in `robot.ts` must match the script). Colours are flat (rendered
unlit); the box's darker sides and lighter top are baked into its materials. The face is not
modelled: the app draws it on the `Screen` quad.

## Testing without Claude

- Tray → **Test states** or **Show me around (tour)**.
- `npm run test-event -- <EventName> [text]` sends a fake event.
- Preview mode renders once to a PNG and quits, without touching a running Rusty:
  `COMPANION_PREVIEW=out.png COMPANION_PREVIEW_DELAY=5000 [COMPANION_PREVIEW_EVENT=Stop COMPANION_PREVIEW_TEXT="…"] [COMPANION_PREVIEW_HOP=4000] [COMPANION_PREVIEW_PLACEMENT=sitting] [COMPANION_MODEL=path.glb] npx electron .`
- Replay a sequence of events in a preview: `COMPANION_PREVIEW_EVENTS='[{"at":4000,"evt":{"hook_event_name":"UserPromptSubmit","session_id":"s"}}, …]'`.
- `logs/placement.log` records sitting decisions and voice timings.
