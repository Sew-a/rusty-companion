# Asset and animation pipeline: boxy console robot with a 2D screen face (Blender -> glTF -> three.js / Godot), as of November 2026

Reading guide for the report writer:

- **[V]** = verified this session by opening the page or by a search result that quoted it.
- **[S]** = seen only in a search-result summary of a secondary source (blog/aggregator); treat as probable, not confirmed.
- **[BK]** = researcher background knowledge (training data up to mid-2026); the linked URL is the canonical doc where it should be checked, but the page was NOT re-opened this session.
- Research was cut short by a fetch rate limit, so several runtime/Godot/TTS items are [BK]. They are stable, long-standing APIs, but version-specific details should be re-checked.
- Version snapshot found: Blender 5.1 released 17 March 2026 [V]; release-notes pages exist for 5.3 and the nav lists "5.4 (alpha)" [V], so 5.2 and probably 5.3 are out by November 2026 (exact dates unconfirmed). three.js r186 dated 8 September 2026 is the newest release found [S]. Godot 4.6 released January 2026, 4.7 was in beta in the results found [S].

---

## 1. Modelling and rigging

### Takeaway
For a boxy robot, build it from a handful of primitives (a few hundred to ~2,000 triangles), give it a tiny hand-made armature (about 10-12 bones) and bind each part rigidly to one bone (or parent parts to bones) instead of weight painting; skip Rigify. Use flat colours via Principled BSDF (or an unlit material) plus an emissive/unlit screen; all of that survives glTF export.

