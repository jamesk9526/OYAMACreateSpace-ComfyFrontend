# CreateSpace expansion tasks

See `plan.md` for pinned source evidence, exact workflow semantics and the full backlog. Checked items are implemented. Common verification: `pnpm typecheck`, affected `pnpm test`, `pnpm build`; UI/IPC slices also require `pnpm test:e2e` and both reference viewport screenshots. Provider gates additionally require MCP validation and an app-driven live render with restart playback.

| ID | Task / acceptance | Depends on | Likely files / scope | Specific verification |
| --- | --- | --- | --- | --- |
| ✅ 01 | Shared upload/output types; bridge imports no H3 implementation types | Baseline | shared/modules.ts, main/modules.ts, main/comfy.ts, h3/workflow.ts (M) | Existing H3 tests and packaged playback remain valid |
| ✅ 02 | Registry-owned default/schema/readiness lookup; unknown module does not receive H3 settings | 01 | registry, stores, main modules, module tests (M) | Two mock module drafts survive switching/restart independently |
| ✅ 03 | Output-kind and save-node contracts collect image/audio/video without collecting previews/inputs | 01 | shared contracts, bridge, output tests (M) | Mixed history fixture resolves only declared nodes |
| ✅ 04 | ZImage Turbo compiler/model requirements and mock image output | 02,03 | zimage definition/workflow/main adapter/tests (M) | Missing-model/negative/seed/output mapping assertions |
| ✅ 05 | ZImage workspace + registration; persisted controls and managed image preview | 04 | zimage ui, registries, interaction tests (M) | Live Turbo image and restart preview |
| ✅ 06 | Asset-ID handoff command supports first frame and global record promotion | 05 | shared handoffs, main handler, preload, handoff tests (M) | Project access enforced; unrelated target fields retained |
| ✅ 07 | Add verified ZImage Base profile and variant-aware negative/CFG controls | 05 | zimage schema/compiler/ui/tests (M) | Base missing-model state and live render if installed |
| ✅ 08 | LTX Turbo graph/model contract, frame and dimension validation | 02,03 | ltx definition/workflow/adapter/tests (M) | T2V/I2V fixtures + MCP validation |
| ✅ 09 | LTX workspace, audio playback and ZImage handoff | 06,08 | ltx ui, registries, handoffs, e2e (M) | Live T2V/I2V with persisted independent drafts |
| ✅ 10 | LTX Quality graph and stage-aware progress | 09 | ltx workflow/ui, bridge events, tests (M) | Missing-upscaler error; live two-stage output |
| ✅ 11 | LTX MSR ordered slots, stage-correct guide placement and crop | 10 | ltx schema/compiler/ui/tests (M) | Quality guide attaches after upscale; installed-node gate; 25-frame real output |
| ✅ 12 | Main media probe/extraction service and packaged FFmpeg discovery | 06 | media service, shared metadata, IPC, media tests (M) | Variable-FPS, missing/audio-only and frame-boundary fixtures |
| ✅ 13 | Persist media metadata/derivation and non-destructive clipping | 12 | database migration, media clip service, asset controls/tests (M) | Originals unchanged; restart retains range and parent ID |
| ✅ 14 | Ripple single-pass compiler and readiness | 08,13 | ripple definition/workflow/adapter/tests (M) | Source span, frame grid, strengths and node29 output assertions |
| ✅ 15 | Ripple workspace with replacement image and upload-limit handling | 14 | ripple ui, upload service, registry, tests (M) | Real 49-frame edit with retained audio; packaged restart playback; oversize remedy is actionable |
| ✅ 16 | FireRed compiler/model variants and save-node mapping | 03,12 | photo-edit definition/workflow/adapter/tests (M) | Turbo/Quality/GGUF capability fixtures and MCP validation; installed safetensors routes rendered live |
| ✅ 17 | Photo Edit UI and Ripple round-trip handoff | 15,16 | photo-edit ui, handoff handler, registry, tests (M) | Real 512×320 edit returns dimensions/source intact; actual Ripple edit and packaged restart pass |
| ✅ 18 | Continue single last-frame beat with inherited context and assembly | 13 | continue schema/compiler/runner/tests (M) | 71-frame real joined output; source/beat audio correlation >0.995; variable-FPS/silent/short-audio fixtures |
| ✅ 19 | Continue workspace and managed source handoff | 18 | continue ui, registries, handoff tests (M) | Turbo/Native live generation, packaged seeking/playback and SQLite restart pass |
| ✅ 20 | Selected frame, trailing motion/audio and direct H3 AV latent reuse | 19 | continue schema/compiler/media/tests (M) | Turbo/Native frames and latents render live; repeated joined-result continuation uses its exact checkpoint; managed checkpoints and generated segments reopen after packaged restart |
| ✅ 21 | Versioned scripts/beats in SQLite; branch validation and stale descendants | 19 | continue domain, database migration, lineage/tests (M) | Cycles/forward references and stale saves rejected; edits invalidate dependent results while retaining media; restart passes |
| 22 | Beat sequence execution/export plus canonical continuity controls | 20,21 | continue ui/runner, job steps, e2e (M) | Execution/recovery, dialogue guidance, source-audio carry, context length and per-beat camera complete; blend frames and owned replacements remain |
| ✅ 23 | Ripple chunk planner and persisted parent/child jobs | 15,20 | ripple batch, job steps, migration/tests (M) | Tail padding/overlap boundaries, partial failure/recovery; independent of automatic Continue scripts |
| ✅ 24 | Ripple long-mode controls and audio-preserving assembly | 23 | ripple ui/runner, media assembly/tests (M) | Short multi-chunk fixture; cancellation leaves chunks |
| ✅ 25 | Persistent engine settings and Auto/Single/Split/Custom component GPU routing | Baseline | settings panel, shared routing, bridge/tests (M) | Server-advertised choices, exact job snapshots, installed-provider live renders and packaged restart |
| ✅ 26 | Custom H3/Continue steps in Turbo and Native profiles | 20 | schemas, compilers, inspectors/tests (S) | Retain manual values across profile/default switches; real execution history and restart playback |
| ✅ 27 | Pinned FFmpeg/ffprobe Windows x64 private bundle with DLLs and notices | 12 | media manifest, packaging/build, diagnostics (M) | Verified archive digest; packaged probe/extract/clip with no FFmpeg on PATH |
| 28 | GPU residency/sequential strategy, memory budgets, CPU fallback and optional preload | 25 | engine routing, capability adapters/tests (M) | Actual model-size budgets, explicit overcommit, supported runtime nodes and real render; GPU selectors alone do not complete this |
| 29 | Diffusion/encoder overrides, two user LoRAs, Turbo 4 and named generation defaults/presets | 25,26 | schemas, model selection, compiler/tests (M) | Snapshot exact models/adapters, preserve authored text/media, reject missing stacks and render each enabled recipe |
| 30 | Attention backends, cache/tau settings, fixed-seed A/B quality and persisted benchmarks | 29 | diagnostic module, engine contracts/tests (M) | Installed-node compatibility, dedicated jobs, output comparison and recorded provenance |
| 31 | Reference prep, crop/fitting, roles/locks and revisable video-reference ranges | 13,17 | reference tools, media transforms/tests (M) | Managed derived assets, preserved originals, conflict checks and native workflow validation |
| 32 | Character Studio, five angles/turntable, approved identity sets and rich location records | 31 | library schemas, character/location tools/tests (M) | Master/turntable real outputs, exact extraction, stale-selection fallback and global record reuse |
| 33 | Hair, wardrobe and accessory libraries with owned reusable character bindings | 32 | reusable record schemas/library/tools (M) | No duplicate character settings; binding ownership and independent persistence |
| 34 | Ollama/LM Studio discovery, prompt help and authored-field-safe vision descriptions | Baseline | typed main provider, suggestion UI/tests (M) | Connection health, cancellation, explicit apply and no implicit authored-field overwrite |
| 35 | Scene Composer, timed/audio plans, scene conflicts and Scratchpad constraints | 31,34 | pure scene compiler, workspace UI/tests (M) | Target-specific handoff, dialogue/speaker timing, locks and prompt-audit fixtures |
| 36 | ACE-Step 1.5 and MiniMax Music 3 as separate audio modules | 03,12 | each provider schema/UI/compiler/main/tests (M each) | Installed models/nodes, real generated audio, managed FLAC/MP3 playback and packaged restart |
| 37 | H3 refinement and H3/LTX latent upscale; experimental RTX frame upscale | 12,20 | independent post-process routes/tests (M each) | Original audio/exact frame count, source lineage and real output; unsupported alternatives unavailable |
| 38 | Minimal movie assembly, then tracks/trim/reorder/titles/mute/lock/sync-lock/export | 18,22 | movie module/media assembly/tests (M) | Explicit timeline invariants, synchronized export and non-destructive source media |
| 39 | Production planning contracts, scene/shot casting/location handoff and continuity | 32,35,38 | planner schemas and handoffs/tests (M) | Production bible and shot dependencies; current source contracts do not prove a complete planner |
| 40 | Clip Master bookmarks/bulk export, comparison, search/help and user prompt presets | 13 | bounded utility modules/tests (M each) | Saved frame positions, synchronized comparisons, keyboard search and independently persisted user presets |
| 41 | Model-folder indexing, safe storage relocation, workflow export and UI scale | 25 | typed main settings/files + diagnostics (M) | Explicit owned paths, relocation verification/restart and export redaction; no style redesign |
| 42 | Optional token-protected LAN companion and explicit legacy import/reset tools | Baseline | separate transport/import modules (M each) | Scoped tokens/rotation; import preview/backups and managed copies; explicit destructive reset |
| 43 | Public redistribution corresponding-source package for bundled FFmpeg/dependencies | 27 | pinned source/licenses/build recipes (M) | Complete exact-binary source archive alongside public download; upstream links alone insufficient |

