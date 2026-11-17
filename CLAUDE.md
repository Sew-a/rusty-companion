# CLAUDE.md

## What this project is

**Rusty** is an animated desktop robot that is the face of Claude for its owner, Sev. It is not a
separate assistant: when Sev talks to Rusty they are talking to Claude. Rusty reacts to Claude Code
sessions (terminal and the Claude desktop app's Code tab) through local `http` hooks, shows Claude's
state (thinking, working, browsing, permission, done, error), speaks reply summaries with a robot
voice, strolls along the taskbar and sits on the active window. Windows 11 is the only tested
platform. Original character from Sev's sketches: a boxy burnt-orange screen robot with near-black
tube limbs; keep it clearly distinct from any cartoon character.

Read `docs/ARCHITECTURE.md` for the full design. `README.md` is for public users.

## Commands

```bash
npm start            # build + run Electron (Rusty appears bottom-right)
npm run build        # esbuild bundles to dist/
npm run typecheck    # tsc --noEmit (run after every change)
npm test             # vitest: event logic, idle scheduler, hook server, sync checks (run after every change)
npm run test-event -- Stop "text"     # fake hook event to a running Rusty
npm run hooks:install / hooks:uninstall
node scripts/voice-bench.mjs fp32     # TTS speed on this machine
"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --factory-startup --python blender/build_robot.py
```

After rebuilding the model, copy `assets/colors/robot_burnt.glb` to `assets/robot.glb` (the file the app loads).

## Layout

- `src/main`: Electron main process (window, tray, hook server, Win32 via koffi, placement, TTS worker)
- `src/renderer`: three.js scene, robot poses and clips, canvas face, state machine, event router,
  idle scheduler, session filter, speaker, tour. Keep decisions in the pure modules (`eventRouter.ts`,
  `idleScheduler.ts`, `stateMachine.ts`) so they stay testable; `renderer.ts` only applies them.
- `src/preload`: bridge API (`window.companion`)
- `test/`: vitest tests (no Electron needed)
- `blender/build_robot.py`: the model, props, colours and animation clips (re-runnable)
- `extras/*-skill`: optional spoken Claude Code skills (discussion is installed for Sev at
  `~/.claude/skills/discussion/`; brainstorm, recap, quiz live here until installed)
- `docs/IDEAS.md`: features suggested for later

## Things that must stay in sync

- `CLIPS` frame ranges: `blender/build_robot.py` ↔ `src/renderer/robot.ts`
- Screen aspect 0.8: `screen_aspect` in the Blender script ↔ `W`/`H` (256×205) in `face.ts`
- Part names `*_Body`, `*_Screen`, `*_ArmL/R`, `*_LegL/R`, `*_Root`, and the left-hand props
  `*_Notepad`, `*_Mug` (the app finds them by suffix)
- Discussion marker `<!-- rusty:discussion -->`: every `extras/*-skill` ↔ `stateMachine.ts`
- `test/sync.test.ts` checks all of the above.

## Gotchas (learned the hard way)

- Blender 5.1 in background mode crashed when creating a new scene, wrapping the glTF exporter in
  `temp_override(scene=…)`, or rendering. The script reuses the startup scene and uses none of those.
- glTF UVs start at the top-left: the face `CanvasTexture` needs `flipY = false` on Blender models.
- The desktop app fires a background `SubagentStop` ~5 s after every reply. Tool and subagent events
  only count as "busy" between `UserPromptSubmit` and `Stop` (`IN_TURN_EVENTS`), or Rusty shows
  thinking dots while he speaks.
- Kokoro: the fp32 model is ~5× faster than q8 on this Ryzen CPU. Never run two generations at once
  (they slow each other down badly); keep the first chunk short so speech starts in ~1 s.
- Hooks must answer instantly with `{}`; returning a decision for `PermissionRequest` would approve
  or deny tools for the user. Don't.
- Changing `name` in `package.json` moves the saved-state folder (`%APPDATA%\claude-desktop-companion`).
- Wildcard deletes are blocked in this environment; delete files by exact path.

## Working with Sev

- Ask before anything outside the project folder (user settings, hooks, downloads) and before commits/pushes.
- Sev reviews by looking: after visual changes, capture preview PNGs (preview mode, see
  `docs/ARCHITECTURE.md`) and show them.
- Keep Rusty's spoken lines short and in first person.
