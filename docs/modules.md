# Adding an internal module

1. Add a module directory under `src/modules/`. Define a stable ID, a Zod schema, defaults, capabilities and a ModuleDefinition. Keep these files free of Node and React side effects.
2. Build Workspace, Composer and Inspector contributions as needed, using the existing shell slots, tokens and shared UI controls. Register them in the renderer registry.
3. For generation, add a pure compiler producing ComfyGraph and a GeneratorAdapter registration in the main registry. Resolve references from canonical record IDs, validate before upload, and identify outputs by the declared save nodes.
4. Keep module values in a draft keyed by project/module. Read and update those values from every view; do not create duplicate settings stores.
5. Add compiler tests, mock interaction coverage and one live integration check. Confirm switching modules preserves drafts and no Node imports enter the renderer bundle.

Main adapters may implement `prepare(draft, store)` for managed inputs and `finalize(job, rawAssets, store)` for derived output assembly. Continue demonstrates both in its main-only `adapter.ts`; its renderer registry imports only definition/UI. Resolve receives completed jobs for immutable source-context snapshots. The bridge checkpoints downloaded `rawAssetIds` before finalization and reuses them after restart, retaining the same prompt ID. Finalization must recognize already-saved derived outputs by job ID and avoid duplicate assembly.

Media playback uses ID-based protocol responses with single byte-range support; filesystem paths never enter renderer commands. Keep malformed/multiple/out-of-bounds ranges covered alongside real seeking tests.

The first version intentionally uses static registrations. The Add Module dialog reports bundled module availability.