## Checkpoints

- [x] 01–07: H3 regression passes; ZImage usable; image output and handoffs establish second-provider modularity.
- [x] 08–11: LTX T2V/I2V plus validated installed optional profiles; unavailable profiles show exact requirements. Real Turbo T2V, Quality I2V and Quality+MSR I2V completed through the app with H.264/AAC outputs. MSR output cropped to the requested 25 frames.
- [x] 12–13 foundation: media probe, frame extraction, non-destructive clipping, SQLite derivation metadata and Assets controls work against a real LTX output and survive app restart. The current task 27 package bundles pinned FFmpeg/ffprobe; earlier delivery checkpoints used PATH.
- [x] 12–17: Ripple and Photo Edit complete a non-destructive round trip with source audio preserved. FireRed Turbo (zero/two references) and Quality (one reference) render real PNGs. GGUF remains fixture-verified until its model is installed. All edited images and the actual edited Ripple video reopen in the packaged app.
- [x] 18–19: Continue last-frame single beat works in Turbo and Native, saving raw and joined media with source lineage. Both real 71-frame H.264/AAC outputs seek into the generated beat after packaged restart. `build.bat` passes 34 unit/8 Electron checks and creates version `2.0.0+20260927.030220`.
- [x] Continue selected-lineage execution: two real beats rendered in order, retained AAC audio and 110 frames; packaged restart reopened and sought into the second beat. Mock branch/restart/cancel/resume checks pass.
- [x] Task 22 continuity slice: script-level dialogue guidance, prior-audio carry/mute and context length are canonical; camera direction is authored per beat. Real two-beat output and packaged restart pass; source mute measures −91 dB and generated beat −16.4 dB.
- [ ] 18–22: Implement measured audio/video blend frames and per-beat owned character/location replacements; wardrobe/prop records depend on tasks 32–33.
- [x] 23–24: Ripple batches recover without duplicate renders; final Windows package includes working media tools. See the settings/media delivery checkpoint below.

