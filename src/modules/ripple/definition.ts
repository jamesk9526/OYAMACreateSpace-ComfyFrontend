import { resolutionFields } from '../../../shared/resolution';
import { z } from 'zod';
import type { Readiness } from '../../../shared/domain';
import type { ModuleAvailability, ModuleDefinition } from '../../../shared/modules';
import type { Asset } from '../../../shared/domain';

export const rippleRequiredNodes = [
  'UNETLoader',
  'CLIPLoader',
  'VAELoader',
  'LoraLoaderModelOnly',
  'LoadVideo',
  'GetVideoComponents',
  'LoadImage',
  'ImageScale',
  'ImageBatch',
  'ImageFromBatch',
  'CLIPTextEncode',
  'LTXVConditioning',
  'EmptyLTXVLatentVideo',
  'LTXAddVideoICLoRAGuide',
  'LTXVEmptyLatentAudio',
  'LTXVConcatAVLatent',
  'RandomNoise',
  'CFGGuider',
  'KSamplerSelect',
  'BasicScheduler',
  'SamplerCustomAdvanced',
  'LTXVSeparateAVLatent',
  'LTXVCropGuides',
  'VAEDecode',
  'CreateVideo',
  'SaveVideo',
];

export function rippleSourceDuration(asset: Asset | undefined): number {
  const media = asset?.media;
  if (!media?.video) return 0;
  return (
    media.video.duration ??
    (media.video.frames && media.video.fps ? media.video.frames / media.video.fps : media.duration)
  );
}

export const rippleDefaultPrompt =
  'Use the reference video for motion, timing, camera movement, composition, and unchanged scene content, while consistently propagating the visual edit established in the first frame throughout the video.';

export const rippleSchema = z.object({
  mode: z.enum(['single', 'long']).default('single'),
  sourceInFrame: z.number().int().min(0).max(7200).default(0),
  longDuration: z.number().finite().min(2).max(300).default(30),
  chunkSeconds: z.number().int().min(2).max(20).default(5),
  overlapSeconds: z.number().finite().min(0).max(2).multipleOf(0.25).default(0.5),
  blendOverlap: z.boolean().default(true),
  // Main-owned batch preparation: UI does not author these fields.
  chunkStartFrame: z.number().int().min(0).max(7200).optional(),
  chunkSourceFrames: z.number().int().min(48).max(480).multipleOf(8).optional(),
  prompt: z.string().max(20000).default(rippleDefaultPrompt),
  negative: z.string().max(10000).default(''),
  sourceVideo: z.string().uuid().nullable().default(null),
  replacementFrame: z.string().uuid().nullable().default(null),
  ...resolutionFields,
  width: z.number().int().min(256).max(2048).multipleOf(32).default(768),
  height: z.number().int().min(256).max(2048).multipleOf(32).default(512),
  duration: z.number().int().min(2).max(20).default(5),
  strength: z.number().min(0.5).max(2).default(1.35),
  guideStrength: z.number().min(0).max(1).default(1),
  seed: z
    .string()
    .regex(/^(Random|\d{1,10})$/)
    .default('Random'),
});

export type RippleSettings = z.infer<typeof rippleSchema>;
export const rippleDefaults: RippleSettings = rippleSchema.parse({});

export function rippleAvailability(readiness: Readiness | null): ModuleAvailability {
  if (!readiness?.connected)
    return { ready: false, message: readiness?.message || 'Connect ComfyUI' };
  if (readiness.mock) return { ready: true, message: 'Mock Ripple ready' };
  const missing = [
    !readiness.models.diffusion?.some((name) => /ltx-2\.5.*distilled.*transformer/i.test(name)) &&
      'LTX 2.5 distilled diffusion model',
    !readiness.models.encoder?.some((name) => /gemma.*ltx-2\.5/i.test(name)) &&
      'LTX 2.5 Gemma encoder',
    !readiness.models.vae?.some((name) => /ltx-2\.5-video-vae/i.test(name)) && 'LTX video VAE',
    !readiness.models.vae?.some((name) => /ltx-2\.5-audio-vae/i.test(name)) && 'LTX audio VAE',
    !readiness.models.lora?.some((name) => /LTX25_Ripple_v11/i.test(name)) && 'LTX Ripple v11 LoRA',
    ...rippleRequiredNodes.map((node) => !readiness.nodes.includes(node) && node),
  ].filter(Boolean);
  return missing.length
    ? { ready: false, message: `Missing ${missing.join(', ')}` }
    : { ready: true, message: 'LTX Ripple ready' };
}

export const rippleDefinition: ModuleDefinition = {
  id: 'ripple',
  title: 'LTX Ripple',
  kind: 'generator',
  badge: 'VIDEO',
  description: 'Propagate a changed first frame through source video while retaining source audio',
  capabilities: ['video-edit', 'first-frame-guide', 'source-audio'],
  settingsSchema: rippleSchema,
  defaults: rippleDefaults,
  availability: rippleAvailability,
};
