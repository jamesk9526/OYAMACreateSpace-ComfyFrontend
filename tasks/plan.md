# CreateSpace 2.0 expansion plan

Updated 2026-09-27. This extends the original H3 prototype plan. Planned features below are **not implemented** unless explicitly marked otherwise. Keep the current app runnable throughout.

## Source audit

The expanded function-only parity inventory is [docs/studio-function-audit.md](../docs/studio-function-audit.md). It includes settings/engine controls, advanced GPU memory strategies, reference preparation and studios, local assistants, diagnostics, scene/movie production, audio, media tools and optional LAN/import functions. Every missing function stays explicitly pending; none requires adopting Studio's interface.

Reviewed the public Studio repository at commit `cec489b1365015a8bec21c4e88e9ebf73c4f27bb`, rather than relying on the older local checkout. Source root: https://github.com/jamesk9526/Oyama-AI-Video-Studio/tree/cec489b1365015a8bec21c4e88e9ebf73c4f27bb . Use its workflow behavior, tests and model requirements; all new UI follows `docs/reference/mockup.html`.

| Area | Source inspected | Gap in the original plan |
| --- | --- | --- |
| LTX 2.5 | `src/lib/ltx25Workflow.ts` | Explicit T2V/I2V, synchronized audio, Turbo and two-stage Quality, optional MSR references and stage-aware preview |
| LTX Ripple | `docs/ltx-ripple-workspace.md`, `src/lib/ltxRippleWorkflow.ts`, `src/lib/ltxRippleBatch.ts` | Separate source-video editing workspace, replacement frame, motion guidance, audio retention and long-video chunks |
| Continue | `src/components/ContinueWorkspace.tsx`, `src/lib/continuation.ts` | Beat scripts, original/previous/earlier-beat sources, branching, motion/last/selected-frame methods, continuity and assembly |
| ZImage | `src/lib/zimage.ts` | Dedicated image generator, Turbo/Base semantics, first-frame and library handoffs |
| Photo Edit | `docs/photo-edit-workspace.md` | FireRed instruction-based editing and round-trip frame handoff to Ripple |
| Music | `src/lib/aceStepWorkflow.ts`, `src/lib/music3Workflow.ts` | ACE-Step 1.5 and MiniMax Music 3 as separate audio providers |
| Production tools | `src/lib/movieTimeline.ts`, `src/lib/scratchpadCompiler.ts`, README, `docs/app-module-map.md` | Movie assembly, prompt scratchpad, scene composition, reference tools, diagnostics and optional LAN sharing |

Additional source files discovered for implementation review: `fireRedEditWorkflow.ts`, `birefnetWorkflow.ts`, `characterLibrary.ts`, `referenceAnalysis.ts`, `h3SceneCompiler.ts`, `gpuRouting.ts`, `h3Diagnostics.ts`, `movieHandoff.ts`, and their tests under `scripts/`. Discovery is not a claim these features have been verified in CreateSpace.

## Delivered baseline

The H3 prototype has the mockup shell, static module registries, project/module drafts, SQLite, global Characters/Locations, managed assets, mock generation, live H3 and timestamped Windows packaging. The first expansion checkpoint is complete: shared upload/output contracts, registry-owned defaults, declared save-node output handling, ZImage Turbo/Base, managed image output, secure H3 first-frame handoff and global media promotion. LTX 2.5 is registered with Turbo, Quality, synchronized audio, ZImage first-frame handoff and ordered optional Licon MSR references. Single-pass Ripple has source/replacement controls, normalized bounded uploads and source-audio output. Photo Edit supports FireRed Turbo/Quality and the Ripple round trip. Continue supports last-frame, selected-frame and motion-context beats, managed raw/joined outputs and compatible trailing video/audio latent checkpoints. Branched scripts can be planned and saved; automatic script execution/recovery/export and long-video Ripple remain unimplemented.

Verification on 2026-09-26: 14 focused tests and 3 Electron interaction tests passed; `build.bat` produced `2.0.0+20260926.204531`. H3 text/image/reference graphs completed through Comfy MCP; a packaged app completed and played an H3 output with H.264 video and AAC audio. ZImage Turbo completed through the app and persisted a decodable 256×256 managed PNG; the packaged build reopened it after restart. ZImage Base completed through Comfy MCP. Both graphs validated with zero errors and warnings. This does not verify LTX, Ripple, Continue or any other future provider.

