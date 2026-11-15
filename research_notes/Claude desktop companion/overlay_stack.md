# Overlay Tech Stack for a Transparent, Always-on-Top, Click-Through 3D Desktop Companion (as of Nov 2026)

Method note: these notes come from WebSearch result summaries only. Direct page fetches were rejected during this session, so no primary doc page was read in full, and claims rest on search-result extracts. Points that come from background knowledge and were not checked against a source this session are labelled **[unverified]**. Exact current version numbers (Electron N, Tauri 2.x minor, Godot 4.x minor, Unity 6.x) were not confirmed. The newest versions that show up in sources are Godot 4.6.1, Unity 6.3, and Electron ~38+ (Chromium 139, June 2025).

## Q1. Candidate stacks: transparency, click-through, cost, packaging, known bugs

### Takeaway
Only Electron has a documented, widely used click-through pattern (`setIgnoreMouseEvents(ignore, {forward:true})`), plus a 5k-star Claude Code desktop pet built on that exact pattern. Tauri v2 can do the same job with a much smaller installer, but `set_ignore_cursor_events` turns the whole window on or off and stops delivering mouse-move events once it is on, so per-pixel hit-testing needs a cursor-polling workaround. Godot 4 is the strongest native 3D option, but its built-in passthrough is a polygon and forum threads report bugs on Windows. Unity needs Win32 DWM workarounds that are Windows-only and fragile. Wayland limits every stack.

