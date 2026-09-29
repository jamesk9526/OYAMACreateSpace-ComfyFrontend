# OYAMA CreateSpace 2.0

A Windows desktop workspace for local ComfyUI, built with Electron, React, TypeScript, Vite, Tailwind, Radix, Zustand and SQLite. The visual reference is `docs/reference/mockup.html`; project rules are in `AGENTS.md`.

## Run

Install Node.js 22.16+ (24 recommended), then:

```powershell
npx pnpm@10.11.0 install --frozen-lockfile
npx pnpm@10.11.0 dev:mock
```

Use `pnpm dev` for live ComfyUI. Start ComfyUI separately, then open Settings to test its address (default `http://127.0.0.1:8188`). H3 needs its FL2VA/Ref2VA diffusion models, MiniMax text encoder, video/audio VAEs and core nodes. Turbo 8 additionally needs the corresponding LoRA. Missing dependencies are reported before submission. See `docs/workflows.md`.

Create projects, import references, and create global Characters and Locations. H3 supports text-to-video, image-to-video with optional last frame, and Ref2VA. ZImage supports Turbo and Base still-image generation, managed outputs, global media promotion and direct H3/LTX first-frame handoff. LTX 2.5 supports text-to-video, image-to-video, synchronized audio, one-stage Turbo, two-stage Quality and ordered optional Licon MSR image references. Its installed model, VAE, upscaler and node requirements are shown in the Inspector. Select References, MSR or Negative in its composer as needed. Future generators are listed as coming later.

SQLite and managed media live in Electron's userData folder. Development and mock sessions use separate `OYAMA-CreateSpace-dev` / `OYAMA-CreateSpace-mock` folders under `%APPDATA%`. Imports are copied; originals are untouched. Submitted jobs retain their settings and seed. Reconnection uses existing prompt IDs; uncertain submissions are never automatically repeated.

Assets offers media probing, save-current-frame and non-destructive clip creation. Derived files keep their source ID and range in SQLite. LTX Ripple propagates an edited first frame through a source video, retaining its audio. Select its source video and replacement image in References, then choose a 2–20 second span. CreateSpace makes a temporary trimmed 24 FPS upload copy and keeps the original. Long mode supports a 2–300 second source span in sequential 2–20 second chunks, overlap blending or cuts, exact final frame trimming and original source audio. Completed chunks survive cancellation and restart; use **Resume batch** after a known failure. Uncertain prompts require reconciliation. Windows x64 packages bundle pinned FFmpeg/ffprobe and their DLLs; development can use tools on PATH.

## Verify and build

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm package:win
```

Double-click `build.bat` to install locked dependencies, typecheck, run unit tests, compile, run Electron interaction tests and create a Windows x64 NSIS installer under `release/`. Packaging stops on any failed check. Build metadata starts at 2.0.0 and automatically includes UTC date/time; the app, installer and Windows file metadata share one build timestamp. Native SQLite is rebuilt for Electron during install.

Mock runs use a bundled synthetic video and isolated data. Settings offers success, failure and offline scenarios. The production app uses the live server. Generated media remains available after restart and can be exported from Assets.

The app connects to ComfyUI; it does not install models, custom nodes or ComfyUI. Renderer security includes sandboxing, context isolation, a narrow preload API and managed asset URLs. New modules follow `docs/modules.md`.

## Expansion roadmap

The source-audited expansion plan is in [tasks/plan.md](tasks/plan.md), with ordered work in [tasks/todo.md](tasks/todo.md). H3, ZImage, LTX 2.5, single-pass LTX Ripple and FireRed Photo Edit are working generators. Continue supports last-frame, selected-frame and motion-context beats, saving raw and joined videos. Motion context can reuse managed H3 video/audio latents directly, including from a previously joined result. Branched scripts can be planned and saved; automatic Continue sequence rendering/recovery/export remains planned. Long Ripple has its own persisted parent/child runner. The dark/lime mockup remains the visual source of truth for every workspace.

Photo Edit accepts a source image, an edit instruction and up to two optional references. Turbo uses FireRed Lightning; Quality uses 40 steps. In Ripple, **Edit first frame with FireRed** extracts the source frame and transfers the selected canvas. **Use as Ripple replacement** returns the edited result's actual dimensions while preserving the source video and draft.

Continue accepts managed project/global videos. Use **Continue this video** in Assets, or select a source in its workspace. Its Context tab can inherit the source generation prompt; Prompt contains the new action. Last/selected-frame beats use H3's nearest 17n+5 frame grid; motion beats add multiples of 17 new frames after trimming their repeated context. The inspector displays the effective duration. Source and generated beat are fitted to the selected canvas at 24 FPS, audio is preserved/padded, and the joined video can be previewed, sought and exported. Packaged Windows x64 media operations use the bundled tools before PATH; no separate FFmpeg installation is required.

Use the menu-bar tool switcher to change Video/Image tools and conditioning modes. Each generator has shared aspect presets, orientation, ratio locking and supported size presets in its inspector. Ref2VA displays reference/character controls and offers **Maximum identity detail** using the native maximum reference-size option. Explicit Text to Video hides and deactivates attached references while preserving them in the draft. Legacy text-mode drafts with media are repaired automatically. H3 and Continue can show decoded live sampling previews when `MiniMaxH3LivePreview` is installed on the connected server.

Type **`//`** in a prompt or script beat to open 86 reusable camera movements, shot framing, scene starters, lighting, subject motion, audio/dialogue, style and continuity parts. Type to search, filter by category, use arrows plus Enter/Tab to insert, or Escape to close. Text outside the insertion stays intact.

For motion continuation, choose **Motion context** and 5, 22 or 39 context frames. **Auto** prefers saved trailing H3 video/audio latents when canvas and context length match; **Saved H3 latents · required** rejects incompatible sources, and **Trailing video frames** explicitly uses decoded frames/audio. New H3 outputs save checkpoints when `MiniMaxH3SaveLatent` is installed. Direct reuse additionally requires `MiniMaxH3LoadLatent` and an extender advertising `prev_latent`. Older/imported media can still continue through the frames path. Only the repeated context is removed; original media remains intact.

Open **Application log** under Project or View for runtime/Comfy/GPU information, searchable severity filters and diagnostic export. Logs rotate locally and redact credentials and preview payloads. Continue's **Script** tab stores original/previous/earlier-beat plans with revision checks; editing parents marks dependent results stale while retaining their media. Save a plan before leaving its workspace. Sequence rendering is visibly unavailable until task 22 is complete.

Settings persists the ComfyUI address and Auto, Single GPU, Split GPU or Custom component placement. Refresh inspects nodes, models, queue counts and GPU memory. Custom routes select diffusion, text encoder, image/video VAE and audio VAE independently using only server-advertised devices. Unsupported requested routes fail before upload; submitted jobs retain their routing snapshot. ComfyUI retains control of offloading. Memory strategies, user model overrides, extra LoRAs and attention benchmarks remain separate roadmap items.

H3 and Continue expose manual sampling steps for both Turbo and Native. Turn off **Use profile step defaults** to choose 1–100 steps. Turning it on uses Turbo 8 or Native 30 while retaining the authored manual value. The selected model, official Turbo adapter and sampler recipe stay intact.

The complete function-only Studio comparison is [docs/studio-function-audit.md](docs/studio-function-audit.md). Its missing features have explicit acceptance tasks in the roadmap. The private media-tool bundle records checksum, version, DLLs and license notices; public redistribution's complete corresponding-source package remains task 43.