Verification on 2026-09-27: LTX Turbo T2V, Quality I2V and Quality+MSR I2V completed through CreateSpace against local ComfyUI. Each saved 512×320 H.264/AAC video. The 1-second MSR case initially decoded guide frames into a 65-frame video; adding `LTXVCropGuides` before video decode produced the intended 25-frame, 1.041667-second output. All four compiled variants (Turbo/Quality with and without MSR) passed Comfy MCP validation with zero errors/warnings. The source recipe is `Oyama-AI-Video-Studio/src/lib/ltx25Workflow.ts`; the guide-crop requirement comes from the Licon MSR node README. LTX UI, handoff and draft restart behavior pass Electron interaction testing. `build.bat` passed 20 unit tests and produced `release/OYAMA-CreateSpace-2.0.0+20260927.011609-Setup.exe`; the packaged app reopened the corrected LTX output from SQLite and decoded it. The installer is currently unsigned. Ripple, Continue and later providers remain unverified.

Media foundation verification: `MediaService` probes the real 25-frame LTX/AAC output, extracts a PNG at 0.5 seconds and creates a new 0.625-second MP4 clip through typed Electron IPC. SQLite migration 2 retains parent IDs, exact source ranges and stream metadata. The original file is untouched. The Assets workspace exposes Inspect media, Save current frame and Create clip controls; Electron interaction tests verify these and restart persistence at both supported window sizes. Media-tool discovery checks packaged resources then PATH, but the NSIS installer does not yet bundle FFmpeg; task 24 owns that clean-machine gate.

Ripple verification on 2026-09-27: Comfy MCP validated the source-adapted single-pass graph with zero errors/warnings. Two real CreateSpace submissions completed on local ComfyUI. The full-span case used a real two-second LTX I2V source and real ZImage replacement; prompt `60742342-b7e0-4594-a922-74341ac9ff02` saved 512×320, 49 frames, 24 FPS, H.264/AAC, 2.041667-second video and 2.005-second audio. Decoded audio correlation against the original source was 0.9971. Temporary preparation kept the original source intact. The Ripple Electron interaction test verifies source length gating, inputs, managed preview and restart draft persistence; both required viewport screenshots were inspected. `build.bat` passed 25 unit tests and produced `release/OYAMA-CreateSpace-2.0.0+20260927.020336-Setup.exe`. The packaged app reopened and decoded the real Ripple output without resubmission. The installer is unsigned and still uses FFmpeg on PATH.

Photo Edit / Continue verification on 2026-09-27 UTC: FireRed Turbo with no references and two references, and Quality with one reference, completed through CreateSpace on local ComfyUI as 512×320 PNGs. Quality prompt `03796a0c-974b-4940-a439-64f1a22585ee` returned its actual canvas to Ripple while preserving the source; Ripple prompt `28bcd68e-7521-422d-8024-5b644b77ecc6` then produced the edited 49-frame H.264/AAC video with source audio correlation 0.9971. GGUF selection has capability fixtures; its model is not installed, so it has no live verification.

Continue Turbo prompt `cfc9e21b-f605-4220-9bed-375cb4e662eb` and Native prompt `365b4be3-04fd-4756-9773-c503e11290f7` each generated a 22-frame last-frame beat. Joining the 49-frame source produced 71-frame, 512×320, 24 FPS, 2.958333-second H.264/AAC outputs. Source/beat audio correlation exceeded 0.995. Assembly's initial frame-rate mismatch was repaired and the original downloaded Turbo beat recovered without another submission. SQLite v3 retains source/beat/job lineage; downloaded raw outputs are checkpointed before finalization. Explicit byte-range media responses fixed real seeking. Variable-FPS, silent-source and short-audio fixtures pass. Closing during capability inspection cannot submit later; unknown jobs require explicit local dismissal after inspecting server history.

Final checkpoint: `build.bat` passed type checks, 34 unit tests and 8 Electron interaction tests, producing `release/OYAMA-CreateSpace-2.0.0+20260927.030220-Setup.exe`. The packaged application reopened all three real FireRed cases, the actual edited Ripple video, and both Continue profiles without generation. Continue seeking to 2.3 seconds decoded the generated segment with synchronized audio. Required viewport screenshots were inspected. Tasks 16–19 are complete; selected-frame/motion routes, scripts/branches and long Ripple remain unchecked. The installer still depends on FFmpeg/ffprobe on PATH; clean-machine media-tool bundling remains task 24.

