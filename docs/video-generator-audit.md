# Video generator settings audit

2026-09-28. This is a source and interaction pass, not a new live rendering certification. The connected ComfyUI is running and reports two CUDA devices. Workflow graphs were not changed in this pass.

| Generator | Canonical controls exposed now | Submission check | Remaining work |
| --- | --- | --- | --- |
| H3 Video | Text, image and Ref2VA modes; canvas, duration, profile steps, seed, source frames and references, identity sizing, live preview | The selected mode and profile now require their matching diffusion model, VAEs, encoder, Turbo LoRA when chosen, and core graph nodes. Image mode requires a first frame; Ref2VA requires a reference. | Model and encoder overrides, user LoRAs, and measured quality controls are roadmap task 29. |
| LTX 2.5 | Text/image mode, Turbo/Quality, canvas, duration, seed, negative prompt, first frame, ordered MSR slots | Profile-specific model/node availability and required image inputs are checked. | Quality refinement currently uses a fixed noise seed of 42 while the exposed seed controls stage one. Specify and validate a refinement seed control against the installed graph before changing that route. Additional model/sampler controls require workflow validation. |
| LTX Ripple | Single/long mode, source/replacement, canvas, duration or chunk span, overlap/blend, LoRA and guide strengths, seed, positive/negative text | Source length, installed nodes/models, and long-chunk plan are checked. | Validate more source formats, per-chunk recovery paths, and output options with real media. |
| Continue / Extend | Last, selected or motion source; context frames/source, Native/Turbo steps, canvas, duration, seed, live preview, inherited context; single-beat dialogue guidance and source-audio carry | Source ownership and timing are checked in main. Existing adapters consume the newly surfaced continuity fields. | Measured blend frames and owner-validated replacements remain task 22. Run a real single-beat continuity check after this UI exposure. |

Each remaining workflow change must be validated against installed ComfyUI nodes, rendered through the application, inspected for streams and timing, and reopened after restart before its roadmap item is marked complete.

Verification for this pass: typecheck, 72 unit tests, production build `2.0.0+20260928.022619`, and Electron interaction checks for H3 controls, Continue single-beat settings/restart, Movie clip editing, and portrait/landscape preview fitting. The portrait check generated a temporary H.264 video and inspected both 1440×900 and 1100×760 screenshots. The generator checks used the mock backend; no new live generator output was submitted to ComfyUI.
