# Rusty

Rusty is a small animated robot that lives on your desktop and reacts to your Claude Code sessions
(terminal and the Claude desktop app's Code tab): it thinks, works, cheers, sits on your windows and
speaks short summaries of Claude's replies. Windows first.

## Run

```bash
npm install
npm start
```

The robot appears above the taskbar at the bottom right. It is click-through except on the robot
itself: drag it to move it (drop it near the taskbar and it snaps back onto it), double-click to say
hi. While Claude is idle it strolls along the taskbar now and then. Its position and settings are
saved in `%APPDATA%\claude-desktop-companion\companion-state.json`.

When you click into a window that has room above it (not maximised), the robot hops onto its top
edge and dangles its legs; it goes back to the taskbar when you return to the desktop. Its eyes
follow the mouse cursor. It follows only the Claude Code session you last typed into; other
sessions are ignored except when they need your permission.

The tray icon has "Show me around (tour)", test states, "Walk around when idle",
"Sit on the active window", "Start with Windows", "Reset position" and "Quit".

## Connect it to Claude Code

```bash
npm run hooks:install
```

This backs up `~/.claude/settings.json` and adds local `http` hooks that POST each Claude Code event
to `http://127.0.0.1:47821/event`. If the companion is not running, the hooks simply fail
silently and Claude is not affected. Remove them with `npm run hooks:uninstall`.

Every received event is logged to `logs/events.jsonl` (local only, gitignored).

Send a fake event while it runs:

```bash
npm run test-event -- Stop "All done, tests pass."
```

## Character

- `blender/build_robot.py` builds the flat-front robot (burnt orange) and exports
  `assets/colors/robot_burnt.glb`. Run it with Blender 5.1 in the background:
  `blender --background --factory-startup --python blender/build_robot.py`
  (or through the Blender MCP server).
- The app loads `assets/robot.glb` (currently a copy of the burnt version) if it exists,
  otherwise a built-in placeholder.
  Override with `COMPANION_MODEL=path/to/model.glb`.
- Preview a model without disturbing the running app:
  `COMPANION_MODEL=... COMPANION_PREVIEW=out.png npx electron .`
- Animations are keyframed in the same script on one timeline (Hop 1–17, Wave 24–48, Cheer 56–76 at
  24 fps) and exported as one glTF animation; the app cuts it into clips (`CLIPS` in
  `src/renderer/robot.ts`). Hop plays when it jumps onto or off a window, Wave on greetings, Cheer when
  Claude finishes.
- Part names the app animates: `*_Body`, `*_Screen`, `*_ArmL`, `*_ArmR`, `*_LegL`, `*_LegR`
  (arm/leg origins at the shoulder/hip). The face is drawn at runtime on the `Screen` quad.

## Discussion mode

A Claude Code skill at `~/.claude/skills/discussion/SKILL.md` (user-level, not in this repo) turns on
conversational replies when you say "let's have a discussion" or "what's your opinion on…". Those
replies end with a hidden `<!-- rusty:discussion -->` marker, and Rusty reads them aloud in full.

## Voice

Rusty speaks with Kokoro-82M (Apache-2.0), voice `am_fenrir`, at 85% speed with a robot effect
(pitch up, bit-crush, faint ring). It runs on the CPU in a worker thread (`src/main/ttsWorker.ts`)
using the fp32 model (~326 MB, downloaded once from Hugging Face): on a Ryzen 7 it makes speech
2–3x faster than real time, while the 8-bit model was slower than real time. Rusty speaks a short
opening phrase first, so the voice starts about 1 s after a reply.

It reads the first three sentences of a reply; if there is more, it offers to read the rest when you
click its bubble. Mute it from the tray ("Speak (voice)").

- `node scripts/voice-bench.mjs [fp32|q8]` measures generation speed on your machine.
- `node scripts/voice-samples.mjs` writes sample clips of several voices to `voice-samples/`.

## Layout

- `src/main` – Electron main process: transparent always-on-top window, tray, hook server,
  saved state, Win32 active-window lookup (koffi) and sitting placement.
- `src/renderer` – three.js scene, robot loader and procedural animation, canvas face, state machine,
  session filter, guided tour.
- `scripts` – build, hook installer, test-event sender.