## Architecture changes before the second generator

Keep the existing small core and static registrations. Do not add a plugin marketplace, generic graph editor framework, message bus, or general-purpose scheduler.

1. Move common upload/output descriptor types out of `h3/workflow.ts` into shared contracts. Main adapters and the bridge must not depend on H3 types.
2. Resolve defaults, schema, readiness, seed policy and output kind through the registered module. Remove the H3 fallback from generic draft access. An unknown module stays unavailable and retains its saved draft.
3. Keep global settings limited to connection, storage and engine preferences. Module settings belong to `(projectId, moduleId)` drafts. Add a schema version and per-module migration hook as new schemas land.
4. Each module owns definition/schema, UI contributions, workflow compiler, requirements and output-node allowlist. Support image, audio and video outputs without assuming SaveVideo. An input/preview node must never be collected as a finished output.
5. Introduce typed handoffs using managed asset IDs: first frame, replacement frame, continuation source, character reference and timeline clip. Carry project, source job, transform/crop and actual dimensions. Validate project access in main and preserve the destination draft's unrelated fields.
6. Add a small main-owned media service for ffprobe, frame extraction, crop/resize, clipping and assembly. Spawn a packaged, versioned FFmpeg binary with argument arrays and no shell; bound work, track cancellation, use private temp files and atomic output registration. Never expose raw file paths/process execution to renderer. Record distribution/license requirements when selecting the binary.
7. Extend SQLite incrementally: media metadata and asset derivations first; module draft versions next; continuation scripts/beats and batch steps only when those modules need them. Parent/child jobs retain exact prompt IDs, submission snapshots and outputs. Failed download/assembly retries reuse completed renders.

Suggested new folders: `src/modules/{zimage,ltx,ripple,photo-edit,continue,music-ace,music3}`, `electron/main/media/`, `shared/media.ts`, `shared/handoffs.ts`. Main adapter registration stays separate from renderer registration. Share pure LTX graph helpers only where both LTX and Ripple actually need them.

## Workspace and UX requirements

Keep Create / Projects / Characters / Locations / Assets in the navigation. Generators and editing tools open through Create modes and document tabs, using existing workspace/composer/inspector slots. Preserve the rail, docks, title/menu/footer, dark/lime tokens and dense control styling. Lists of beats or chunks belong inside a workspace, not a replacement shell.

Each provider gets an independent draft, explicit readiness, missing-node/model details, deterministic mock scenarios, real progress, cancellation and history. Unsupported controls are disabled with an explanation. Store actual output size/duration alongside requested settings. Model installation remains manual.

### ZImage (`zimage`) — first expansion

- Image preview and prompt/negative/settings in existing slots; seed, dimensions, steps, CFG and variant belong to its own draft.
- Source Turbo uses 8 steps/CFG 1 and zeroed negative conditioning; Base uses actual negative text. Validate Base defaults and installed model before enabling it; do not apply Turbo settings silently to Base.
- Compile through UNET/CLIP (lumina2)/VAE, AuraFlow shift 3 and the source sampling recipe. SaveImage node 10 is the output contract; PreviewImage is not an output asset.
- Actions: use as H3/LTX first frame, save as Character/Location reference, send to Photo Edit. Project-to-global promotion copies into global managed storage explicitly.

### LTX 2.5 (`ltx`)

- T2V/I2V first, native audio, installed transformer/Gemma encoder/video+audio VAEs. Turbo is one stage; Quality requires the latent upscaler and half-size first stage plus refinement.
- Preserve source manual sigma schedules and model-dependent conditioning. Validate dimensions for both stages and the `8n+1` frame grid; the source helper's seconds-to-frames calculation must not be generalized to arbitrary fractional durations without validation.
- Read only SaveVideo node 43 as output. Show stage and step separately. Add optional sampling previews only when the connected nodes support them.
- MSR follows the basic provider: four subject slots plus background, explicit ordering and installed IC-LoRA nodes/models. Quality attaches guides after latent upscaling. Crop guides after sampling before video decode, preserving the requested frame count; a live one-second MSR run exposed this requirement.

### LTX Ripple (`ripple`)

