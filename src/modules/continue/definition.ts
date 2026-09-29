import { resolutionFields } from '../../../shared/resolution';
import { z } from 'zod';
import type { Asset, Readiness } from '../../../shared/domain';
import { rippleSourceDuration } from '../ripple/definition';
import type { ModuleAvailability, ModuleDefinition } from '../../../shared/modules';

export const continueSchema = z.object({
  dialoguePolicy: z.enum(['inherit', 'none', 'allow']).default('inherit'),
  audioCarry: z.boolean().default(true),
  blendFrames: z.number().int().min(0).max(24).default(0),
  livePreview: z.boolean().default(true),
  method: z.enum(['last', 'selected', 'motion']).default('last'),
  contextFrames: z.union([z.literal(5), z.literal(22), z.literal(39)]).default(22),
  contextMode: z.enum(['auto', 'frames', 'latent']).default('auto'),
  selectedSeconds: z.number().finite().nonnegative().max(300).default(0),
  prompt: z.string().max(10000).default(''),
  sourceVideo: z.string().uuid().nullable().default(null),
  firstFrame: z.string().uuid().nullable().default(null),
  inheritContext: z.boolean().default(true),
  quality: z.enum(['native', 'turbo8']).default('turbo8'),
  steps: z.number().int().min(1).max(100).default(30),
  nativeDefaults: z.boolean().default(true),
  ...resolutionFields,
  width: z.number().int().min(256).max(2048).multipleOf(32).default(832),
  height: z.number().int().min(256).max(2048).multipleOf(32).default(480),
  duration: z.number().min(1).max(15).multipleOf(0.5).default(4),
  seed: z
    .string()
    .regex(/^(Random|\d{1,10})$/)
    .default('Random'),
});
export type ContinueSettings = z.infer<typeof continueSchema>;
export const continueDefaults = continueSchema.parse({});
export function canReuseContext(settings: ContinueSettings, source?: Asset) {
  const context = source?.generationContext;
  return Boolean(
    context?.available &&
    context.format === 'h3-av/1' &&
    context.width === settings.width &&
    context.height === settings.height &&
    context.frames >= settings.contextFrames,
  );
}
export function continueSourceRange(settings: ContinueSettings, source: Asset) {
  const duration = rippleSourceDuration(source);
  const fps = source.media?.video?.fps;
  if (!fps || !duration || duration > 300)
    throw new Error('Choose a video under five minutes with usable frames.');
  const lastTime = Math.max(0, duration - 1 / fps);
  if (settings.method === 'selected' && settings.selectedSeconds > lastTime + 0.000001)
    throw new Error('Selected frame is outside the source video. Choose an earlier frame.');
  const frameTime =
    settings.method !== 'selected'
      ? lastTime
      : Math.floor(settings.selectedSeconds * fps + 0.000001) / fps;
  const retainedSourceFrames =
    settings.method !== 'selected'
      ? Math.round(duration * 24)
      : Math.min(Math.round(duration * 24), Math.max(1, Math.round((frameTime + 1 / fps) * 24)));
  return { frameTime, retainedSourceFrames, retainedDuration: retainedSourceFrames / 24 };
}
// Studio continuationTiming selects the nearest supported length, preserving generated head frames.
export function continueTiming(
  seconds: number,
  method: ContinueSettings['method'] = 'last',
  contextFrames = 22,
) {
  if (method === 'motion') {
    const frames = Math.max(17, Math.round((seconds * 24) / 17) * 17);
    return { frames, duration: frames / 24, trimFrames: contextFrames };
  }
  const frames = Math.max(22, 5 + Math.round((Math.round(seconds * 24) - 5) / 17) * 17);
  return { frames, duration: frames / 24, trimFrames: 0 };
}
export function continueAvailability(
  readiness: Readiness | null,
  quality: ContinueSettings['quality'] = 'turbo8',
  method: ContinueSettings['method'] = 'last',
): ModuleAvailability {
  if (!readiness?.connected)
    return { ready: false, message: readiness?.message || 'Connect ComfyUI' };
  if (readiness.mock) return { ready: true, message: 'Mock Continue ready' };
  const missing = [
    !readiness.models.diffusion?.some((name) => /minimax_h3_fl2va.*\.safetensors$/i.test(name)) &&
      'H3 FL2VA diffusion model',
    !readiness.models.encoder?.some((name) => /qwen3vl_32b_minimax_h3/i.test(name)) &&
      'H3 text encoder',
    !readiness.models.vae?.some((name) => /minimax_h3_video_vae/i.test(name)) && 'H3 video VAE',
    !readiness.models.vae?.some((name) => /minimax_h3_audio_vae/i.test(name)) && 'H3 audio VAE',
    quality === 'turbo8' &&
      !readiness.models.lora?.some((name) => /minimax_h3_fl2v_turbo_8step/i.test(name)) &&
      'H3 FL2V Turbo 8 LoRA',
    ...['MiniMaxH3ImageToVideo', 'VAEDecodeAudio', 'BasicGuider', 'SaveVideo'].map(
      (node) => !readiness.nodes.includes(node) && node,
    ),
    ...(method === 'motion'
      ? ['MiniMaxH3VideoExtender', 'MiniMaxH3LoopTrim', 'LoadVideo', 'GetVideoComponents'].map(
          (node) => !readiness.nodes.includes(node) && node,
        )
      : []),
  ].filter(Boolean);
  return missing.length
    ? { ready: false, message: `Missing ${missing.join(', ')}` }
    : { ready: true, message: 'H3 continuation ready' };
}
export const continueDefinition: ModuleDefinition = {
  id: 'continue',
  title: 'Continue / Extend',
  kind: 'generator',
  badge: 'VIDEO',
  description:
    'Continue a managed video from its last or selected frame and save the joined sequence',
  capabilities: [
    'last-frame-continuation',
    'selected-frame-continuation',
    'motion-context-continuation',
    'source-context',
    'joined-video',
  ],
  settingsSchema: continueSchema,
  defaults: continueDefaults,
  availability: (readiness) => continueAvailability(readiness),
};