## Current interface and continuation slice

- [x] Shared resolution controls: 15 aspect presets, landscape/portrait/square, aspect locking and aligned size presets across all six generators. Settings remain in each canonical module draft.
- [x] Compact tool/category switcher in the existing menu bar; inspector modes and persisted drafts stay synchronized.
- [x] H3/Continue decoded live previews using the installed `MiniMaxH3LivePreview` node. Preview payloads are bounded, prompt-scoped and transient; final assets retain their existing output-node contract.
- [x] Repair legacy H3 Text to Video drafts with attached character/location/reference media by restoring Ref2VA. Explicit Text/Image choices deactivate stored reference/record attachments while preserving authored data. Bottom tabs/actions follow the active mode.
- [x] Application log workspace: app/runtime/Comfy/GPU information, searchable level filters, persistent rotated logs, renderer/IPC/job errors and redacted diagnostic export.
- [x] Selected-frame Continue in Turbo and Native. A 0.5-second selection retains 13 source frames and appends all 22 generated frames: 35 frames, 1.458333 seconds, H.264/AAC at 24 FPS.
- [x] Task 21 script storage and planning UI: original/previous/earlier-beat sources, optimistic revisions, validation, source ownership and stale descendants. Rendering controls remain unavailable.
- [x] Delivery verification: `build.bat` passed typecheck, 45 unit tests and 10 Electron checks; installer `2.0.0+20260927.055934` was built. All six real H3/Continue outputs reopened, probed and sought in the packaged app. Controls, logs, live previews and script planning were visually inspected at 1440×900 and 1100×760. Installed-app legacy state was reproduced with an isolated synthetic character-media fixture rather than copying private project data.
- [x] Ref2VA Maximum identity detail exposes native maximum reference sizing and its cost constraints; selection persists across restart.
- [x] Shared `//` prompt library: 86 parts across eight categories, search/filter, keyboard/mouse insertion at the cursor, Escape dismissal and persisted canonical prompt text, including script beats.
- [x] Task 20 final delivery: real Turbo/Native last-frame, selected-frame, motion-frame and trailing AV latent renders passed. Compatible H3 checkpoints persist on raw/joined assets; Auto selected direct latent reuse and a second continuation reused its joined source checkpoint. All 13 checkpointed outputs reopened and sought into their generated segments in packaged build `2.0.0+20260927.153206`.
- [x] Task 20 delivery: `build.bat` passed typecheck, 54 unit tests and 11 Electron checks and created installer `2.0.0+20260927.153206`. Seventeen real outputs exercised the changed H3/Continue routes; both required viewport screenshots were inspected. Queue/history gaps reconcile the original known prompt without duplicate generation.
- [x] Task 22 execution slice: saved scripts render selected ancestry in order, reuse valid completed ancestors, retain completed beats across restart/cancellation, reject uncertain resubmission and export the final joined video. A live restart while beat 2 was queued retained both original ComfyUI prompt IDs; its 110-frame/4.583333 s AAC output seeks after packaged restart.
- [x] Task 22 dialogue guidance, audio carry, editable context length and per-beat camera direction persist across script edits and reach real child jobs. Missing cached beat assets regenerate safely; legacy scripts without continuity fields retain their prior behavior.
- [ ] Task 22 blend frames and owner-validated character/location changes remain; wardrobe/prop replacements follow tasks 32–33. Dialogue is guidance to the model, not a strict speech-removal guarantee.
- [x] Tasks 23–24 long Ripple chunks, retained source audio, cancellation/recovery, exact final trimming and packaged restart are implemented. Windows x64 includes working pinned FFmpeg/ffprobe; clean-PATH checks pass. A fresh Windows VM install and public source distribution are separate release gates.
- [x] continuation slice passed - 1 passed in e2e testing. retains source audio and video latents for information sent thru the DiT model.
- [ ] Next Continue slice: specify blend frame-count/duration and audio crossfade invariants before adding controls.