- Separate video-edit module: source clip + edited first frame + optional preservation prompt. Preview original/replacement/result, source range and effective output size in the existing shell.
- Main probes and normalizes the source to 24 FPS. Preserve original media; report crop/resampling. Share a typed resolution handoff with Photo Edit, without creating duplicate settings owners.
- Single-pass first: source-valid 2–20 second spans, `8n+1` frames, 32-aligned 256–2048 dimensions. Source default LoRA strength is 1.35; motion-guide strength is separate and defaults to 1. Eight-step simple/euler sampling, IC-LoRA guide at frame 0, crop guides after sampling, retain source audio. Output comes from node 29, never LoadVideo node 9.
- Detect `/features` upload limit; stream uploads. Optional temporary H.264/AAC conversion must preserve normalized timing and fit the actual limit or give a clear shorter-clip remedy.
- Later long mode: 2 seconds–5 minutes, sequential 5/10/15-second chunks, 0–2-second overlap, next edited frame sourced at the correct overlap boundary. Persist chunk results; blend or trim/join, retain source audio, trim padded tail. Seamless identity is not guaranteed. Resume only after reconciling existing prompt IDs; keep completed chunks on failure/cancellation.

### Photo Edit (`photo-edit`)

- FireRed source image + instruction, independent draft. Turbo uses installed 8-step Lightning LoRA; Quality uses source 40-step recipe. Detect supported safetensors/GGUF loaders, Qwen encoder and VAE.
- Ripple extracts frame 0, sends image+canvas to Photo Edit, and receives the selected result's actual dimensions without losing source clip or settings. Also accept ordinary library images.
- Download/save retry uses the same completed prompt; selecting an existing edited output never rerenders.

### Continue (`continue`)

- Start from a managed video or completed job. First deliver one last-frame continuation with preview, source context, inherited prompt/records, new action and explicit resulting duration.
- Add selected-frame and motion-context routes only with verified nodes. Preserve generated head frames: remove only repeated guide frames, account separately for crossfade, and display H3 frame-grid effects.
- Then add scripts and beats with original/previous/earlier-beat sources. Reject cycles/forward references; reordering/removing a beat repairs or visibly invalidates dependencies. Editing a parent marks derived beats stale instead of silently treating them as current.
- Keep continuity settings canonical at script level: dialogue inherit/none/allow, context frames, blend frames and audio carry. Support per-beat camera and controlled character/wardrobe/location/prop replacement with owner IDs.
- Persist lineage, source snapshot, delivered duration and job IDs. Render dependencies sequentially, cancel the requested work, retain completed branches, assemble/export the selected lineage with synchronized audio. Explicit resume must never duplicate uncertain submissions.

## Further omissions to retain in the roadmap

| Priority | Addition | Boundary and acceptance |
| --- | --- | --- |
| After core editing | Reference tools | Non-destructive 2–15 second video clipping, image crop/fit, audio references, background removal/fill; save derived asset and parent transform |
| After ZImage + Continue | Character Studio | Master reference generation, H3 turntable, five-angle extraction and selecting single/reference sets; retain global library reuse |
| After reference tools | Hair / Wardrobe / Accessories | Typed reusable library records, ownership links and composition rules; do not duplicate Characters or create extra top-level navigation |
| After core generators | Local prompt assistance | Optional Ollama/LM Studio enhancement, authored-field-preserving vision descriptions, cancellable suggestions; main-owned local transport |
| After assistance | Scene Composer / Scratchpad | Timed shots, speakers/dialogue, reference roles and locks, prompt audit, target-specific handoff; preserve user-authored text |
| After common audio output | ACE-Step 1.5 | Separate provider, XL Base/SFT readiness, tags/lyrics/instrumental/BPM/key/language, FLAC playback and export |
| After ACE-Step | MiniMax Music 3 | Separate model stack, caption/lyrics, duration, tiled audio decoding and MP3; verify custom nodes before enabling |
| After core video | Upscale | Verified LTX latent 2x post-process preserving frame count and original audio; RTX/frame alternatives stay experimental |
| After basic diagnostics | Engine controls | Model overrides, optional user LoRAs, encoder selection, runtime-advertised GPU routing, VRAM estimate, attention benchmarks and fixed-seed A/B diagnostics |
| After Continue assembly | Movie assembly | Minimal clip sequence first, trim/reorder/audio/export, then timeline/locked tracks; avoid building a full NLE before this path works |
| Later optional | LAN companion | Explicit opt-in server, scoped token/rotation, restricted media/commands and separate security review; not required by desktop prototype |
| Later optional | Legacy import | Explicit old-project/library import with preview, backups and managed copies; never ingest old UI or overwrite source data |
| Existing backlog | Flux / WAN / Qwen / Workflow Lab | Remain planned; inspect concrete workflow sources and model contracts per provider. FireRed's Qwen conditioning is not a generic Qwen generator. |

