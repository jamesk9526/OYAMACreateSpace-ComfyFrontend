# OYAMA CreateSpace engineering contract

## Visual source of truth
- Read `docs/reference/mockup.html` before changing the interface. It defines the dark/lime theme, dense controls, four-column layout, title/menu/status bars, document tabs, checkerboard preview, composer and inspector.
- Preserve its design tokens: background #191919, lime #b8ff3b, rail 44px, left dock 218px, inspector 286px, title 36px, menu 30px, footer 28px, composer 196px. Smaller-window dock widths follow the reference breakpoint.
- Reuse shared CSS tokens and Radix controls. No unrelated color palettes, oversized cards, marketing layouts, arbitrary spacing, or alternate navigation systems.
- New workspaces occupy the existing shell slots. New controls must match the reference density, borders, typography, focus and selected states.
- Verify visible changes in the running app at 1440x900 and 1100x760. Capture screenshots and inspect them. Do not claim visual verification from source inspection alone.
- Only change the established design when the user explicitly requests it.

## Architecture
- Read `tasks/plan.md` and `tasks/todo.md` before expanding features. Required roadmap includes separate LTX 2.5, LTX Ripple, Continue and ZImage modules; retain the audited Photo Edit and production-tool dependencies. Mark implementation status honestly and keep unchecked work across sessions.
- Keep the shell independent of generator implementations. Add self-contained internal TypeScript modules and explicit registry entries.
- Renderer modules never import Node, SQLite, main-process adapters, filesystem access or raw IPC.
- Main owns ComfyUI, SQLite, files, jobs and validation. Preload exposes named typed operations only.
- One canonical draft field per setting. All views use that field; do not maintain parallel inspector/composer values.
- Global characters/locations and their media are reusable; project imports/outputs use managed project storage.
- Workflow references: https://github.com/jamesk9526/Oyama-AI-Video-Studio . Reuse verified workflow knowledge, never its old UI. Record workflow provenance and constraints.
- New generator: definition/schema, UI contribution, main adapter/compiler, focused tests, registry entries. Do not add a third-party plugin loader.

## Delivery
- Keep the application runnable after every coherent change. Run typecheck, affected tests and build. Run Electron interaction checks for UI and IPC changes.
- Use Comfy MCP for server/node inspection and live workflow validation. Validate before generation; inspect queue/VRAM first. Do not interrupt unrelated jobs or resubmit uncertain jobs.
- Test real generation through the application as well as MCP; mock success is not evidence of live integration.
- For every new or changed workflow route, run a real render on the user's running ComfyUI, inspect the managed output streams and duration, and reopen it after restart before marking the route complete. A green mock test or MCP validation alone never completes a generator milestone.
- Keep `build.bat` functional. Source version starts at 2.0.0; generate UTC build metadata once per build in ignored output.
- Maintain pnpm-lock.yaml. Never commit build output, dependencies, local databases, media, credentials or logs.
- Preserve Electron context isolation, renderer sandbox, CSP, sender validation and ID-based media access.
- Do not suppress type errors, remove assertions, skip failing tests or weaken these rules to make checks pass.
- Document unfinished behavior honestly and keep future modules visibly unavailable.