## Settings and media delivery

- [x] H3/Continue live-preview settings: 1–32 decoded frames per update and 1–60 FPS playback, persisted globally and copied into each new job snapshot. The per-workspace switch still controls whether previews run. Existing jobs retain their submitted preview settings. MCP validated the 6-frame/48-FPS graph without warnings; app-driven H3 and Continue renders each delivered 33 decoded preview events, wrote 39/71-frame H.264/AAC results, and reopened and sought in the packaged app with FFmpeg off PATH. `build.bat` passed 68 unit and 14 Electron tests; both viewport screenshots were inspected. Installer: `2.0.0+20260927.225402`.

- [x] Settings connection save/test, live node/model/device refresh, queue counts, GPU memory and Auto/Single/Split/Custom component placement. Device choices come from server capabilities; unsupported requests fail before upload. Existing jobs retain their endpoint/routing snapshot.
- [x] H3 and Continue manual Turbo/Native sampling steps with preserved authored values and profile-default toggles. Actual server history confirms custom counts and four component selectors. Turbo/Native direct-latent repeat runs use unique job-scoped server checkpoints with overwrite disabled.
- [x] Ripple long-mode planner/runner: bounded chunks, padded final tail, overlap blend/cut, exact output trim, retained original audio, parent/child recovery and explicit resume. SQLite migration 5 retains old lineage and permits Ripple derivations.
- [x] Pinned FFmpeg/ffprobe 8.1.3 x64 bundle, shared DLLs, GPL notices, version/manifest self-checks and interrupted extraction recovery. Packaged probe/frame/clip operations work with FFmpeg absent from PATH. Synthetic bundled-tool fixtures cover overlaps, padding, silent/short audio and cancellation.
- [x] `build.bat` passed frozen-lockfile install, typecheck, 64 unit tests and 13 Electron checks; built private installer `2.0.0+20260927.165304`. Real outputs reopen and seek in the package. Both required settings/Ripple/custom-step viewport screenshots were inspected.
- [ ] Task 22 blend and owned replacement controls are the next core workflow slices. Tasks 28–43 retain all functional gaps from the source inventory, including public corresponding-source distribution. Fresh Windows VM installation remains unverified.
- [x] `build.bat` passed frozen install, typecheck, 65 unit tests and 14 Electron checks; installer `2.0.0+20260927.182046` built. Electron cancellation/resume and real mid-render restart passed. Script UI screenshots at 1440×900 and 1100×760 were inspected.
- [x] Full bug/gap run: format check, frozen install, typecheck, 67 unit and 14 Electron tests passed; FFmpeg audio carry/mute fixture and real app sequence passed. App log has no new errors after the live continuity render. Packaged build `2.0.0+20260927.210356` reopened and sought the real output with FFmpeg off PATH; both script viewports were inspected.