Also preserve search/help, live decoded previews, per-stage job activity and export naming as shared features. No automatic model downloads or privileged ComfyUI node installation is introduced.

## Risks and verification gates

- Source code is a recipe, not proof of compatibility with the current server. Inspect capabilities through Comfy MCP and validate graphs before each provider's live smoke test.
- GPU-heavy Quality/Ripple/MSR features may lack models or memory. Keep the module visible with specific readiness failures; do not silently substitute another recipe.
- FFmpeg timing, variable frame rate, silent inputs, audio duration and overlap are correctness risks. Test short synthetic fixtures and inspect output streams/duration.
- Every delivered slice runs typecheck, affected tests and build. UI/IPC changes additionally run Electron tests and screenshots at 1440x900 and 1100x760. Every generator needs one app-driven output, persisted and playable after restart; MCP-only output is insufficient.
- Keep current H3 regression coverage. Batch interruption must leave recoverable records and never rerun an uncertain job automatically.

## Ordered build sequence

1. Generalize module contracts/defaults/output handling while retaining H3 behavior.
2. Implement ZImage Turbo end to end, then Base and typed first-frame/library handoffs.
3. Implement LTX Turbo T2V/I2V; then Quality, stage progress and MSR.
4. Add managed media probing/extraction/clipping and frame-accurate fixtures.
5. Implement Ripple single pass using an existing replacement image.
6. Implement FireRed Photo Edit and complete the Ripple round trip.
7. Implement Continue single beat, then selected-frame/motion routes.
8. Implement Continue scripts/branches and recoverable assembly.
9. Add Ripple long-video chunks and recovery using the proven batch primitives.
10. Expand references/Character Studio, then audio providers and latent upscale.
11. Add prompt assistance, scene tools, diagnostics and minimal movie assembly in separate verified slices.
12. Consider optional LAN/import and remaining provider modules after desktop workflows are stable.

Concrete work items and dependencies are in `tasks/todo.md`. Each completed slice must leave a runnable application; the whole expansion is not one release gate.

## Current implementation checkpoint

The shared interface now includes aspect/orientation locking, an inline tool-mode switcher, decoded H3 previews and an application log workspace. Legacy H3 drafts with attached record media migrate to Ref2VA. Explicit Text/Image mode choices leave stored references and record attachments inactive; the author draft retains them for a later return to Ref2VA. Composer controls follow the active mode. Ref2VA exposes native maximum reference sizing as Maximum identity detail, including its resolution/cost constraints. A shared `//` prompt menu provides 86 searchable parts in eight categories and inserts at the cursor in generator prompts and script beats.

Continue's selected-frame route extracts a verified frame time and joins only the source prefix through that frame with every generated frame. Motion context supports 5/22/39 trailing frames and audio, conditioning the generated head and trimming only that repeated head before assembly. The installed H3 extender supports direct video/audio latent reuse. H3/Continue save exact per-job AV checkpoints into managed project storage, associate them with raw/joined output IDs, and restore them to the selected ComfyUI server. Auto prefers a compatible checkpoint; users can require saved latents or force trailing frames. Imported/older sources, changed canvases, insufficient saved context or missing files use the frames path in Auto. Required-latent mode rejects incompatible sources. Cross-project context is forbidden; retries load an exact source file, never a directory's newest checkpoint. Script sequence execution follows a selected beat's ancestry, separate from repeatedly continuing a joined result.

Task 21 is implemented with SQLite migration 4 and versioned scripts/beats. Scripts own source/settings; beats choose original, previous or an earlier beat. Main validates project ownership and revisions, rejects forward/cyclic dependencies, preserves server-owned output metadata and marks affected descendants stale. The Script workspace supports planning, save, reorder and removal. Task 22's execution slice adds main-owned parent/child sequence jobs, selected-ancestry rendering, valid completed-ancestor reuse, cancellation, restart recovery, explicit resume with uncertain-submission protection and final joined-video export. The later continuity checkpoint below records which authoring controls are now available and which remain.

