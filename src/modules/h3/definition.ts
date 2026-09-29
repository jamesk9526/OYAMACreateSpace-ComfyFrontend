import { resolutionFields } from '../../../shared/resolution';
import { z } from 'zod';
import type { Readiness } from '../../../shared/domain';
import type { ModuleAvailability, ModuleDefinition } from '../../../shared/modules';
export const h3Schema = z.object({
  livePreview: z.boolean().default(true),
  mode: z.enum(['text', 'image', 'reference']).default('text'),
  // Legacy drafts did not distinguish an explicit mode choice from retained attachments.
  modeExplicit: z.boolean().default(false),
  refImageSize: z.enum(['match', 'max']).default('match'),
  prompt: z.string().max(20000).default(''),
  negative: z.string().max(10000).default(''),
  ...resolutionFields,
  width: z.number().int().min(256).max(4096).multipleOf(32).default(832),
  height: z.number().int().min(256).max(4096).multipleOf(32).default(480),
  duration: z.number().min(1).max(15).default(6),
  fps: z.literal(24).default(24),
  quality: z.enum(['native', 'turbo8']).default('native'),
  steps: z.number().int().min(1).max(100).default(30),
  nativeDefaults: z.boolean().default(true),
  seed: z
    .string()
    .regex(/^(Random|\d{1,10})$/)
    .default('Random'),
  references: z.array(z.string().uuid()).max(16).default([]),
  firstFrame: z.string().uuid().nullable().default(null),
  lastFrame: z.string().uuid().nullable().default(null),
  characterIds: z.array(z.string().uuid()).max(16).default([]),
  locationIds: z.array(z.string().uuid()).max(16).default([]),
  style: z.string().max(4000).default(''),
});
export type H3Settings = z.infer<typeof h3Schema>;
export const h3Defaults = h3Schema.parse({});
export function h3Availability(
  readiness: Readiness | null,
  mode: H3Settings['mode'],
  quality: H3Settings['quality'],
): ModuleAvailability {
  if (!readiness?.connected)
    return { ready: false, message: readiness?.message || 'Connect ComfyUI' };
  if (readiness.mock) return { ready: true, message: 'Mock H3 ready' };
  const family = mode === 'reference' ? 'ref2va' : 'fl2va';
  const loraFamily = mode === 'reference' ? 'ref2v' : 'fl2v';
  const missing = [
    !readiness.models.diffusion?.some((name) =>
      name.toLowerCase().includes(`minimax_h3_${family}`),
    ) && `H3 ${family} diffusion model`,
    !readiness.models.encoder?.some((name) => /qwen3vl_32b_minimax_h3/i.test(name)) &&
      'H3 text encoder',
    !readiness.models.vae?.some((name) => /minimax_h3_video_vae/i.test(name)) && 'H3 video VAE',
    !readiness.models.vae?.some((name) => /minimax_h3_audio_vae/i.test(name)) && 'H3 audio VAE',
    quality === 'turbo8' &&
      !readiness.models.lora?.some((name) =>
        name.toLowerCase().includes(`minimax_h3_${loraFamily}_turbo_8step`),
      ) &&
      `H3 ${loraFamily} Turbo 8 LoRA`,
    ...[
      mode === 'reference' ? 'MiniMaxH3ReferenceToVideo' : 'MiniMaxH3ImageToVideo',
      'UNETLoader',
      'CLIPLoader',
      'VAELoader',
      'RandomNoise',
      'KSamplerSelect',
      'BasicScheduler',
      'VAEDecode',
      'VAEDecodeAudio',
      'BasicGuider',
      'SamplerCustomAdvanced',
      'CreateVideo',
      'SaveVideo',
    ].map((node) => !readiness.nodes.includes(node) && node),
  ].filter(Boolean);
  return missing.length
    ? { ready: false, message: `Missing ${missing.join(', ')}` }
    : { ready: true, message: `H3 ${mode} video ready` };
}
export const h3Definition: ModuleDefinition = {
  id: 'h3',
  title: 'H3 Video',
  kind: 'generator',
  badge: 'H3',
  description: 'MiniMax H3 video with synchronized audio',
  capabilities: ['text-to-video', 'image-to-video', 'reference-to-video'],
  settingsSchema: h3Schema,
  defaults: h3Defaults,
  availability: (readiness) => h3Availability(readiness, 'text', 'native'),
};