## Retained follow-on backlog

Split each into bounded tasks before implementation using the same acceptance/verification format:

- [ ] Reference tools and Character Studio: ZImage master, H3 turntable, five-angle extraction, reference sets, wardrobe/hair/accessory records.
- [ ] ACE-Step 1.5 and MiniMax Music 3 as separate modules with real audio-output tests.
- [ ] LTX latent 2x upscale; retain original audio/frame count and record parent asset.
- [ ] Local Ollama/LM Studio assistance, authored-field-safe reference descriptions, scene composer and scratchpad.
- [ ] Advanced GPU memory strategies/model overrides, user LoRAs, encoder selection, attention/quality diagnostics and additional preview stages. Core component placement is task 25, implemented.
- [ ] Minimal movie assembly then timeline functions; explicit locked-track/trim/export tests.
- [ ] Optional LAN companion and explicit legacy import, each with separate security/data review.
- [ ] Tiny H3 live-preview decoder compatibility: the installed node uses latent2RGB fallback for its current TAE weights; final-VAE preview fidelity is not verified.
- [ ] Flux, WAN, Qwen and Workflow Lab remain in scope; require concrete workflow audit before implementation.
- [x] Movie foundation: persistent imported media, drag-to-timeline, frame timecode, live preview scrubbing, timeline zoom, split/delete controls, two-axis preview fit and global inspector collapse.
- [ ] Movie editing: trim handles, multi-track add/reorder, ripple edit, snapping guides, undo/redo, keyboard map, clip properties and audio meters.
- [ ] Movie delivery: titles/transitions, proxy media, validated export presets, real FFmpeg assembly, cancellation/recovery and packaged restart verification.
- [ ] Modular panels phase 2: typed panel registry, dock/drop layout tree, persisted workspace layouts and safe reset.
- [ ] Modular panels phase 3: typed Electron panel windows, cross-monitor bounds recovery, focus/close lifecycle and automatic redocking.
- [x] Movie editing slice: source-aware trim handles, clip start/in/duration properties, mute/volume/lock controls, frame-grid placement, magnetic edge snapping, timeline-clock playback and separate audio-track preview.
- [ ] Movie editing continuation: add multiple video/audio tracks, undo/redo, ripple editing, audio meters and collision/layering controls; verify mixed-source playback and export.
- [x] Video generator audit slice: H3 mode/profile readiness now checks its required models and nodes; Continue single-beat dialogue/audio fields are visible and canonical. See `docs/video-generator-audit.md`.
- [ ] Video generator audit continuation: expose and validate LTX Quality refinement seed, test real single-beat Continue continuity, then review each generator route against installed nodes and application-driven renders.
- [x] Continue control/blend implementation slice: compact timing and source summary, script lineage/result state, Advanced controls and a 0–24-frame video/audio seam crossfade. Existing drafts default to zero overlap. A real application-driven 256×256 last-frame beat completed on ComfyUI; an initial FFmpeg xfade metadata failure was repaired and the saved raw beat recovered without resubmission. Its managed joined result has 64 frames at 24 FPS, 2.666667 seconds, H.264/AAC with 2.666-second audio, and reopened in a new app process. The packaged installer restart gate and remaining owner-validated replacements remain open for task 22.
- [ ] Shared layout phase 2 continuation: per-workspace persisted width/collapse/composer size and left/right dock swap are implemented. Saved wide docks now cap to the current viewport while retaining their requested widths; the Electron test verifies a usable center at 1100px. Finish the typed multi-panel drop tree, queue/preview relocation, detached windows, missing-display recovery and keyboard docking checks before closing modular panel tasks.
- [x] H3 control audit slice: compact preflight shows active mode/profile, effective steps, requested and encoded duration, inputs, preview availability and output streams.
- [ ] Ripple/Photo Edit control continuation: single-pass source In frame feeds managed source preparation and FireRed frame extraction; Out is derived from duration/frame grid. Chunk plan/recovery and selected Photo Edit result metadata are visible. A real nonzero-In Ripple edit completed through the app at 256×256, 49 frames/24 FPS, H.264/AAC, 2.041667 seconds; a new app process probed the managed output. Packaged installer restart and fuller source/result review remain open.