Delivery `2.0.0+20260927.153206` passed typecheck, 54 unit tests, 11 Electron checks and `build.bat`. Seventeen real app-driven H3/Continue outputs exercised the changed routes. All 13 checkpointed outputs reopened with their managed contexts and sought into the generated segment after packaged restart, including Turbo/Native motion and a second continuation from a joined result. Both required viewport screenshots were inspected. This completed task 20; the settings/media delivery below supersedes its remaining Ripple/bundling status.

## Settings, sampling and long-media delivery

Tasks 23–27 implement persistent connection/device settings, custom H3/Continue steps, long Ripple and private Windows media-tool bundling. GPU placement uses the connected server's core SelectModelDevice/SelectCLIPDevice/SelectVAEDevice schemas, validates actual reported indexes and rewires every loader consumer before input encoding, LoRAs and decoding. Auto keeps server defaults; Single/Split resolve reported GPU indexes; Custom selects each component. New jobs snapshot endpoint/routing. Unsupported routes fail before upload; GGUF diffusion reload is explicitly unsupported. Residency, preload, memory estimates and model/LoRA/attention overrides remain separate tasks 28–30.

H3 and all Continue methods preserve the authored manual 1–100 step count. The profile-default toggle uses Turbo 8 or Native 30 without discarding that manual value. Custom counts retain the chosen diffusion stack, official Turbo adapter and sampler recipe. Settings and module controls share canonical fields.

Ripple long mode supports 2–300 seconds with 2–20 second chunks and bounded overlap. Each chunk uses its source-motion range and the replacement frame; the final source tail is padded temporarily and trimmed out of assembly. A persisted parent discovers child jobs by parent/index, resumes known prompts, retains completed chunks and never resubmits an uncertain child automatically. Explicit resume retries only known stopped work; assembly retry reuses completed chunks. Blend/cut joins deliver the exact requested 24 FPS frame count with original source audio. This runner uses the existing job primitives independently of the Continue script runner. SQLite migration 5 preserves earlier derivations and adds Ripple lineage.

Windows x64 packaging verifies a pinned FFmpeg/ffprobe 8.1.3 archive digest, includes shared DLLs/license/provenance, checks exact executable versions and recovers interrupted extraction. Packaged media tools take precedence over PATH. Packaged probing, frame extraction and clipping passed with PATH restricted to Windows System32. This is a private artifact; complete corresponding source before public redistribution remains task 43, and a fresh Windows VM install is not yet verified.

Repeated direct-latent continuation exposed an installed Windows loader keeping its source checkpoint memory-mapped. Overwriting that source-named server file produced HTTP 500 before submission. Main now stages each job's exact owned bytes under a unique job-ID filename with overwrite disabled; existing cached checkpoints remain intact. Capability/ownership and bounded safetensors validation still apply. Source media and managed checkpoints remain unchanged.

The function-only Studio audit retains all remaining source features in tasks 28–43 and documents incomplete source contracts honestly. Script execution and export work; the later continuity checkpoint narrows task 22's remaining controls.

Delivery `2.0.0+20260927.165304` passed frozen-lockfile install, typecheck, 64 unit tests, 13 Electron interaction tests and `build.bat`. Twenty-three MCP graphs passed with no errors/warnings. Twenty-two routed functional cases, including Turbo/Native saved-latent repeats, and the two-chunk Ripple batch were rendered through the app. Final packaged reopening verifies their managed streams, dimensions, duration and seeking with FFmpeg absent from PATH. Both required viewport screenshots were inspected. Tasks 23–27 are complete; task 22, advanced engine features, public source distribution and fresh Windows VM install checks remain unchecked.

## Continue script execution checkpoint

The selected-lineage runner persists a parent job with an immutable script snapshot and ordinary Continue child jobs keyed by beat ID. It follows original/previous/earlier-beat dependencies, reuses valid completed ancestors, records each completed beat's job/output/delivered duration, retains finished branches, and exports the selected joined video. Cancel stops pending submissions and requests cancellation of an active known child. Explicit resume retries only known failed/cancelled children; active, unknown or dismissed uncertain submissions block retry. Reopening after restart discovers child records and does not silently resubmit them.

A real two-beat Turbo sequence on the user's ComfyUI produced a 110-frame, 4.583333-second 512×288 H.264/AAC managed video. A second two-beat run restarted the app after beat 1 completed and beat 2 had a known ComfyUI prompt; recovery retained both original prompt IDs and produced the same streams. Packaged restart with FFmpeg absent from PATH reopened that result and sought to 3.8 seconds in the second beat. `build.bat` passed 65 unit and 14 Electron tests and built private installer `2.0.0+20260927.182046`. An Electron test exercised cancellation and explicit resume. Both required script workspace viewport screenshots were inspected.