### Cited Findings
- The Blender glTF add-on supports "Materials (Principled BSDF) and Shadeless (Unlit)" and "Animation (keyframe, shape key, and skinning)". [V] — [Blender 5.1 manual, glTF 2.0](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html)
- Core glTF material channels exported: Base Color, Metallic, Roughness, baked Ambient Occlusion, Normal Map, Emissive. Anything that is not expressible in those channels (procedural textures, ColorRamp toon shaders, arbitrary node maths) does not export unless baked to an image. [V for the channel list; the "procedural nodes do not export" consequence is BK] — [Blender 5.1 manual, glTF 2.0](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html)
- Unlit export: "To export an unlit material, mix in a camera ray, and avoid using the Principled BSDF node." The result is written with `KHR_materials_unlit`. [V] — [Blender 5.1 manual, glTF 2.0](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html)
- Export-side extensions listed in the 5.1 manual: `KHR_draco_mesh_compression`, `KHR_lights_punctual`, `KHR_materials_clearcoat`, `KHR_materials_transmission`, `KHR_materials_unlit`, `KHR_materials_emissive_strength`, `KHR_materials_volume`, `KHR_materials_sheen`, `KHR_materials_specular`, `KHR_materials_anisotropy`, `KHR_materials_ior`, `KHR_materials_variants`, `KHR_texture_transform`, `EXT_mesh_gpu_instancing`. [V] — [Blender 5.1 manual, glTF 2.0](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html)
- Emission strength above 1.0 is carried by `KHR_materials_emissive_strength` (in the export list above); three.js GLTFLoader reads it into `emissiveIntensity`. [V for extension support in Blender; BK for the three.js mapping] — [three.js GLTFLoader docs](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)
- Rigify is Blender's bundled auto-rig generator built around meta-rigs for humans/animals; it generates control rigs with many helper (non-deform) bones. [BK] — [Blender manual, Rigify](https://docs.blender.org/manual/en/latest/addons/rigging/rigify/index.html)
- The glTF exporter has an "export only deform bones" setting (mentioned in 4.4 fix list: crashes "with armature object and 'export only def bones' settings" were fixed), which is what you need if a control rig is ever used. [V] — [Blender 4.4 release notes, Pipeline/IO](https://developer.blender.org/docs/release_notes/4.4/pipeline_assets_io/)
- Blender 5.0 changed bone visibility/selection to be stored per pose bone: "These changes break backwards compatibility for the Python API." Relevant to any AI-written rigging script that hides/selects bones. [V] — [Blender 5.0 release notes, Animation & Rigging](https://developer.blender.org/docs/release_notes/5.0/animation_rigging/)

### Inferences
- **Polygon budget.** No authoritative "budget" exists for a desktop pet; it is a single character rendered at 150-300 px. A body box with bevelled edges, a recessed screen quad, 6-8 buttons, and 4 limbs made of 6-8-sided cylinders lands at roughly 500-2,000 triangles. Anything under ~10k triangles is irrelevant for performance on any GPU from the last decade; the real constraint is silhouette readability at small size, so prefer chunky shapes and thick limbs over detail.
- **Two viable structures.**
  1. *Rigid hierarchy, no armature*: body object with arm/leg segment objects parented to each other, animated as object transforms. glTF exports this as node animation; three.js plays it identically to skeletal clips. Downsides: the Blender glTF exporter treats each object's action/slot separately (see section 2), bending "noodle" limbs is impossible, and Godot retargeting tools assume skeletons.
  2. *Simple armature with rigid (100 %) weights* (recommended): one armature, each mesh part assigned to exactly one bone with weight 1.0 (or bone-parented). No weight painting, all animation lives in one Action per clip on one armature, and the exporter's defaults work. If the limbs are thin tubes that should bend softly (rubber-hose arms), give each limb 2 bones and let automatic weights handle the tube; tubes are the one case where automatic weights are reliably fine.
- **Suggested bone list (11-13 bones):** `root` (on the ground, for placement) -> `body` (pivot at the body's base/centre, used for squash, lean, bob) -> `arm_upper.L/R` -> `arm_lower.L/R` (-> optional `hand.L/R`), `leg_upper.L/R` -> `leg_lower.L/R` (-> optional `foot.L/R`). Add simple IK constraints on legs only if hand-animating a walk; IK is baked away at export because the exporter samples.
- **Rigify is overkill**: it targets human/animal proportions, creates hundreds of bones, and requires "deform bones only" export hygiene. A hand-made rig of ~12 bones is faster to build (and trivial for an AI assistant to create through Python: `armature.edit_bones.new(...)`).
- **Shading.** Two routes that export cleanly: (a) Principled BSDF with flat base colours, roughness ~1, metallic 0, lit by one directional + ambient light at runtime; or (b) unlit materials for a fully flat "sticker" look, immune to runtime lighting. A real toon ramp (banded shading) does not survive export; recreate it at runtime with `MeshToonMaterial` + a gradient map in three.js, or a toon shader in Godot. Flat shading (hard normals) does survive: use "Shade Flat"/sharp edges; note this splits vertices at export, which is harmless at this poly count.
- **Colour without textures.** Use one material per colour (5-8 materials = 5-8 draw calls, fine), or a single material with a tiny palette texture and UVs collapsed onto palette swatches (1 draw call). At this scale either is fine; per-colour materials are simpler for AI-scripted builds.
- **Screen face mesh.** Model the screen as a separate quad (own material, own named node, UVs filling 0-1) slightly in front of the body so the runtime can replace its material/texture (section 6). Leave it as a plain emissive or unlit placeholder in Blender.

### Gaps
- No authoritative source gives a polygon budget for this use case; numbers above are engineering judgement.
- The exact node graph Blender 5.x recognises as "unlit" (Emission + Transparent mix driven by Light Path "Is Camera Ray", or plain Emission/Background) was only seen as a one-line quote; test an export and confirm `KHR_materials_unlit` appears in the JSON chunk.
- Whether the 5.2/5.3 exporter still splits flat-shaded vertices the same way, and the 5.1 "preserve authored normals" toggle reported by one blog, are unconfirmed.

---

## 2. Animations: organising actions, stepped look, export settings

### Takeaway
Make one Action per clip on the single armature, keep every clip in place (no root motion; code moves the character), key on 2s/3s with constant interpolation or simply sample sparsely, and export with Animation mode "Actions" with sampling on. Since Blender 4.4 actions are slotted and the glTF exporter understands slots; scripts must use the layered-action API in 5.x.

### Cited Findings
- Blender 4.4 introduced slotted Actions in the glTF add-on: "Now, you can define your actions in Blender, with slots, and export them directly to glTF." and "You no longer need to use the NLA Track Names trick to merge multiple actions into a single glTF animation." [V] — [Blender 4.4 release notes, Pipeline/IO](https://developer.blender.org/docs/release_notes/4.4/pipeline_assets_io/)
- 4.4 exporter: "Scene animation is always baked" (so driven properties export) and a new interpolation fallback option was added. Exporter hook signatures changed (breaking) because of slots, which matters only for custom exporter extensions. [V] — [Blender 4.4 release notes, Pipeline/IO](https://developer.blender.org/docs/release_notes/4.4/pipeline_assets_io/)
- Animation mode options in the 5.1 exporter:
  - **Actions (default)**: "Actions which are **not** associated with an object in one of these ways are **not exported**" — i.e. an action must be the active action or be stashed/pushed onto an NLA track of the object. Tracks are merged by action (using slots), not by name, since 4.4.
  - **Active Actions merged**: one glTF animation from the active actions of all objects; NLA not used.
  - **NLA Tracks**: each NLA track exported as an independent glTF animation (useful with strip modifiers).
  - **Scene**: animation as seen in the viewport, as one animation or one per object.
  [V] — [Blender 5.1 manual, glTF 2.0](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html)
- "Merge Animation: Can be by Action (using slot), by NLA Track Name, or no merge." [V] — [Blender 5.1 manual, glTF 2.0](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html)
- Sampling options: "Apply sampling to all animations. Do not sample animation can lead to wrong animation export."; "Sampling Rate: How often to evaluate animated values (in frames)."; "Sampling Interpolation Fallback: Interpolation chosen for properties that are not keyed (LINEAR or STEP/CONSTANT)". Only the Actions and Active Actions merged modes can export unsampled animation. [V] (also confirmed in the manual bundled with the official Blender MCP server used in this session) — [Blender 5.1 manual, glTF 2.0](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html)
- Optimisation options: "Optimize Animation Size: Reduce exported file size by removing duplicate keyframes when all identical."; "Force keeping channel for armature / bones: if all keyframes are identical in a rig, force keeping the minimal animation."; "Reset pose bones between actions: ... This is needed when some bones are not keyed on some animations."; "Bake All Objects Animations: Useful when some objects are constrained without being animated themselves."; an Animation Filter restricts which actions export. [V] — [Blender 5.1 manual, glTF 2.0](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html)
- Compression in the built-in exporter (5.1 manual): only Draco ("Compress meshes using Google Draco", with quantisation settings); meshopt is not mentioned on the 5.1 page. [V] — [Blender 5.1 manual, glTF 2.0](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html)
- Meshopt in the Blender exporter: one secondary guide says `EXT_meshopt_compression`/`KHR_meshopt_compression` arrived in 5.2, another blog says 5.1. Conflicting and unverified. [S] — [Cinevva guide](https://app.cinevva.com/guides/blender-5-for-game-artists); contradicted by [StraySpark blog](https://www.strayspark.studio/blog/blender-5-1-features-game-developers-spring-2026)
- Blender 5.0 removed the legacy Action Python API (`action.fcurves`, `action.groups`); slotted/layered access (`action.slots`, `action.layers` -> strips -> channelbags -> fcurves) is required. Scripts written for <= 4.3 break. [S — reported by a secondary guide that says it tested on 5.0.1; the official 5.0 Animation page opened this session does not itself list it, it defers to a separate Python API page] — [Cinevva guide](https://app.cinevva.com/guides/blender-5-for-game-artists); official page checked: [Blender 5.0 Animation & Rigging notes](https://developer.blender.org/docs/release_notes/5.0/animation_rigging/)
- Blender 5.0: "When creating a driver via Python, it will no longer create an F-Curve modifier but instead create 2 keyframes." Operators `action.layer_prev`/`action.layer_next` removed. [V] — [Blender 5.0 Animation & Rigging notes](https://developer.blender.org/docs/release_notes/5.0/animation_rigging/)
- Blender 5.3 glTF: KTX2/`KHR_texture_basisu` import and export, animation-pointer export for custom properties in all animation modes, faster material export, plus fixes (bone parenting to skinned mesh, vertex colour export, custom properties). [V] — [Blender 5.3 release notes, Pipeline/IO](https://developer.blender.org/docs/release_notes/5.3/pipeline_io/)
- One blog claims the 5.0 glTF exporter "sometimes produced inconsistent animation output" fixed in 5.1. Vague and unverified. [S] — [StraySpark blog](https://www.strayspark.studio/blog/blender-5-1-features-game-developers-spring-2026)
- glTF animation samplers support three interpolation modes: `LINEAR`, `STEP`, `CUBICSPLINE`. [BK] — [glTF 2.0 specification, Animations](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#animations)

### Inferences
- **Organisation recipe.** One armature, one Action per clip, each with a single slot bound to the armature. Name actions exactly as the runtime will look them up (`idle`, `wave`, `walk`, `think`, `happy`, `sit_idle`, `sit_down`, `point`, `talk`, `appear`, `disappear`). Either give every action a Fake User and "Push Down"/stash it to the NLA, or (simplest for a scripted pipeline) have the build script create an NLA track per action before export. In "Actions" mode an action that is neither active nor on an NLA track is silently dropped — this is the classic "my clip is missing in the .glb" bug.
- **Key every bone on frame 1 of every action** (or enable "Reset pose bones between actions"). Otherwise bones not keyed in a clip inherit whatever pose the previous export pass left, and the runtime shows limbs stuck in the wrong pose after a transition.
- **Stop-motion look — three options, in order of robustness:**
  1. *Runtime quantisation* (recommended): animate smoothly (or sparsely) in Blender, export normally, and in three.js step the mixer time in 1/8-1/12 s increments (section 4). The look is adjustable at runtime and crossfades can also be made to "step".
  2. *Constant interpolation keys*: set keyframes to Constant and key on 2s/3s (at 24 fps scene rate: a key every 2-3 frames = 8-12 poses/s). Because the exporter samples by default, a constant curve becomes a dense series of repeated values; "Optimize Animation Size" removes only fully identical channels. It still plays correctly; file-size cost is negligible at this scale. Whether a sampled export emits `STEP` or `LINEAR` samplers for constant curves should be checked in the output (if LINEAR with per-frame samples, there is a 1-frame blend at each pose change that is invisible in practice).
  3. *Low sampling rate*: set Sampling Rate to e.g. 3 frames. Output is LINEAR between sparse samples, i.e. smooth in-betweens unless the runtime also quantises time — so this alone does not give a stepped look.
- **Root motion vs in-place.** Use in-place cycles. Neither three.js `AnimationMixer` nor a glTF clip has a root-motion concept; the app moves the character's root Object3D (or the transparent window itself) along the screen edge while the walk cycle plays, matching speed to foot stride to avoid sliding (at stepped 8-12 fps, foot sliding is barely perceptible anyway). Godot's AnimationTree does support root motion tracks, but in-place is still simpler for a desktop pet.
- **Scene frame rate.** Set the Blender scene to 24 fps and keep clips short (idle loop 2-4 s, gestures 1-2 s). glTF stores time in seconds, so the fps only affects sampling density.
- **Appear/disappear** are best done in code (scale/opacity tween, or a pop with squash on the `body` bone) rather than as authored clips, unless a specific gag (e.g. climbing up from behind the taskbar) is wanted.
- **Compression.** For a < 200 KB model, Draco/meshopt are not worth the decoder overhead (Draco needs a WASM decoder shipped with the app). If wanted, post-process with `gltf-transform`/`gltfpack` (meshopt + quantisation) rather than relying on exporter options.

### Gaps
- The official 5.0 Python API release-notes page (where `action.fcurves` removal would be stated) was not opened; the removal is from a secondary source. Check `https://developer.blender.org/docs/release_notes/5.0/python_api/` before writing scripts.
- Release dates/status of Blender 5.2 (expected LTS) and 5.3, and which version first shipped meshopt in the exporter, are unconfirmed.
- Exact sampler interpolation (`STEP` vs `LINEAR`) the 5.x exporter writes for constant-interpolated, sampled bone curves was not confirmed; inspect the exported glTF JSON.
- No good, current tutorial specifically on "stepped animation Blender -> glTF -> three.js" was located in the time available.

---

## 3. AI-assisted Blender work (MCP servers, AI 3D generators, auto-riggers)

### Takeaway
Hand-building via an MCP-driven Python script is the fastest route for a boxy robot: LLM-driven Blender is strong at primitive-based modelling, materials, armature creation and simple keyframes, weak at appealing motion. AI mesh generators and humanoid auto-riggers add cleanup work rather than save time for this character.

### Cited Findings
- **Official Blender MCP server**: published by Blender Lab (the Blender Foundation's experimental programme); a lightweight MCP server plus companion add-on. Architecture: MCP client <= stdio => `blender-mcp` <= TCP socket => Blender add-on. Docs at blender.org/lab/mcp-server, source at projects.blender.org/lab/blender_mcp. [S — the official page returned HTTP 403 to the fetcher] — [Blender Lab MCP readme](https://projects.blender.org/lab/blender_mcp/raw/branch/main/readme.md); [blender.org/lab/mcp-server](https://www.blender.org/lab/mcp-server/)
- Required Blender version: most sources say 5.1 or newer; one says 4.2+. Add-on version reported as v1.0.3 (2026-09-11) by one source, v1.0.0 zip linked by another. Unresolved. [S] — [mcp.directory guide](https://mcp.directory/blog/claude-blender-connector-guide); [StraySpark comparison](https://www.strayspark.studio/blog/official-blender-mcp-server-comparison-2026)
- Anthropic lists an official Blender connector (reported released 28 April 2026, built by Blender Lab); it requires the add-on. [S] — [claude.com/connectors/blender](https://claude.com/connectors/blender)
- First-hand observation from this research session (the developer's environment has the official server connected): exposed tools include `execute_blender_code`, `get_objects_summary`, `get_object_detail_summary`, blend-file summary tools, `get_screenshot_of_window_as_image` / `get_screenshot_of_area_as_image`, `render_viewport_to_path`, `render_thumbnail_to_path`, viewport/tab navigation helpers, and bundled-doc search (`search_api_docs`, `get_python_api_docs`, `search_manual_docs`). The server's own instructions say code execution "is a last resort", to prefer `bpy.ops` for standard actions, to set mode/active object/selection explicitly, to update the depsgraph before reading computed values, to use bmesh in Edit Mode, and to "Return structured data (dicts, lists) from executed code, not print output." [V — observed directly; no public URL] — [Blender Lab MCP readme](https://projects.blender.org/lab/blender_mcp/raw/branch/main/readme.md)
- **Community server `ahujasid/blender-mcp`** (now titled "MCP for Blender" to avoid confusion with the official one): MIT licence, ~34.5k GitHub stars. Nine tools: `execute_blender_code`, `look` (viewport/camera/multi-angle/animation-strip views, renders), `get_scene_info`, `generate_3d` (Tripo, Hunyuan3D, Hyper3D Rodin, Meshy), `generate_gaussian_world` (Blender 5.3+), `search_assets`/`import_asset` (Poly Haven CC0, Sketchfab, Poly Pizza — mixed licences, some CC-BY), plus status/telemetry tools. [V] — [github.com/ahujasid/blender-mcp](https://github.com/ahujasid/blender-mcp)
- Community server warnings: "ALWAYS save your work before using it"; the add-on socket has no authentication or encryption (keep on localhost); complex operations may need to be split into smaller steps; run only one MCP server instance at a time; includes telemetry that can be disabled (`disable_telemetry` tool). [V] — [github.com/ahujasid/blender-mcp](https://github.com/ahujasid/blender-mcp)
- **Mixamo**: Adobe's FAQ says the auto-rigger and animation library are for bipedal humanoids only; it needs distinguishable head, body, arm and leg areas, a neutral pose, and may fail "if the character proportions are too deformed" or with large extra appendages. [V via search quote] — [Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)
- Tripo claims (vendor blog) to rig non-humanoid/quadruped characters; Reallusion AccuRIG is described (vendor-written comparison) as a free standalone auto-rigger for humanoids. Unverified marketing claims. [S] — [Tripo blog](https://www.tripo3d.ai/blog/mixamo-alternative-that-can-rig-non-humanoid-or-quadruped)
- Cascadeur is a physics-assisted keyframe animation tool with auto-posing aimed at humanoid/creature rigs. [BK] — [cascadeur.com](https://cascadeur.com/)

### Inferences
- **What LLM + Blender MCP does well for this project:** deterministic, parameterised construction (boxes, bevels, cylinders, arrays of buttons), naming and parenting, materials with exact colours, creating the armature and vertex groups with weight 1.0, creating actions/slots and inserting keyframes from a pose table, setting interpolation, creating NLA tracks, running the glTF export with fixed settings, and rendering screenshots/thumbnails for a self-check loop. The whole character can and should be one re-runnable build script kept in the repo (regenerate rather than hand-edit).
- **What it does badly:** judging appeal. Timing, arcs, anticipation and overlap in animation are aesthetic; an LLM can produce a correct pose table ("arm raised 120 degrees at frame 6") but first drafts look stiff. Organic sculpting, good topology for deformation and nuanced weight painting are also poor — none of which this character needs.
- **Workflow tips.**
  - Save/commit the .blend before each AI session; work in small steps (one part, then screenshot, then next part).
  - Have the assistant inspect the scene first (objects summary) and use the bundled API docs search rather than guessing 5.x API — especially for the layered Action API, which older training data gets wrong.
  - Ask for a single idempotent `build_robot.py` (deletes and recreates its own collection) plus `build_actions.py` (pose table -> keyframes) plus `export.py`.
  - Describe poses as data: per-clip list of `(frame, bone, euler XYZ degrees)`; let the human nudge numbers after viewing a playblast/"animation strip" screenshot. Hand-tweak the 2-3 hero clips (idle, wave, talk) in the Dope Sheet — at 8-12 poses/s there are only a dozen poses per clip.
  - Use rotation mode XYZ Euler on bones in scripts for readability (the exporter converts to quaternions).
  - Validate each export by loading the .glb in a glTF viewer (e.g. gltf.report or the three.js editor) and checking clip names/durations.
- **AI 3D generators (Meshy, Tripo, Hunyuan3D, Rodin):** they output dense, triangulated, single-mesh models with baked textures. For a character that is literally a box with cylinders, the generated mesh would need retopology, separation into parts, re-colouring and a flat screen quad — slower than building primitives. Possible use: concept exploration / reference images only. Also note prompts like "BMO" would reproduce a copyrighted design; keep the design original.
- **Auto-rig/animation services:** Mixamo may or may not accept a box-with-stick-limbs (Adobe says very deformed proportions can fail), and its mocap library looks wrong on a stylised stop-motion robot and brings a 65-bone humanoid skeleton. AccuRIG and Cascadeur are similarly humanoid-production tools. With ~12 bones and ~10 short clips keyed on 3s, hand/AI-scripted keyframing is faster and more charming.
- **Licence note on existing models:** fan-made models of the well-known cartoon console character exist on Sketchfab and similar sites (and are reachable through the community MCP's Sketchfab integration). The character design is the IP owner's property regardless of the uploader's CC licence on the mesh; do not ship or derive from those. Poly Pizza/Sketchfab assets also carry per-model licences (CC-BY needs attribution). Build an original "boxy console robot".

### Gaps
- Could not open blender.org/lab/mcp-server (HTTP 403): current version number, exact minimum Blender version, licence and official security guidance are unconfirmed.
- No independent benchmark was found on AI-generator output quality for hard-surface low-poly characters, or on whether Meshy/Tripo auto-rig produces usable rigs for a box-bodied character; vendor claims only.
- AccuRIG and Cascadeur current versions/pricing/licence terms not checked this session.

---

## 4. Runtime: three.js (primary) and Godot 4 (alternative)

### Takeaway
three.js needs only `GLTFLoader` + one `AnimationMixer` + a ~100-line finite state machine; get the stop-motion look by advancing the mixer in quantised time steps. Godot 4 offers the same via glTF import + `AnimationTree` state machine with less code but a heavier runtime and harder transparent-overlay/HTML integration.

### Cited Findings
- Newest three.js release found: r186 (reported 8 September 2026); r185 (July 2026) had a breaking `updateWorldMatrix` change that broke some apps; r184 (March 2026) added `HTMLTexture` (depends on Chrome's HTML-in-Canvas API, not broadly available). `THREE.Timer` is recommended over `THREE.Clock` from r183. [S] — [CGWORLD r186 note](https://cgworld.jp/flashnews/01-202610-Threejs-r186.html); [three.js forum: r185 updateWorldMatrix](https://discourse.threejs.org/t/r185-updateworldmatrix-update-broke-apps/93444); [Cinevva r184 news](https://app.cinevva.com/news/2026-03-28-threejs-r184-htmltexture)
- `AnimationAction.crossFadeTo( fadeInAction, duration, warp )`: "Causes this action to fade out and the given action to fade in, within the passed time interval." `fadeIn(duration)` / `fadeOut(duration)` ramp weight 0<->1. [V] — [three.js docs, AnimationAction](https://threejs.org/docs/pages/AnimationAction.html)
- `setLoop( mode, repetitions )` with `LoopRepeat` (default), `LoopOnce`, `LoopPingPong`; `repetitions` default `Infinity`. `clampWhenFinished`: if true "the animation is automatically paused on its last frame"; if false the action is disabled when the last loop finishes; it "has no effect if the action is interrupted". `timeScale` scales time (0 pauses, negative plays backwards). `blendMode` is `NormalAnimationBlendMode` or `AdditiveAnimationBlendMode`. `reset()` restarts playback. [V] — [three.js docs, AnimationAction](https://threejs.org/docs/pages/AnimationAction.html)
- A forum thread reports `crossFadeTo` appearing not to work until the target action's weight/enabled state was set (the target must be `reset()`/enabled and `play()`ed). [S] — [three.js forum](https://discourse.threejs.org/t/animationaction-crossfadeto-not-working/63467)
- `AnimationMixer` dispatches `finished` (an action completed, e.g. a `LoopOnce` clip) and `loop` events; `mixer.update(deltaSeconds)` advances all actions; `mixer.setTime()` sets global time. [BK] — [three.js docs, AnimationMixer](https://threejs.org/docs/#api/en/animation/AnimationMixer)
- `GLTFLoader` returns `gltf.scene` and `gltf.animations` (array of `AnimationClip`, named after the glTF animations = Blender action names); supports `KHR_materials_unlit` (-> `MeshBasicMaterial`), `KHR_materials_emissive_strength`, Draco (via `DRACOLoader`), meshopt (via `MeshoptDecoder`), KTX2. glTF `STEP` samplers map to `InterpolateDiscrete`. [BK] — [three.js docs, GLTFLoader](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)
- Additive clips: `THREE.AnimationUtils.makeClipAdditive(clip, referenceFrame, referenceClip)` converts a clip to deltas for use with `AdditiveAnimationBlendMode`; official example `webgl_animation_skinning_additive_blending`. [BK] — [three.js example: additive blending](https://threejs.org/examples/#webgl_animation_skinning_additive_blending)
- XState is a JS/TS statechart library (v5, actor-based) usable for the state machine; has visual tooling. [BK] — [stately.ai/docs/xstate](https://stately.ai/docs/xstate)
- Godot: 4.6 released January 2026; 4.7 in beta in the results found; an unverified post says glTF/GLB animation handling improves in 4.7. [S] — [Godot 4.6 release page](https://godotengine.org/releases/4.6/); [Godot 4.7 beta 1](https://godotengine.org/article/dev-snapshot-godot-4-7-beta-1/)
- Godot `AnimationTree` with an `AnimationNodeStateMachine` root: control via the playback object (`anim_tree["parameters/playback"]`), `travel("state")` to path-find through transitions, `get_current_node()` to query. [S/V via search quote of official 4.4 docs] — [Godot docs: Using AnimationTree](https://docs.godotengine.org/en/4.4/tutorials/animation/animation_tree.html)
- Godot imports .glb/.gltf (and .blend directly by invoking Blender's exporter) into a scene with `Skeleton3D` + `AnimationPlayer`; loop mode can be set by naming suffix (`-loop`) or in the Advanced Import Settings; import can save animations to separate resources. [BK] — [Godot docs: Importing 3D scenes](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/index.html)

### Inferences
- **Minimal three.js setup.** Load once; build `actions = Object.fromEntries(gltf.animations.map(c => [c.name, mixer.clipAction(c)]))`. For loops: default `LoopRepeat`. For one-shots (wave, appear, sit_down): `setLoop(LoopOnce, 1); clampWhenFinished = true;` and listen to `mixer.addEventListener('finished', e => fsm.onClipDone(e.action.getClip().name))`.
- **Transition helper.** `next.reset().setEffectiveWeight(1).play(); current.crossFadeTo(next, 0.15, false);` Keep fades short (0.1-0.2 s) or zero: with a stepped look, a hard cut on a pose boundary reads as intentional stop-motion, and avoids the mushy half-blended poses that crossfades produce on stiff limbs.
- **Reduced update rate (stop-motion).** Accumulate real delta and only call `mixer.update(step)` when the accumulator exceeds `step = 1/10` s (try 8-12 fps), rendering only when something changed. Variant: keep rendering every frame (so face/blink/window drag stay smooth) but call `mixer.setTime(Math.floor(t * fps) / fps)`. Decoupling body animation rate (8-12 fps) from face rate (30-60 fps for lip-sync) is the important design choice: the mouth must stay responsive.
- **Render-on-demand** also serves the desktop-companion power budget: an always-on transparent window should not run a 60 fps WebGL loop when the character is idle; 10-15 fps idle, or pause entirely when hidden/occluded.
- **Additive animation** is optional for v1. Useful later for layering a "talk bob" or "breathing" on top of any base pose. For v1, do head-bob/breathing in code by nudging the `body` bone after `mixer.update()`.
- **Procedural overrides.** After `mixer.update()`, code may overwrite individual bone rotations (e.g. aim an arm at a target, section 8); bones not animated by the current clip keep code-set values.
- **State machine choice.** A plain FSM object (`{state, enter(), exit(), on(event)}` with a transition table, a one-shot queue and priorities) is sufficient for ~10 states. XState earns its keep if the logic grows (nested states such as "sitting" x "talking", delayed transitions like idle-timeout, visual debugging). Recommendation: plain FSM first, table-driven so it could be ported to XState.
- **Godot equivalent.** Import the same .glb; `AnimationPlayer` holds the clips; `AnimationTree` state machine with transitions set to "At End" for one-shots and "Immediate" + xfade time for loops; `travel()` from GDScript on assistant events. Stepped look: set the AnimationPlayer/AnimationTree callback to manual and call `advance()` at 8-12 fps, or set animation tracks to Nearest interpolation on import. Screen face: a `SubViewport` with 2D nodes (`AnimatedSprite2D`/`Polygon2D`) used as a `ViewportTexture` on the screen quad.
- **three.js vs Godot for this app.** three.js inside Electron/Tauri gives HTML/CSS speech bubbles, easy Web Audio lip-sync, and direct IPC with the assistant process; Godot gives a nicer animation editor and per-pixel transparent windows natively but makes HTML bubbles and JS-side TTS integration awkward. For a solo dev already in a web stack, three.js is the faster path.

### Gaps
- The AnimationMixer, GLTFLoader and additive-blending pages were not re-opened this session (rate limit); API facts are stable but should be checked against r186 docs. In particular confirm whether r185/r186 changed anything in the animation system (only the `updateWorldMatrix` break was found).
- Godot 4.6/4.7 release notes were not opened; no confirmed list of glTF-import or AnimationTree changes. Whether Godot 4.7 stable is out by November 2026 is unconfirmed.
- No measured data on idle CPU/GPU cost of a transparent always-on-top Electron/Tauri WebGL window.

---

## 5. State mapping: assistant events -> animations and expressions

### Takeaway
Map each assistant event to a (body clip, face expression, optional bubble) triple, separate looping "states" from one-shot "gestures", and resolve conflicts with three rules: priority, minimum hold time / finish-on-pose-boundary, and a one-slot queue.

### Cited Findings
- (Design proposal; no external source defines this mapping. The runtime mechanisms it relies on — `LoopOnce`, `clampWhenFinished`, the mixer `finished` event, crossfades — are documented in section 4.) — [three.js docs, AnimationAction](https://threejs.org/docs/pages/AnimationAction.html)

### Inferences

**Proposed mapping table**

| Assistant state / event | Body animation | Face expression | Type | Notes / transition |
|---|---|---|---|---|
| Session start | `appear` (pop-in, code tween or clip) -> `wave` -> `idle` | happy, mouth smile | one-shot chain | Wave must finish (uninterruptible, ~1.2 s) unless error/session end |
| Idle (waiting for user) | `idle` loop (breathing bob, occasional foot tap variant) | neutral; random blink every 2-6 s; occasional glance | loop | Default fallback state |
| User prompt submitted | small `nod`/perk-up one-shot (or reuse first poses of `think`) | attentive: eyes wide, look toward chat window | one-shot -> thinking | Can be skipped if thinking starts within ~300 ms |
| Thinking | `think` loop (hands on hips / hand to chin, slow sway) | eyes look up-left, small flat mouth; optional "..." dots on screen | loop | Enter after min 0.3 s debounce to avoid flicker on fast replies |
| Tool use (generic: file, terminal) | `work` loop (typing/tinkering gesture; v1 can reuse `think` with different face) | focused: narrowed eyes, tongue-out or gear icon on screen | loop | Show tool name in small bubble/badge |
| Browser tool use | `walk` to the screen edge nearest the browser window, then `point`/`look_down` loop at the window | curious eyes looking toward target | walk (code-driven movement) -> loop | Walk is interruptible at pose boundaries; if tool ends before arrival, stop and return to previous state |
| Waiting for permission | `ask` loop: arm raised / small wave to get attention, slight bounce every few seconds | question face: raised brow shape, "?" glyph, mouth small "o" | loop, high priority | Persistent bubble with the request; must not be overridden by idle timeout; attention bounce repeats with increasing interval |
| Reply ready / speaking | `talk` loop (small explaining hand gestures) | mouth driven by lip-sync; eyes on user; blink continues | loop | Mouth returns to neutral on audio end; if no TTS, animate mouth from text-streaming cadence |
| Task finished successfully | `happy` one-shot (arm raised, hop) -> `idle` | big smile, closed-arc happy eyes | one-shot | Only for notable completions, to avoid fatigue |
| Idle for a long time (e.g. > 2-5 min) | `sit_down` one-shot -> `sit_idle` loop (legs dangling on window/taskbar edge); later `sleep` variant | relaxed half-closed eyes; after longer, sleeping (closed eyes, "z") | chain | Any event -> `stand_up` (or reversed `sit_down`) -> target state; allow skipping stand-up for high-priority events with a quick cut |
| Error | `error` one-shot (flinch/head shake; v1: reuse `think` start + shake in code) -> `idle` | X eyes or worried eyes, wavy mouth; brief screen flicker/glitch | one-shot, high priority | Interrupts everything except session end |
| Session end | `wave` -> `disappear` | happy -> eyes closed -> screen off | one-shot chain, top priority | Interrupts any state; if app is closing, shorten to disappear only |

**Interruption rules**

1. **Priority order** (high -> low): session end > error > waiting for permission > speaking > tool use / browser > thinking > happy/greet gestures > long-idle sit > idle. A new event replaces the current state only if its priority is >= the current one, or the current state is a loop that has met its minimum hold.
2. **One-shots are atomic by default.** `wave`, `happy`, `sit_down`, `stand_up`, `appear` play to the end (they are 0.8-1.5 s). The incoming state is stored in a one-slot "pending" queue (latest wins) and entered on the mixer `finished` event. Exceptions: session end and error cut in immediately.
3. **Minimum hold for loops**: 0.4-0.6 s before a loop can be replaced, to prevent twitching when events arrive in bursts (prompt -> think -> tool -> think -> tool).
4. **Debounce noisy events**: collapse rapid tool-use start/stop pairs; stay in `work` until no tool has run for ~0.5 s.
5. **Cut on pose boundaries**: with stepped animation, switch clips on the next animation tick (1/10 s), not mid-tick; use 0-0.15 s crossfade.
6. **Locomotion is a wrapper, not a state**: "go to X then do Y" = `walk` loop while the root is tweened, then enter Y. Finish-wave-before-walking falls out of rule 2. If the target moves or the reason disappears, abort the walk at the next tick.
7. **Face layer is independent**: expression changes apply immediately even while the body finishes a one-shot (e.g. face turns worried at once on error while the wave is cut). Blink and lip-sync run on their own timers on top of the current expression.
8. **Posture sub-state**: track `standing | sitting`. States reachable from sitting without standing up (talk, think) can have sitting variants later; v1 always stands up first.

### Gaps
- No user research or published guidance was found on companion-character behaviour mapping; the table is a design proposal to be tuned by feel.
- Exact event names depend on the host integration (e.g. Claude Code hooks such as session start, prompt submit, pre/post tool use, notification/permission, stop, session end) — covered by other researchers; mapping keys should be aligned with whatever events are actually available.

---

## 6. Screen face: swappable expressions, blink, gaze, crispness

### Takeaway
Draw the face at runtime onto a small 2D canvas used as a `CanvasTexture` on the screen quad (or as its emissive map), with eyes and mouth as parametric vector shapes; redraw only when something changes. This gives unlimited expressions, free blinking/gaze, and crisp output at 150-300 px without authoring a sprite sheet.

### Cited Findings
- three.js `CanvasTexture` wraps an HTML canvas as a texture; set `needsUpdate = true` after redrawing. Texture filtering is controlled by `magFilter`/`minFilter` (`NearestFilter`, `LinearFilter`, mipmap variants), `anisotropy`, and `colorSpace` should be `SRGBColorSpace` for colour textures. [BK] — [three.js docs, CanvasTexture](https://threejs.org/docs/#api/en/textures/CanvasTexture)
- UV-offset sprite sheets: `texture.offset` / `texture.repeat` select a cell of an atlas; `KHR_texture_transform` (supported by the Blender exporter) can encode the same in glTF. [V for exporter extension support; BK for three.js API] — [Blender 5.1 manual, glTF 2.0](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html); [three.js docs, Texture](https://threejs.org/docs/#api/en/textures/Texture)
- three.js r184 added `HTMLTexture` (live HTML element as texture) but it relies on Chrome's HTML-in-Canvas API and "isn't broadly available yet" — not a dependable base, though Electron (Chromium) may expose it behind a flag. [S] — [Cinevva r184 news](https://app.cinevva.com/news/2026-03-28-threejs-r184-htmltexture)
- Blender 5.3 glTF added KTX2 (`KHR_texture_basisu`) export — irrelevant for a runtime-drawn face, potentially useful for atlas textures. [V] — [Blender 5.3 release notes, Pipeline/IO](https://developer.blender.org/docs/release_notes/5.3/pipeline_io/)

### Inferences
- **Option comparison.**

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| CanvasTexture, 2D canvas drawing (arcs/lines/ellipses) | Any expression by parameters; smooth blink/gaze tweening; trivial lip-sync (set mouth openness); resolution chosen at runtime; no art assets | Must write ~150 lines of drawing code; texture re-upload on change (tiny at 256x192) | **Recommended** |
| Sprite sheet / atlas + UV offset | Hand-drawn charm; cheap; works identically in Godot | Combinatorial explosion (eyes x mouths x gaze); fixed resolution; every tweak = redraw art | Good if a pixel-art face is the desired style |
| Separate eye and mouth quads (each its own small atlas) | Avoids combinatorial explosion; eyes can physically move for gaze | More nodes/materials; z-fighting care | Solid alternative, pairs with atlas art |
| SVG -> canvas (draw SVG paths via `Path2D`, or rasterise an inline SVG) | Design in a vector tool; resolution independent | Rasterising SVG images each frame is slower/asynchronous; `Path2D` from path strings is fine | Use `Path2D` for special glyphs (heart, "?", X-eyes) inside the canvas approach |
| Fragment shader (SDF eyes/mouth) | Perfectly crisp at any size; no texture upload | More effort; harder to iterate; overkill | Later optimisation only |
| DOM/CSS overlay face positioned over the screen | Easiest to author | Does not follow 3D rotation/perspective, occlusion by arms impossible | Avoid |

- **Parametric face model.** State = `{eyeShape: open|closed|happyArc|wide|narrow|x|sleepy, eyeOpen: 0..1, gaze: {x:-1..1, y:-1..1}, browTilt, mouthShape: smile|flat|o|frown|wavy|open, mouthOpen: 0..1, glyph: none|?|!|...|zzz|heart, bgColor}`. An "expression" is a named preset of these values; switching tweens between presets over 80-150 ms (or snaps, matching the stop-motion feel).
- **Blink.** Timer with random interval 2-6 s; blink = eyeOpen 1 -> 0 -> 1 over ~120-150 ms (3-4 face frames); occasional double blink. Suppress during closed-eye expressions.
- **Gaze.** Offset eye positions (dot eyes) by `gaze * maxOffset` (roughly 5-8 % of screen width). Drive from: mouse position, active window rectangle centre, or the speech bubble. Combine with a small `body` bone turn for larger angles. Add small random saccades every few seconds in idle.
- **Crispness at 150-300 px tall.** The screen occupies perhaps 60-110 px on the user's display. Guidelines: (a) render the WebGL canvas at `devicePixelRatio` (cap 2); (b) face canvas ~256x192 (2-3x the on-screen pixel size) with `generateMipmaps` on and `LinearMipmapLinearFilter`, or exactly matched size with `LinearFilter`; (c) line widths >= 6-8 % of face height so strokes stay >= 2 physical pixels; (d) high contrast (dark features on light screen or vice versa), no thin outlines; (e) keep the character facing mostly front (limit body yaw to ~20-25 degrees) so the screen is not foreshortened into mush; (f) enable MSAA (`antialias: true`) for the mesh silhouette; (g) for a deliberate pixel-art face use a tiny canvas (e.g. 64x48) with `NearestFilter` and integer-ish scaling instead.
- **Material hookup.** Find the screen mesh by name after load and replace its material with `MeshBasicMaterial({ map: faceTexture })` (unlit, so the face is never darkened by lighting), or keep a lit material and set `emissiveMap = faceTexture`, `emissive = white`. Set `faceTexture.colorSpace = SRGBColorSpace` and `flipY` appropriately for glTF UVs (glTF textures use `flipY = false`).
- **Redraw policy.** Redraw only when face state changes (blink frames, gaze change, mouth shape change); during speech that is at most 20-30 redraws/s of a 256x192 canvas — negligible.

### Gaps
- No benchmark source for CanvasTexture upload cost at these sizes (believed negligible; unmeasured).
- `HTMLTexture` availability in Electron/Tauri webviews as of November 2026 is unconfirmed; Tauri uses the OS webview (WebView2/WKWebView/WebKitGTK), so Chrome-only features cannot be assumed there.

---

## 7. Lip-sync for a simple 2D mouth

### Takeaway
For a cartoon line-mouth, amplitude-based lip-sync (Web Audio `AnalyserNode` RMS -> 3-4 mouth openness levels, updated ~10-15 times/s with smoothing) is good enough and works with any audio source; add viseme timing only if the TTS already provides it for free (Kokoro via HeadTTS, Azure viseme events). Rhubarb is offline/batch and fits pre-rendered clips, not live speech.

### Cited Findings
- **Rhubarb Lip Sync** mouth shapes: A "Closed mouth for the 'P', 'B', and 'M' sounds"; B slightly open with clenched teeth (most consonants, "EE"); C open mouth ("EH", "AE", in-between to D); D wide open ("AA"); E slightly rounded ("AO", "ER"); F puckered lips ("UW", "OW", "W"); extended optional shapes G (upper teeth on lower lip, "F"/"V"), H (tongue raised, long "L"), X (idle/rest). Six basic shapes A-F plus optional G, H, X; `--extendedShapes` defaults to `GHX`, pass `""` for the basic six. [V] — [Rhubarb Lip Sync README](https://github.com/DanielSWolf/rhubarb-lip-sync)
- Rhubarb recognisers: PocketSphinx (default, English only, better) and Phonetic (language-independent, less precise). Output formats TSV, XML, JSON (timestamped mouth cues). `--dialogFile` with the spoken text improves reliability ("It is always a good idea to specify the dialog text"). Windows/macOS/Linux command-line tool. [V] — [Rhubarb Lip Sync README](https://github.com/DanielSWolf/rhubarb-lip-sync)
- Rhubarb licence: MIT according to wrapper packages and search summaries; the README links LICENSE.md (bundles third-party components such as PocketSphinx with their own permissive licences — check the file). [S] — [Rhubarb Lip Sync repo](https://github.com/DanielSWolf/rhubarb-lip-sync); [rhubarb-lip-sync-wasm README](https://unpkg.com/rhubarb-lip-sync-wasm@0.1.8/README.md)
- A WASM port exists on npm (`rhubarb-lip-sync-wasm`, v0.1.8 seen), enabling in-app processing without a native binary; maturity unverified. [S] — [rhubarb-lip-sync-wasm README](https://unpkg.com/rhubarb-lip-sync-wasm@0.1.8/README.md)
- **wawa-lipsync**: MIT-licensed TypeScript library for real-time lip-sync using the Web Audio API `AnalyserNode`. API: `new Lipsync()`, `connectAudio(audioElement)` (element must already have a `src`), call `processAudio()` at the desired interval (e.g. each animation frame), read the `viseme` property. Includes a three.js/React Three Fiber demo. Very early version numbers (0.0.1-0.0.2 seen). [V] — [wawa-lipsync README v0.0.2](https://cdn.jsdelivr.net/npm/wawa-lipsync@0.0.2/README.md)
- **HeadAudio** (met4citizen/kyr0 fork seen): browser audio worklet for real-time viseme detection from audio using MFCC features — an alternative to wawa-lipsync. [S] — [github.com/kyr0/HeadAudio](https://github.com/kyr0/HeadAudio)
- **TalkingHead** (met4citizen): three.js talking-avatar class; accepts external TTS that outputs viseme IDs/blend-shape data (e.g. Azure Speech SDK); `speakAudio` accepts audio plus optional viseme/time/duration arrays, added "to support external TTS services such as ElevenLabs and Azure". Aimed at full 3D humanoid heads (Oculus visemes/ARKit blendshapes), so it is a reference for timing logic rather than a drop-in for a 2D mouth. [S] — [TalkingHead README v1.7.0](https://unpkg.com/@met4citizen/talkinghead@1.7.0/README.md)
- **HeadTTS**: free, MIT-licensed TTS built on a timestamped Kokoro ONNX model; outputs phoneme-level timestamps and Oculus visemes; runs in-browser (WebGPU/WASM) or as a local Node.js WebSocket/REST server (CPU); states it does not use eSpeak or other GPL modules. [S] — [HeadTTS README v0.2.0](https://unpkg.com/@met4citizen/headtts@0.2.0/README.md)
- **Azure Speech** emits viseme events with audio offsets; 22 viseme IDs (0-21). [S for the ID count via a third-party guide; BK for the event API] — [Microsoft Learn: Get facial position with viseme](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-speech-synthesis-viseme)
- **ElevenLabs** returns character-level alignment timestamps from `/v1/text-to-speech/{voice_id}/with-timestamps` (and in WebSocket streaming); characters must be mapped to approximate mouth shapes with a lookup — not true visemes. [S] — [ElevenLabs API reference: TTS with timestamps](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps)
- **Piper** phonemises via espeak-ng (GPL-3 component in classic Piper) and can output phoneme IDs; per-phoneme timing/alignments are not part of standard output in the versions known to the researcher. [BK — verify] — [Piper repo](https://github.com/rhasspy/piper)
- Web Audio `AnalyserNode.getFloatTimeDomainData()` / `getByteFrequencyData()` provide real-time waveform/spectrum for RMS or band-energy computation. [BK] — [MDN: AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode)
- Live2D's official web tutorial uses plain volume (RMS of WAV samples) as its basic lip-sync method — evidence that amplitude-only is an accepted baseline for stylised 2D characters. [S] — [Live2D Cubism docs: lip-sync based on volume](https://docs.live2d.com/en/cubism-sdk-tutorials/native-lipsync-from-wav-web)
- Classic 2D mouth-chart conventions: the Preston Blair set (~10 shapes: A/I, E, O, U, C/D/G/K/N/R/S/Th/Y/Z, F/V, L, M/B/P, W/Q, rest) and the reduced Hanna-Barbera-style set of ~6 that Rhubarb's A-F are modelled on; Toon Boom's auto lip-sync uses 8 shapes A-G + X. [BK; Toon Boom page surfaced in search] — [Toon Boom Harmony docs: Lip-sync](https://docs.toonboom.com/help/harmony-12-2/advanced/sound/lip-sync.html); [Rhubarb Lip Sync README](https://github.com/DanielSWolf/rhubarb-lip-sync)

### Inferences
- **Recommended v1 (amplitude):** route TTS audio through `AudioContext` -> `AnalyserNode` (fftSize 1024-2048); each tick compute RMS, apply a noise gate and attack/release smoothing (fast open ~30 ms, slower close ~80-120 ms), normalise against a running peak, quantise to 4 levels: closed / slightly open / open / wide. Update the mouth at 10-15 Hz (holding each shape >= 60-80 ms avoids flutter and matches the stop-motion style). A line-mouth that becomes an ellipse of varying height reads convincingly; audiences are forgiving for abstract mouths.
- **Cheap upgrade (amplitude + 2 bands):** use spectral balance to choose shape as well as openness: strong low/mid energy -> round "O"; strong high-frequency energy (sibilants) -> wide/flat "E/S"; silence -> closed/smile. This yields ~5 shapes (closed, small, open, wide "ee", round "oo") without any phoneme data — essentially what wawa-lipsync automates.
- **Viseme route when timings are free:** if using Kokoro (HeadTTS) or Azure, schedule mouth shapes from timestamps using `audioContext.currentTime`, reducing Oculus-15/Azure-22 visemes to the 6 Rhubarb-style shapes: {sil -> X/A, PP(p,b,m) -> A, FF(f,v) -> G or B, TH/DD/kk/CH/SS/nn/RR -> B, aa -> D, E/I -> C or B, O -> E, U -> F}. ElevenLabs character timings can be mapped per letter (vowels -> open shapes, m/b/p -> closed) as a rough approximation.
- **Rhubarb's place:** batch tool taking a finished audio file; processing latency makes it unsuitable for streaming replies, but fine for pre-recorded canned lines (greeting, error quips) or if replies are fully synthesised before playback and a short delay is acceptable. Its English-only high-quality recogniser is a limitation for multilingual users.
- **No-audio fallback:** if replies are text only, drive the mouth from streaming-text cadence (open on each word/syllable chunk, close on punctuation) — reads as "talking" for a cartoon character.
- **Shape set to draw for v1:** 4 shapes (closed-smile, small open, open, wide) + optional round "O". Expand to Rhubarb's A-F only if viseme timing is adopted.

### Gaps
- wawa-lipsync's actual viseme list and classification method were not shown in the README excerpt; package maturity (0.0.x) and maintenance status in late 2026 unverified.
- Could not verify current Piper (and its successors/forks) phoneme-timing output or licence situation in 2026; flagged as background knowledge.
- Azure, ElevenLabs and MDN pages were not opened this session; endpoint names and ID counts come from secondary summaries plus background knowledge.
- No objective study found comparing amplitude vs viseme lip-sync quality for abstract 2D mouths; recommendation rests on common practice (e.g. Live2D volume method).

---

## 8. Speech bubbles and pointing

### Takeaway
Render speech bubbles as HTML/CSS elements positioned over the WebGL canvas (crisp text, wrapping, selection, links, accessibility) by projecting a 3D anchor above the character to screen coordinates; do pointing/looking by converting the target screen rectangle into a direction for gaze offset, body yaw and a procedural arm aim.

### Cited Findings
- `Vector3.project(camera)` converts a world position to normalised device coordinates (-1..1); screen px = `((x+1)/2*width, (1-y)/2*height)`. `Object3D.getWorldPosition(v)` gives a bone's/node's world position. three.js also ships `CSS2DRenderer` (addon) which positions DOM elements at 3D object locations automatically. [BK] — [three.js docs, Vector3.project](https://threejs.org/docs/#api/en/math/Vector3.project); [three.js docs, CSS2DRenderer](https://threejs.org/docs/#examples/en/renderers/CSS2DRenderer)
- `Vector3.unproject(camera)` does the inverse (screen -> world ray), and `Object3D.lookAt()` / `Quaternion.setFromUnitVectors()` orient an object/bone toward a direction. [BK] — [three.js docs, Object3D](https://threejs.org/docs/#api/en/core/Object3D)
- three.js r184 `HTMLTexture` (HTML as a texture inside the 3D scene) is not broadly available. [S] — [Cinevva r184 news](https://app.cinevva.com/news/2026-03-28-threejs-r184-htmltexture)
- Godot: `Camera3D.unproject_position(world_pos)` returns the 2D viewport position for a 3D point, used to place `Control` nodes (bubbles) over 3D objects; `Label3D`/`Sprite3D` exist for in-world text. [BK] — [Godot docs: Camera3D](https://docs.godotengine.org/en/stable/classes/class_camera3d.html)

### Inferences
- **HTML/CSS bubbles win** for a desktop companion: system font rendering stays sharp at any DPI; markdown, code snippets, buttons (Allow / Deny for permission prompts) and scrolling come free; CSS handles the tail, max-width and animations. In-3D text (SDF text such as troika-three-text, or canvas-textured planes) is only justified if bubbles must be occluded by or rotate with the character.
- **Placement.** Add an empty `bubble_anchor` node above the head in Blender (exports as a glTF node), project it each frame (or only when the character moves) and set `transform: translate(x, y)` on the bubble div. Flip the bubble side/tail when near screen edges. With an orthographic camera the mapping is a constant scale + offset, which simplifies everything; an orthographic (or very long-lens) camera also suits the flat, toy-like look and keeps the screen face undistorted.
- **Window-size constraint.** In Electron/Tauri the transparent window must be large enough to contain both the character and the bubble, or the bubble should be a second borderless always-on-top window positioned next to the character window. Click-through handling for transparent regions (e.g. Electron `setIgnoreMouseEvents(true, { forward: true })`, toggled when the cursor is over the character or bubble) is a platform detail to verify with the app-shell research.
- **Looking at a screen rectangle.** Get the target rect (from the OS/app shell) in screen px; compute `d = normalize(targetCentre - characterScreenPos)`. Apply in three layers: (1) eyes: `gaze = clamp(d * k)`; (2) body: yaw the `body` bone toward the target by up to ~20-25 degrees and tilt down/up slightly; (3) arm: play the `point` clip whose arm pose points roughly sideways, then after `mixer.update()` rotate the upper-arm bone so the arm vector matches the 2D direction `d` (the character lives in a screen-parallel plane, so one angle `atan2(d.y, d.x)` is enough). Choose left/right arm by the sign of `d.x`.
- **"Look down at a window" from a sitting pose**: `sit_idle` + gaze down + body pitch forward ~15 degrees; no arm aim needed.
- **Walking to a rectangle**: move the character window (or the root within a full-screen transparent window) along the top edge of the target window or the taskbar at stride-matched speed; flip facing by mirroring the root's X scale or rotating yaw 180 degrees (mind that mirroring flips left/right arms).

### Gaps
- Docs pages for `Vector3.project`, `CSS2DRenderer` and Godot `Camera3D` were not opened this session (stable APIs, background knowledge).
- Multi-monitor/DPI coordinate conversion and click-through behaviour in Electron vs Tauri are outside this researcher's scope and unverified here.

---

## 9. Performance and file-size targets

### Takeaway
This asset is tiny by any standard: aim for a .glb of roughly 50-300 KB (geometry + ~10 short clips, no or tiny textures), one skinned mesh or a handful of nodes, under ~10 draw calls, and spend the performance budget on the app shell (idle frame rate, transparent window), not on the model.

### Cited Findings
- The exporter can reduce animation size: "Optimize Animation Size: Reduce exported file size by removing duplicate keyframes when all identical", and Sampling Rate controls how many samples are written. [V] — [Blender 5.1 manual, glTF 2.0](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html)
- Draco mesh compression is built into the exporter ("Higher compression results in slower encoding and decoding"); KTX2 texture export arrived in 5.3. [V] — [Blender 5.1 manual, glTF 2.0](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html); [Blender 5.3 release notes](https://developer.blender.org/docs/release_notes/5.3/pipeline_io/)
- The exporter can pass a "keep named node" flag for gltfpack (4.4), relevant if post-optimising: node names used by code (screen quad, anchors, bones) must be preserved. [V] — [Blender 4.4 release notes, Pipeline/IO](https://developer.blender.org/docs/release_notes/4.4/pipeline_assets_io/)

### Inferences
- **Size estimate.** ~1,500 triangles with positions/normals/joints/weights is on the order of 50-100 KB uncompressed. Animation: 12 bones x (rotation, plus a few translation/scale channels) x 24 samples/s x ~20 s total across clips is on the order of 100-200 KB at full sampling; sampling every 2-3 frames or stepped keys cuts it to a third. No textures are needed if colours are per-material and the face is runtime-drawn. Expect 100-300 KB total without compression; that loads instantly from local disk, so compression is unnecessary.
- **Targets to write into the spec:** <= 2,000 triangles; <= 16 bones; <= 8 materials (or 1 with a 64x64 palette texture); 0-1 textures <= 256 px; <= 12 clips, each <= 4 s; .glb <= 300 KB (hard ceiling 1 MB); face canvas 256x192; WebGL canvas sized to the character (e.g. 300x400 CSS px at DPR <= 2).
- **Runtime budget:** body animation at 8-12 fps, render-on-demand; face redraw only on change; pause rendering when the window is hidden. GPU memory is dominated by the framebuffer of the transparent window, not the model — keep the window/canvas small rather than full-screen where possible.
- **Avoid:** Draco (adds a WASM decoder > the model's own size), shadows (use a simple blob/ellipse shadow sprite if grounded), post-processing passes, and environment maps (use unlit or one directional + hemisphere light).
- **Godot footprint note:** a Godot export template is tens of MB versus a few hundred KB for three.js inside an already-present webview (Tauri) — relevant if distribution size matters.

### Gaps
- Size numbers are estimates, not measurements; confirm by exporting a first build. No published benchmarks for comparable desktop-pet assets were found.
- Idle power/CPU impact of transparent always-on-top windows on Windows 11 was not researched here.

---

## 10. Recommended step-by-step pipeline and minimal v1 animation/expression list

### Takeaway
Script the whole asset in Blender through the MCP server (primitives -> 12-bone rigid rig -> pose-table actions -> fixed-setting glTF export), draw the face and mouth at runtime on a canvas, and ship v1 with five clips and six expressions; add walking, sitting and pointing in v2.

### Cited Findings
- Export mechanics relied on below (Actions mode, actions must be active or on NLA tracks, sampling, reset pose bones, optimise size, slotted actions since 4.4) — [Blender 5.1 manual, glTF 2.0](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html); [Blender 4.4 release notes](https://developer.blender.org/docs/release_notes/4.4/pipeline_assets_io/)
- Runtime mechanics relied on below (`crossFadeTo`, `LoopOnce`, `clampWhenFinished`) — [three.js docs, AnimationAction](https://threejs.org/docs/pages/AnimationAction.html)
- MCP working practices (small steps, save first, inspect scene, return structured data) — [github.com/ahujasid/blender-mcp](https://github.com/ahujasid/blender-mcp); [Blender Lab MCP readme](https://projects.blender.org/lab/blender_mcp/raw/branch/main/readme.md)

### Inferences

**Step-by-step pipeline (fastest path to a charming result)**

1. **Design on paper first (30 min).** Front and side sketch of an original boxy console robot: body proportions (~3:4 box), screen area, button layout, limb thickness, 5-6 flat colours. Decide face style: vector line-face (recommended) or pixel face.
2. **Set up Blender** (use the newest stable 5.x the official MCP add-on supports; 5.1+ is the commonly reported minimum). Scene: metres, 24 fps, character ~1 unit tall, feet at origin, facing -Y (Blender front), Y-up conversion left to the exporter (+Y Up on).
3. **Model via MCP as a re-runnable script** `build_robot.py`: body box with small bevel; inset screen recess + separate `Screen` quad with 0-1 UVs; buttons (cylinders/boxes) joined into the body; arms and legs as 6-8-sided tubes (2 segments each) with simple mitten hands and block feet. One mesh object per rigid part or a single joined mesh with vertex groups. Apply scale. Target <= 2,000 triangles. Screenshot and iterate.
4. **Materials:** one Principled BSDF per colour (roughness 1, metallic 0), or unlit materials if a fully flat look is wanted; `Screen` material = plain emissive placeholder named `ScreenMat`.
5. **Rig via script:** armature `Rig` with `root`, `body`, `arm_upper.L/R`, `arm_lower.L/R`, `leg_upper.L/R`, `leg_lower.L/R` (+ optional `hand`, `foot`). Bind: rigid parts with weight 1.0 to one bone each (tubes: automatic weights across their 2 bones). Add empties parented to `body`: `bubble_anchor` (above head), optionally `screen_center`. Bone rotation mode XYZ Euler.
6. **Animate from pose tables** (`build_actions.py`), using the 5.x slotted-action API (verify calls against the bundled API docs, not from memory). Key all bones on the first frame of every action. Key poses on 3s (every 3rd frame at 24 fps = 8 poses/s); interpolation Constant if baking the stepped look, otherwise Bezier/Linear with runtime quantisation. Hand-tune the hero clips in the Dope Sheet for timing and overlap; add squash/stretch on `body` scale for life.
7. **Prepare for export:** every action has a Fake User and is pushed to its own NLA track (or stashed); names match runtime keys; pose reset to rest.
8. **Export** (`export.py`, format glTF Binary .glb): include selected objects only (rig + meshes + empties); +Y Up; Apply Modifiers on; Materials: Export; Images: none/automatic; Animation on; Animation mode **Actions**; Merge by Action (slots); Sampling on, Sampling Rate 1 (or 3 if relying on runtime stepping and wanting a smaller file); Optimize Animation Size on; **Force keeping channels for bones on**; **Reset pose bones between actions on**; Skinning on; export deform bones only if any control bones exist; no Draco. Keep these settings as an operator preset or in the script.
9. **Validate** the .glb in a neutral viewer (three.js editor / gltf.report): clip list, durations, node names (`Screen`, `bubble_anchor`), unlit/emissive flags, file size (< 300 KB).
10. **Runtime (three.js, current r18x):** orthographic camera; `GLTFLoader`; one `AnimationMixer`; actions map by clip name; table-driven FSM with priorities, one-slot queue and `finished` handling; mixer advanced at 8-12 fps; render on demand.
11. **Face:** 256x192 canvas -> `CanvasTexture` -> `MeshBasicMaterial` on `Screen`; parametric eyes/mouth with expression presets, blink timer, gaze offset.
12. **Lip-sync:** TTS audio -> `AnalyserNode` -> smoothed RMS -> 4 mouth levels at ~12 Hz; text-cadence fallback when silent.
13. **Bubbles and pointing:** HTML/CSS bubble positioned from the projected `bubble_anchor`; gaze + body yaw + procedural arm aim toward target rectangles.
14. **Wire events** from the assistant host to FSM events using the mapping in section 5; tune hold times and priorities by feel.
15. **Iterate on charm, not fidelity:** adjust timing, add one idle variant, add blink/gaze randomness. Only then consider v2 clips.

**Minimal animation list for v1 (5 clips + 2 code-driven)**

| Clip | Type | Length | Purpose |
|---|---|---|---|
| `idle` | loop | 2-3 s | Default; gentle bob, slight arm sway |
| `wave` | one-shot | ~1.2 s | Greeting / goodbye / attention for permission prompts |
| `think` | loop | 2-3 s | Thinking and (with a different face) generic tool use |
| `talk` | loop | 2-3 s | Small explaining gestures while speaking |
| `happy` | one-shot | ~1 s | Arm up + hop on success |
| appear / disappear | code | 0.3-0.5 s | Scale/opacity pop with squash on `body` |
| error shake | code | 0.4 s | Quick body shake + face change |

v2 additions: `walk` (in-place, 8-pose cycle), `sit_down` + `sit_idle` (legs dangling), `point` (with procedural aim), `work` (typing), `sleep`.

**Minimal expression list for v1 (6 presets + mouth levels)**

| Expression | Eyes | Mouth | Used for |
|---|---|---|---|
| neutral | round dots | small smile | idle |
| happy | upward arcs (closed-smile eyes) | wide smile | greeting, success |
| thinking | dots looking up-left, one slightly narrowed | short flat line; optional "..." | thinking, tool use |
| attentive / question | wide dots, optional "?" glyph | small "o" | prompt received, permission request |
| worried / error | X eyes or slanted worried eyes | wavy or frown | error |
| sleepy | half-closed lines | flat | long idle |
| + blink overlay | eyes closed line for ~130 ms | — | all states |
| + talk mouth levels | — | closed, small, open, wide (optional round "O") | speaking |

### Gaps
- The pipeline has not been executed end-to-end in this research; steps 6-8 depend on 5.x API/exporter details flagged as unconfirmed in sections 2 and 3 (layered Action API names, exact exporter option identifiers in `bpy.ops.export_scene.gltf`, STEP vs LINEAR output). Verify with one tiny test export (a cube with two actions) before building the full character.
- Final choice of three.js vs Godot, and of TTS engine (which determines whether viseme timings are available), is left to the wider report.