### Cited Findings
**Electron + three.js**
- Electron's docs: `setIgnoreMouseEvents(ignore)` makes the window ignore all mouse events. On Windows and macOS, an optional `{forward: true}` still sends mouse-move messages to the page, so the renderer gets `mouseenter`/`mouseleave` and can switch ignoring back off over the character. This works per region or per element, not per pixel. — [Electron Window Customization](https://www.electronjs.org/es/docs/latest/tutorial/window-customization)
- The docs also say transparent areas of a transparent window can't be clicked through by default (issue #1335). — [Electron Window Customization](https://www.electronjs.org/es/docs/latest/tutorial/window-customization)
- On macOS, `@loomhq/electron-click-through-workaround` turns `setIgnoreMouseEvents` into a no-op to bring back native per-pixel click-through of borderless NSWindows. Its author notes Electron 7+ calls `setIgnoreMouseEvents: NO` on new windows. Last release about a year ago. — [npm @loomhq/electron-click-through-workaround](https://npmjs.com/package/@loomhq/electron-click-through-workaround)
- `electron-transparency-mouse-fix` (CSS pointer-events approach) is deprecated on npm. — [npm](https://www.npmjs.com/package/electron-transparency-mouse-fix)
- Project notes (Peek) say coordinate-based hit testing with `forward:true` fails on macOS, and that the GPU-disabled workaround stopped preserving transparent-pixel click-through in Electron ~38 nightly (Chromium 139, June 2025). These notes contradict the official docs on macOS `forward` support and are unverified. — [Peek click-through research](https://tangled.org/burrito.space/peek/blob/main/notes/click-through-research.md)
- On Windows, `focusable: false` implies `skipTaskbar: true`. — [Electron BaseWindow docs](https://electronjs.org/fr/docs/latest/api/base-window)
- A common overlay pattern is `win.setAlwaysOnTop(true, "screen-saver")` plus `showInactive()` so the window doesn't take focus. — [production-taskbar-client mainWindow.js](https://gitfront.io/r/Elendiar/21SQq6UV13ja/production-taskbar-client/blob/src/main/mainWindow.js); [Electron BrowserWindow docs](https://github.com/electron/electron/blob/v12.0.0-beta.21/docs/api/browser-window.md)
- Over fullscreen games, the taskbar can reappear on click. Fullscreen/kiosk mode blocks transparency. Older workaround: `--enable-transparent-visuals --disable-gpu`. — [SO answer (mirror)](https://coderapp.vercel.app/answer/37766911)
- Frameless, non-minimizable windows bounce back on Win+D/Win+M (Electron 16, 2022). — [SO mirror](https://kaweah.freedombox.rocks/kiwix/stackoverflow.com_en_all_2023-11/questions/70547227/pressing-win-d-causes-an-electron-window-that-is-not-allowed-to-minimize-to-mi)

**Tauri v2 + three.js**
- Community code treats `set_ignore_cursor_events` as a switch for the whole window. A tauri-plugin-polygon comment says there is "no way to ignore cursor event separately for each polygon". — [tauri-plugin-polygon source](https://docs.rs/crate/tauri-plugin-polygon/latest/source/src/desktop.rs)
- Usual workaround: the frontend checks the element under the cursor (`elementFromPoint`) and calls a Rust command to toggle ignoring. Once click-through is on, no more mousemove events reach the webview, so the cursor has to be polled from the Rust side. — [Tauri transparent-area click-through note (Chinese)](https://lincdocs.github.io/MdNote_Public/01.%20DesignAndDevelop/Develop/04.%20Project/Platform/Multi/Tauri/%E6%88%91%E7%9A%84%E7%AC%94%E8%AE%B0/Tauri%E9%80%8F%E6%98%8E%E5%8C%BA%E5%9F%9F%E7%A9%BF%E9%80%8F.html); one project polls every 120 ms — [CodeWalkers deepwiki](https://deepwiki.com/you-want/CodeWalkers/2.1.1-window-and-click-through-logic)
- Issue #9250 asks for mouse enter/exit detection while cursor events are ignored. Issue #11461 reports click-through failing on a child webview window on Windows 10. Issue #13415 is also related. — [tauri#9250](https://github.com/tauri-apps/tauri/issues/9250); [tauri#11461](https://github.com/tauri-apps/tauri/issues/11461); [tauri#13415](https://github.com/tauri-apps/tauri/issues/13415)
- Tauri desktop pets already exist: WindowPet (Tauri + React, MIT, Win/macOS/Linux) and IMMINJU/claude-pet (Tauri 2). — [WindowPet](https://www.Github.com/SeakMengs/WindowPet); [IMMINJU/claude-pet](https://github.com/IMMINJU/claude-pet)

**Electron vs Tauri cost**
- The installer-size gap holds up across sources: Tauri is a few MB to ~10 MB, Electron ~80–200 MB. One Windows 11 test measured 1.05 MB vs 106.1 MB for the same app. — [Better Stack Electron vs Tauri](https://betterstack.com/community/guides/scaling-nodejs/tauri-vs-electron-vs-deno-vs-electrobun/); [tech-insider 2026](https://tech-insider.org/tauri-vs-electron-2026/)
- Idle RAM numbers are inconsistent. Better Stack measured Tauri 109 MB vs Electron 128 MB, another test 142 vs 149 MB, while blogs claim Tauri at 30–50 MB. One 2026 analysis notes the widely repeated "96% smaller / 5x less RAM" claim has no reproducible benchmark. — [Better Stack](https://betterstack.com/community/guides/scaling-nodejs/tauri-vs-electron-vs-deno-vs-electrobun/); [eltexsoft](https://eltexsoft.com/blog/cross-platform-desktop-app-development-you-re-arguing-about-the-wrong-number/); [moklabs 2026 report](https://moklabs-research.pages.dev/reports/technology/2026-03-20-tauri-vs-electron-desktop-framework-decision)

**Godot 4.x**
- The `transparent` window flag does nothing unless `display/window/per_pixel_transparency/allowed` is on. Always-on-top is ignored for fullscreen windows. — [Godot Window docs 4.2](https://docs.godotengine.org/en/4.2/classes/class_window.html)
- `mouse_passthrough_polygon` / `DisplayServer.window_set_mouse_passthrough` sets a hit region. Clicks outside it fall through to windows below. — [Godot Window docs 4.3](https://docs.godotengine.org/es/4.3/classes/class_window.html); [Godot forum](https://forum.godotengine.org/t/mousepassthrough-for-non-same-applications/49284)
- Known problems: on Windows nothing renders outside the polygon (seen in Godot 3.4; not confirmed for 4.x) — [godot#57835](https://github.com/godotengine/godot/issues/57835). With 4.6.1, a polygon from Polygon2D made the sprite disappear — [forum](https://forum.godotengine.org/t/mouse-passthrough-polygon-method-couses-my-animated-sprite-to-disappear/135419). With 4.4.1, after a while the screen goes dark or white, the Win10 taskbar glitches, and passthrough stops — [forum](https://forum.godotengine.org/t/need-help-visual-glitch-of-windows-tool-bar-and-dark-screen-using-transparent-and-passthrough-windows/116526). With 4.3, a monitor-sized always-on-top window gets switched to exclusive fullscreen automatically, so keep the window 1 px smaller — [forum](https://forum.godotengine.org/t/window-transparency-sometimes-not-working/86812)
- Per-pixel alternative: switch between clickable and passthrough based on the alpha under the cursor. A Godot 4.5 demo does this, and a 4.2.1 user applied it to 3D meshes. — [Godot forum: passthrough to desktop](https://forum.godotengine.org/t/how-to-passthrough-mouse-to-desktop/66531)
- Plugins: "Windows Mouse Passthrough" sets Win32 flags (Godot 4.3+, Windows only). "Mouse Passthrough Manager" 1.0.1 is a C# plugin for Godot 4.6+ (.NET). — [Godot store](https://store.godotengine.org/asset/jakub-hubacek/windows-mouse-passthrough/); [Asset library](https://www.godotengine.org/asset-library/asset/5154)
- DeskPat, a desktop cat built with Godot 4.6, shows the stack works for desktop pets. — [Godot forum DeskPat](https://forum.godotengine.org/t/deskpat-a-desktop-cat-companion-built-with-godot-4-6/139713)

**Unity 6**
- Transparency on Windows: `DwmExtendFrameIntoClientArea` with margins -1. Click-through: add `WS_EX_LAYERED | WS_EX_TRANSPARENT` to `GWL_EXSTYLE`. — [Unity Discussions](https://discussions.unity.com/t/how-do-i-make-the-background-of-my-window-transparent-with-the-windows-api/1659287); [kirurobo gist](https://gist.github.com/kirurobo/001232ef4ce704e426b6dee84427caf2)
- Reported problems: users can switch to click-through but not back; the app pauses when clicked through; URP needs extra work; in Unity 6.3, "Use DXGI Flip Model Swapchain for D3D11" has to be unticked. — [Unity Discussions](https://discussions.unity.com/t/how-to-make-a-unity-game-window-transparent-and-click-through/1704947); [Unity Discussions (toggle)](https://discussions.unity.com/t/question-enable-disable-clickthrough/673283); [SO URP](https://kaweah.freedombox.rocks/kiwix/content/stackoverflow.com_en_all_2023-11/questions/68192514/how-can-i-get-a-transparent-game-window-in-unity-using-universal-render-pipeli)
- Mate Engine shows Unity can carry a complete VRM desktop-mate product, but its macOS and Linux versions are separate community ports (see Q5). — [Mate-Engine](https://github.com/language-coder/Mate-Engine)

**Other stacks (Bevy/Rust, Flutter, WinUI/WPF, PyQt)**
- Qt 6 with LayerShellQt can build a click-through overlay on Wayland (koverlay). — [koverlay](https://github.com/erik96/koverlay)
- claudlet is a Python (pipx) pixel buddy that perches on terminal title bars, so a Python Qt pet is workable. — [claudlet PyPI](https://pypi.org/project/claudlet/1.4.1/)

### Inferences
- For a web developer who wants 3D with three.js, Electron is the least risky path. Tauri trades about 100 MB of installer for extra native work: cursor polling, plus a different WebView engine on each OS.
- Godot is a good option if the developer prefers an engine to web tech: small runtime, real 3D, built-in window flags. The forum reports of Windows passthrough glitches mean it needs prototyping before committing.
- Unity is the weakest choice for a cross-platform open-source release: Win32-only transparency workarounds, runtime licence terms, large builds.

### Gaps
- I did not verify the current Electron major version, the exact Tauri 2.x API (`set_ignore_cursor_events`, `set_always_on_top`, `set_skip_taskbar`, `set_visible_on_all_workspaces`), Godot 4.6 transparency on macOS/Linux, or Unity 6 runtime fee terms.
- I found no measured idle CPU/GPU numbers for a 3D overlay at 15–30 fps in any stack.
- Flutter, Bevy, WinUI/WPF: not researched for budget reasons. **[unverified]** Bevy/winit support transparent, undecorated windows and `set_cursor_hittest`. WPF supports `AllowsTransparency` but is Windows-only.
- Code signing and auto-update: not researched. **[unverified]** electron-builder/electron-updater and the Tauri updater plugin both exist. Unsigned Windows builds trigger SmartScreen warnings, and unsigned or un-notarized macOS builds are blocked by Gatekeeper.

## Q2. Click-through details: one full-screen window vs a small moving window

### Takeaway
Every stack ends up with the same pattern: ignore mouse events by default, and turn them back on while the cursor is over the character's opaque pixels. Electron gets cursor position through `forward:true`. Tauri and Godot have to poll the global cursor position. A small window that moves with the character avoids the full-screen-transparent-window problems (exclusive-fullscreen promotion in Godot, cost of compositing large transparent areas, multi-monitor spanning), but moving it makes walking along edges more complicated.

### Cited Findings
- Electron: toggle `setIgnoreMouseEvents(true, {forward:true})` and switch it off on the character's `mouseenter`. — [Electron docs](https://www.electronjs.org/es/docs/latest/tutorial/window-customization)
- Tauri: toggling is all-or-nothing and mousemove stops while ignoring, so poll the cursor (e.g. every 120 ms) and compare it with the character's bounds. — [CodeWalkers](https://deepwiki.com/you-want/CodeWalkers/2.1.1-window-and-click-through-logic); [tauri#9250](https://github.com/tauri-apps/tauri/issues/9250)
- Godot: the polygon must be updated every frame to follow the sprite (the demo does it in `_physics_process`), or use per-pixel alpha toggling. — [Godot forum](https://forum.godotengine.org/t/how-can-i-click-through-the-screen-while-keeping-a-transparent-screen/64195); [forum](https://forum.godotengine.org/t/how-to-passthrough-mouse-to-desktop/66531)
- Win32: `WS_EX_LAYERED | WS_EX_TRANSPARENT` makes the whole window mouse-transparent. — [SO mirror "what makes this click through"](https://windows-hexerror.linestarve.com/q/so45523625-what-makes-this-click-through)
- Godot full-monitor always-on-top windows get promoted to exclusive fullscreen. Keep the window smaller than the monitor. — [Godot forum](https://forum.godotengine.org/t/window-transparency-sometimes-not-working/86812)
- Clawd on Desk (Electron) is a working reference: a transparent always-on-top pet window with permission bubbles. — [brightcoding on clawd-on-desk](https://blog.brightcoding.dev/2026/09/29/rullerzhou-afkclawd-on-desk-desktop-pet-for-ai-coding-agents)

### Inferences
- Recommended: a small window, about 2x the character's bounding box plus room for the speech bubble, moved via `setBounds`/`setPosition` from the main process. It avoids spanning monitors with different DPI, keeps the transparent composited area small, and limits damage if click-through misbehaves. Hit-test the character's silhouette with a raycast against the three.js mesh, or by reading the alpha of one pixel with `gl.readPixels`, and toggle ignoring based on the result.
- A full-virtual-desktop window makes free roaming simpler (no window moves), but adds per-monitor DPI mismatch problems and forces compositing of a huge transparent surface.

### Gaps
- I found no benchmark comparing a full-screen transparent WebGL window with a small one on Windows 11 DWM.
- **[unverified]** WM_NCHITTEST returning HTTRANSPARENT only passes clicks to windows in the same thread, so it doesn't work for cross-process click-through. `WS_EX_TRANSPARENT` with `WS_EX_LAYERED` is the cross-process mechanism.

## Q3. Detecting the environment (windows, taskbar, DPI) on Windows, macOS and Linux

### Takeaway
On Windows, all the needed data is reachable: top-level windows via EnumWindows, frame bounds via DWMWA_EXTENDED_FRAME_BOUNDS, foreground changes via SetWinEventHook, taskbar via SHAppBarMessage / monitor work area. In Node, get-windows covers enumeration and bounds; anything finer needs koffi FFI or a small native helper. macOS returns window bounds without permission but hides titles unless Screen Recording is granted. Wayland doesn't allow global window enumeration or positioning at all.

### Cited Findings
- `get-windows` (renamed from `active-win`, which is now deprecated; v9.2.3) returns the active window and open windows with title, id, bounds and owner on macOS 10.14+, Linux and Windows 7+. — [get-windows GitHub](https://www.Github.com/sindresorhus/get-windows); [npm](https://www.npmjs.com/package/get-windows)
- `node-window-manager`: `getBounds()` works on Windows and macOS, Linux support is still in progress, and the last release was about a year ago. — [node-window-manager README](https://cdn.jsdelivr.net/npm/node-window-manager@2.2.4/README.md); [socket.dev](https://socket.dev/npm/package/node-window-manager)
- macOS: `CGWindowListCopyWindowInfo` returns pid, layer and bounds without permission, but redacts `kCGWindowName` (titles) unless Screen Recording is granted (10.15+ / 12.3+). Check with `CGPreflightScreenCaptureAccess`. Which keys come back without permission is undocumented and has changed in a macOS 27 beta. — [x-win permission.rs](https://docs.rs/crate/x-win/5.7.0/source/src/macos/permission.rs); [Apple forum 839069](https://developer.apple.com/forums/thread/839069); [Apple forum 126860](https://developer.apple.com/forums/thread/126860). Conflict: a Tauri MCP source says no permission is needed at all — [tauri-mcp macos.rs](https://glama.ai/mcp/servers/@DonsWayo/tauri-mcp/blob/a1558da1c1ecf2de783596deabe57054acc99182/src/platform/macos.rs)
- Use `kCGWindowListOptionAll`, because on-screen-only enumeration misses windows when a browser is fullscreen. — [Mozilla bug 1627414](https://bugzilla.mozilla.org/show_bug.cgi?id=1627414)
- Rust: the `x-win` crate gives cross-platform active/open window info. — [x-win](https://docs.rs/crate/x-win/5.7.0/source/src/macos/permission.rs)
- Wayland: clients can't position windows in global coordinates, and there's no standard always-on-top protocol. GTK4 dropped `set_keep_above`. — [freedesktop wayland#305](https://gitlab.freedesktop.org/wayland/wayland/-/issues/305); [GNOME Discourse](https://discourse.gnome.org/t/gtk4-set-window-always-on-top-and-on-center-of-current-monitor/9068); [GNOME Discourse 2](https://discourse.gnome.org/t/any-way-to-set-window-always-on-top-programmatically/31579)
- Workaround: `wlr-layer-shell` (positions by anchors and margins; the overlay layer can sit above fullscreen apps). Mutter (GNOME) doesn't implement it; some wrappers list GNOME 47+ as a requirement. Wayneko is a layer-shell desktop pet. — [layer-shell protocol docs](https://isaacfreund.com/docs/wayland/wlr-layer-shell-unstable-v1); [Wayneko](https://leon_plickat.srht.site/wayneko.html); [KDE Yakuake keep-above bug](https://bugs.kde.org/show_bug.cgi?id=470144)

### Inferences
- Windows-first plan: a small native helper. Options are koffi calling user32/dwmapi from Electron main, or a Rust sidecar using windows-rs. It enumerates visible top-level windows, uses `DWMWA_EXTENDED_FRAME_BOUNDS` (GetWindowRect includes the invisible resize borders on Win10/11), filters cloaked or minimized windows, reads the taskbar rectangle and edge from `SHAppBarMessage(ABM_GETTASKBARPOS)`, and pushes updates on `EVENT_SYSTEM_FOREGROUND` / `EVENT_OBJECT_LOCATIONCHANGE` hooks. Electron's `screen.getAllDisplays()` gives `workArea`, from which the taskbar edge can be inferred **[unverified]**.
- On Linux, ship with "X11 full features / Wayland: roam inside bounds, no window sitting" as the stated limitation. Running Electron/Tauri under XWayland (`--ozone-platform=x11` / `GDK_BACKEND=x11`) restores most of the behavior **[unverified]**.

### Gaps
- I found no source confirming whether get-windows uses DWM extended frame bounds on Windows.
- koffi, windows-rs, and Tauri window-enumeration plugins were not individually confirmed. Per-monitor-DPI coordinate conversion in Electron was not researched.

## Q4. Staying on top, fullscreen apps and games, focus, Alt-Tab, tray; rendering cost

### Takeaway
Use `alwaysOnTop` at the "screen-saver" level, `focusable:false` (which also hides the taskbar button on Windows), `showInactive`, and a tray icon. Overlays over exclusive-fullscreen games aren't reliable in any stack, so detect fullscreen and hide. Cap rendering at 15–30 fps and pause when idle.

### Cited Findings
- `setAlwaysOnTop(true, 'screen-saver')` plus `showInactive()` is the usual pattern. — [taskbar client sample](https://gitfront.io/r/Elendiar/21SQq6UV13ja/production-taskbar-client/blob/src/main/mainWindow.js)
- `focusable:false` implies `skipTaskbar:true` on Windows. — [Electron BaseWindow](https://electronjs.org/fr/docs/latest/api/base-window)
- Overlays over fullscreen games: the taskbar appears on click, and kiosk/fullscreen breaks transparency. — [SO mirror](https://coderapp.vercel.app/answer/37766911)
- Godot ignores always-on-top for fullscreen windows. — [Godot docs](https://docs.godotengine.org/en/4.2/classes/class_window.html)
- On Wayland, the layer-shell overlay layer is normally shown above fullscreen windows, where supported. — [layer-shell docs](https://isaacfreund.com/docs/wayland/wlr-layer-shell-unstable-v1)

### Inferences
- Rendering: three.js with `WebGLRenderer({alpha:true, premultipliedAlpha:true, antialias:true})` and `setClearColor(0x000000, 0)`, plus `transparent:true`, `backgroundColor:'#00000000'`, `frame:false`, `hasShadow:false` on the BrowserWindow **[unverified, background knowledge]**. Drive frames with `renderer.setAnimationLoop` throttled by delta time to about 24 fps, and stop rendering entirely when the character is idle and nothing has changed. Low-poly glTF with baked or toon materials keeps GPU cost negligible.
- WebGPU (`three/webgpu`) is not needed for this workload, and WebGL2 has better transparency compatibility.

### Gaps
- I did not research WebGPU status in current Electron/WebView2, or premultiplied-alpha fringe bugs in transparent WebView2 (Tauri). Hiding from Alt-Tab via `WS_EX_TOOLWINDOW` is **[unverified]**.

## Q5. Existing open-source projects (desktop pets, AI companions, Claude Code pets)

### Takeaway
The closest prior art is the group of 2026 Claude Code hook-driven pets, especially Clawd on Desk (Electron, ~5.4k stars), which already implements the hook-to-overlay pipeline and permission bubbles. For 3D VRM rendering on the desktop, look at AIRI (Electron + three.js/VRM, MIT) and Mate Engine (Unity, sits on windows/taskbar, AGPL mix). Shimeji-style ports are the reference for window-edge sitting and climbing.

### Cited Findings
**Claude Code / coding-agent pets (2025–2026)**
- **Clawd on Desk** (rullerzhou-afk): Electron, transparent always-on-top, 12 animated states, auto-registers Claude Code and Codex CLI hooks, "Permission Bubble" for tool requests. ~5,405 stars reported July 2026. — [brightcoding](https://blog.brightcoding.dev/2026/09/29/rullerzhou-afkclawd-on-desk-desktop-pet-for-ai-coding-agents); [sourcepulse](https://www.sourcepulse.org/projects/26954562)
- **IMMINJU/claude-pet**: Tauri 2. Hooks send events over a TCP socket, and hooks are auto-registered on startup. — [GitHub](https://github.com/IMMINJU/claude-pet)
- **xtrimsystems/claude-pet**: Linux/X11, GTK3. Hooks write state to a file that the pet reads. — [GitHub](https://github.com/xtrimsystems/claude-pet)
- **varie-claude-avatar**: a Spine-animated overlay installed as a Claude Code plugin. — [GitHub](https://github.com/varie-ai/varie-claude-avatar)
- **claudlet**: Python (pipx) pixel buddy that perches on terminal title bars, roams, and sleeps between tasks. — [PyPI](https://pypi.org/project/claudlet/1.4.1/)
- **petdex-cc** (hooks, levels, optional AI speech) — [README](https://cdn.jsdelivr.net/npm/petdex-cc@0.1.14/README.md); **Woofy** — [GitHub](https://github.com/dashty8/woofy); agentpet — [GitHub](https://github.com/ntd4996/agentpet)
- Unconfirmed: "Claude Desktop Buddy" (an M5Stack hardware buddy) is said to have been open-sourced by Anthropic in April 2026. The only source is a Medium post. — [Medium](https://medium.com/@roanmonteiro/claude-desktop-buddy-m5stack-physical-ai-for-your-dev-setup-d4f8caa370d3)

**AI companions (3D/Live2D)**
- **AIRI (moeru-ai)**: desktop app "stage-tamagotchi" is Electron (a migration from Tauri was documented in an Oct 2025 devlog), Win/macOS/Linux, Live2D and VRM via `packages/stage-ui-three` and `stage-ui-live2d` with auto-blink, look-at and idle animations. Licence mostly reported as MIT, but sub-packages may differ. Has LLM chat and voice. — [AIRI intro](https://mintlify.com/moeru-ai/airi/introduction); [Live2D/VRM rendering notes](https://yudady.github.io/concepts/live2d-and-vrm-model-rendering/); [itch devlog](https://nekomeowww.itch.io/airi/devlog/1002646/devlog-20250805); [v0.15.0 release](https://newreleases.io/project/github/moeru-ai/airi/release/v0.15.0)
- **Open-LLM-VTuber**: Electron desktop-pet mode (transparent, top-most, click-through toggle added in v1.2.0), Live2D, LLM chat and voice. Licence: the frontend moved to the custom "Open-LLM-VTuber License 1.0" in v1.2.0, the backend is MIT for now with unification planned. Not OSI-permissive. — [v1.2.0 release](https://docs.llmvtuber.com/en/blog/v1.2.0-release); [v1.0.1 release](https://docs.llmvtuber.com/blog/v1.0.1-release)
- **Amica** (semperai): fork of pixiv's ChatVRM, 3D VRM, MIT, LLM chat and voice. Web-based rather than an overlay. — [Amica fork](https://github.com/eaphone/amica); [sourcepulse](https://www.sourcepulse.org/projects/944511)
- **Mate Engine** (shinyflvre): Unity, VRM, "Windows / Taskbar Sitting", always-in-front toggle, modding. Licence is a mix of AGPL-3.0 and MateProv2. The default avatar can't be redistributed. Free on GitHub, paid on Steam. Unofficial Linux and Mac ports exist. — [Mate-Engine fork README](https://github.com/language-coder/Mate-Engine); [Steam](https://store.steampowered.com/app/3625270/MateEngine/); [Linux port](https://github.com/BNDSer/Mate-Engine-Mac)

**Classic desktop pets**
- **WindowPet** (SeakMengs): Tauri + React, MIT, Win/macOS/Linux, inspired by Shimeji-ee and DPET. — [GitHub](https://www.Github.com/SeakMengs/WindowPet)
- **Shimeji Desktop Mascot**: Windows reimplementation of Shimeji-ee that walks, climbs and sits on open windows. GPLv3. — [SourceForge](https://sourceforge.net/p/shimeji-desktop/)
- **VPet-Simulator** (LorisYounger/VPet): WPF/.NET, Windows-only, licence listed as Apache-2.0 by an aggregator (not verified). — [ecosyste.ms](https://awesome.ecosyste.ms/projects/github.com%2FLorisYounger%2FVPet)
- **DeskPat** (Godot 4.6 desktop cat) — [Godot forum](https://forum.godotengine.org/t/deskpat-a-desktop-cat-companion-built-with-godot-4-6/139713); **Wayneko** (Wayland layer-shell) — [site](https://leon_plickat.srht.site/wayneko.html)

### Which already do window-edge sitting/walking, LLM chat, TTS (per sources found)
| Project | Stack | Window/taskbar sitting | LLM chat | Voice/TTS |
|---|---|---|---|---|
| Clawd on Desk | Electron | not stated | no (reacts to agent) | not stated |
| claudlet | Python | perches on terminal titlebar | no | no |
| Mate Engine | Unity | yes (taskbar/window) | not confirmed | not confirmed |
| Shimeji Desktop Mascot | (Windows) | yes (walk/climb/sit) | no | no |
| AIRI | Electron+three/VRM | not confirmed | yes | yes |
| Open-LLM-VTuber | Electron+Live2D | no | yes | yes |
| Amica | Web, three/VRM | no | yes | yes |

### Inferences
- Lifting Clawd on Desk's hook-installer and event pipeline, AIRI's three-vrm rendering setup, and Shimeji's edge-walking logic (the "floor = taskbar top or window top edge" model) together cover most of the BMO feature set.
- Licence caution: Open-LLM-VTuber (custom licence) and Mate Engine (AGPL plus proprietary parts) are fine to study but not to copy into an MIT project.

### Gaps
- I did not confirm Clawd on Desk's licence, its IPC mechanism (HTTP port vs file), or whether it supports sitting on windows (fetch rejected). Same for eSheep, Desktop Goose-like clones, Bongo Cat overlays, z-waif, Soul of Waifu, ChatVRM's own licence, and Desktop Mate (commercial).

## Q6. IPC between the hook script and the overlay, single instance, auto-start

### Takeaway
Existing Claude Code pets use three IPC styles: a local TCP socket (IMMINJU, Tauri), a state file (xtrimsystems), and hook auto-registration on app start (Clawd, IMMINJU). The most robust option is a localhost HTTP endpoint (POST /event) with an optional WebSocket for the renderer, bound to 127.0.0.1 with a random token.

### Cited Findings
- IMMINJU/claude-pet: hooks send events over a TCP socket to the UI and are registered automatically when the app starts. — [GitHub](https://github.com/IMMINJU/claude-pet)
- xtrimsystems/claude-pet: hooks write state to a file and the pet polls it. — [GitHub](https://github.com/xtrimsystems/claude-pet)
- Clawd on Desk auto-registers Claude Code and Codex hooks and shows permission bubbles, so the IPC is two-way (approve/deny goes back to the hook). — [brightcoding](https://blog.brightcoding.dev/2026/09/29/rullerzhou-afkclawd-on-desk-desktop-pet-for-ai-coding-agents)

### Inferences
- Design: the Electron main process runs an HTTP server on `127.0.0.1:<fixed port>` (e.g. 47xxx) with a token stored in `%APPDATA%/<app>/token`. The hook script is a tiny `curl`/node one-liner that POSTs JSON, with a short timeout and fire-and-forget behavior so the hook never blocks Claude Code when the pet isn't running. Main forwards events to the renderer via IPC. A named pipe works on Windows, but HTTP is the same on all three OSes and easy to call from shell hooks.
- Single instance: `app.requestSingleInstanceLock()` in Electron; `tauri-plugin-single-instance` in Tauri **[unverified]**. Auto-start: `app.setLoginItemSettings({openAtLogin:true})` (Windows/macOS) and an XDG autostart `.desktop` file on Linux; `tauri-plugin-autostart` **[unverified]**.

### Gaps
- No source was retrieved that confirms the current Electron/Tauri single-instance and autostart APIs.

---

## Ranked recommendation (for the report writer)

1. **Top choice: Electron + three.js (with @pixiv/three-vrm or plain GLTFLoader)**. Reasons: (a) the only stack with a documented click-through mechanism that keeps delivering cursor movement (`setIgnoreMouseEvents(true,{forward:true})`) on Windows and macOS; (b) direct prior art for the same product in the same stack (Clawd on Desk, AIRI, Open-LLM-VTuber); (c) mature packaging and auto-update tooling, the same Chromium on every OS (no WebView2/WebKitGTK transparency differences), and Node access to koffi/get-windows for Win32 window enumeration; (d) fits a web-comfortable solo developer and a Blender → glTF pipeline. Costs: ~100 MB installer and ~100–150 MB RAM, which is acceptable for a companion app.
2. **Runner-up: Tauri v2 + three.js**. Same frontend code, roughly 10x smaller installer, Rust (windows-rs) for window detection. Held back by whole-window-only click-through (cursor must be polled in Rust), open issues on Windows click-through and mouse enter/exit, and three different WebViews to test transparency on. Choose it if installer size matters more than development speed.
3. **Godot 4.6** is the alternative if the developer prefers an engine to web tech: native 3D, small export, built-in transparency, always-on-top and passthrough flags. Forum reports of Windows passthrough and rendering glitches mean it needs a prototype before committing.
- **Not recommended:** Unity (Win32 workarounds, fragile toggling, weak cross-platform story for this use), PyQt (weak 3D), native WinUI/WPF (Windows-only).
- Linux caveat for any stack: full feature set on X11/XWayland only. Wayland gets a reduced mode.

**Projects to study (top 5)**
1. Clawd on Desk (rullerzhou-afk), Electron: hook auto-registration, state machine, permission bubbles.
2. AIRI (moeru-ai): stage-tamagotchi for an Electron + three.js VRM desktop overlay, MIT.
3. IMMINJU/claude-pet: Tauri 2 version with TCP hook IPC, for comparison.
4. Shimeji Desktop Mascot / Shimeji-ee lineage (GPLv3): logic for walking along window and taskbar edges and climbing (study only, don't copy into MIT).
5. Mate Engine (Unity, AGPL mix): taskbar/window sitting for a 3D VRM character, as a UX reference.