## Continue continuity and audit checkpoint

Task 22 now stores dialogue guidance and source-audio carry at script level and exposes the existing motion-context frame count there. Each beat can author camera direction separately from its action. The runner snapshots those values into each child job; the Continue adapter adds guidance to the prompt, and media assembly either carries preceding audio or supplies silence for that segment while preserving the new beat audio. Dialogue guidance cannot guarantee the model produces no speech. Editing these controls invalidates affected beat results; older scripts without them keep their original defaults. Missing cached result records/files no longer count as reusable beat output and trigger a fresh render.

The full audit found one formatting failure in a smoke helper and a legacy-script defaulting failure introduced while adding continuity; both were corrected. Format check, frozen install, typecheck, 67 unit tests and 14 Electron checks pass. The synthetic media fixture measured carried audio at −24.1 dB versus muted audio at −91 dB. A real two-beat script with dialogue guidance, camera directions and muted preceding audio produced 110 frames at 24 FPS with AAC: its preceding segment measured −91 dB and generated segment −16.4 dB. The installed Continue graph passed Comfy MCP validation; the Comfy queue was empty before generation. Packaged build `2.0.0+20260927.210356` reopened the managed result and sought to 3.8 seconds with FFmpeg absent from PATH. Both required viewports were inspected, and app logs show no new errors from the render.

Task 22 remains open for measured video/audio blend frames and owner-validated character/location replacements. Wardrobe/prop bindings depend on tasks 32–33. Tasks 28–43, public corresponding-source distribution and fresh Windows VM installation remain open.

## Dockable workspace shell and Movie editor plan

Panel modularity will ship in bounded layers so renderer panels never gain filesystem or raw IPC access. Phase 1 adds a shared collapsible inspector dock, persistent visibility, Movie timeline zoom, frame-based timecodes, live scrubbing and preview fitting against both available dimensions. Phase 2 introduces a typed panel registry, persisted per-workspace layouts, split/drop targets, minimum sizes and reset-layout recovery. Phase 3 adds Electron-owned detachable panel windows using named preload operations, stable panel instance IDs, monitor-bound restoration and automatic redocking when a display disappears. Phase 4 adds saved workspace presets and keyboard/menu commands. A panel keeps one canonical state owner while docked or detached; moving a panel changes presentation only.

Movie editing grows within task 38 in separate reviewable slices: timeline navigation and selection; non-destructive trim/split/reorder with snap and locks; track creation, mute/solo and synchronized audio; titles/transitions; then validated export presets and FFmpeg assembly. Export is not complete until a real application-driven render preserves timing and audio, reopens after restart and passes both required viewport checks.

## Existing-workflow control pass (2026-09-28)

Continue now exposes a zero-default 0–24-frame seam blend for single beats and saved script continuity. Main validates that overlap is shorter than both segments. Managed FFmpeg assembly crossfades video/audio and verifies the shortened frame count; prior scripts parse with zero overlap. The Continue inspector shows retained frames, generated frames and expected joined duration. Script beats show source dependencies, saved-result timing and active job messages. Advanced sampling/latent controls start collapsed. A real 256×256 app-driven H3 Continue beat was rendered on ComfyUI and, after a constant-frame-rate xfade fix, the completed raw beat was recovered into a 64-frame 24 FPS 2.666667-second H.264/AAC joined asset without another submission. A new app process reopened its managed output. Packaged installer reopening remains unverified.

The shared shell now stores per-workspace left/right widths, open state, composer height and a reversible left/right dock swap. Dividers support pointer and keyboard resize, and View offers Reset workspace layout. This is a bounded phase-2 slice, not the full panel registry/drop tree. Detached windows, monitor recovery and independent preview/queue docking remain open.

H3 has a compact mode-sensitive preflight summary. Ripple single pass has a frame-based source In offset applied to managed preparation and FireRed frame extraction, with Out derived from the supported frame grid. Long Ripple displays its chunk plan and retained child state. Photo Edit displays selected source/result canvas metadata before the Ripple handoff. A real app-driven nonzero-In Ripple edit produced a 49-frame 24 FPS 2.041667-second H.264/AAC managed result and reopened in a new app process. Packaged installer verification remains open.
