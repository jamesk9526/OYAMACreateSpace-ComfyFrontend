import { resolutionFields } from '../../../shared/resolution';
import { z } from 'zod';
import type { Readiness } from '../../../shared/domain';
import type { ModuleAvailability, ModuleDefinition } from '../../../shared/modules';

export const ltxNegative = 'pc game, console game, video game, cartoon, childish, ugly';

export const ltxSchema = z
  .object({
    mode: z.enum(['text', 'image', 'turnaround']).default('text'),
    orbitDirection: z.enum(['clockwise', 'counterclockwise']).default('clockwise'),
    profile: z.enum(['turbo', 'quality']).default('turbo'),
    prompt: z.string().max(20000).default(''),
    negative: z.string().max(10000).default(ltxNegative),
    ...resolutionFields,
    width: z.number().int().min(256).max(2048).multipleOf(64).default(768),
    height: z.number().int().min(256).max(2048).multipleOf(64).default(512),
    duration: z.number().int().min(1).max(15).default(4),
    seed: z
      .string()
      .regex(/^(Random|\d{1,10})$/)
      .default('Random'),
    firstFrame: z.string().uuid().nullable().default(null),
    msr: z
      .object({
        enabled: z.boolean().default(false),
        pic1: z.string().uuid().nullable().default(null),
        pic2: z.string().uuid().nullable().default(null),
        pic3: z.string().uuid().nullable().default(null),
        pic4: z.string().uuid().nullable().default(null),
        background: z.string().uuid().nullable().default(null),
      })
      .default({
        enabled: false,
        pic1: null,
        pic2: null,
        pic3: null,
        pic4: null,
        background: null,
      }),
  })
  .superRefine((value, context) => {
    if (value.mode !== 'text' && !value.firstFrame)
      context.addIssue({
        code: 'custom',
        path: ['firstFrame'],
        message: 'Choose an image first frame.',
      });
    if (value.msr.enabled && !value.msr.pic1)
      context.addIssue({
        code: 'custom',
        path: ['msr', 'pic1'],
        message: 'Choose the first MSR reference.',
      });
  });

export type LtxSettings = z.infer<typeof ltxSchema>;
export const ltxDefaults: LtxSettings = { ...ltxSchema.parse({}), firstFrame: null };

export function ltxAvailability(
  readiness: Readiness | null,
  profile: LtxSettings['profile'],
  useMsr = false,
): ModuleAvailability {
  if (!readiness?.connected)
    return { ready: false, message: readiness?.message || 'Connect ComfyUI' };
  if (readiness.mock) return { ready: true, message: `Mock LTX ${profile} ready` };
  const missing = [
    !readiness.models.diffusion?.some((name) => /ltx-2\.5.*distilled.*transformer/i.test(name)) &&
      'LTX 2.5 distilled diffusion model',
    !readiness.models.encoder?.some((name) => /gemma.*ltx-2\.5/i.test(name)) &&
      'LTX 2.5 Gemma encoder',
    !readiness.models.vae?.some((name) => /ltx-2\.5-video-vae/i.test(name)) && 'LTX video VAE',
    !readiness.models.vae?.some((name) => /ltx-2\.5-audio-vae/i.test(name)) && 'LTX audio VAE',
    profile === 'quality' &&
      !readiness.models.upscaler?.some((name) => /ltx-2\.5.*latent.*upscaler/i.test(name)) &&
      'LTX latent x2 upscaler',
    ...[
      'LTXVConditioning',
      'LTXVDualCFGGuider',
      'LTXVConcatAVLatent',
      'LTXVAudioVAEDecode',
      'SaveVideo',
    ].map((node) => !readiness.nodes.includes(node) && node),
    useMsr && !readiness.nodes.includes('ComfyUILTX25MSRICLoRALoader') && 'LTX MSR LoRA loader',
    useMsr && !readiness.nodes.includes('ComfyUILTX25MSRMultiReferenceGuide') && 'LTX MSR guide',
    useMsr && !readiness.nodes.includes('LTXVCropGuides') && 'LTX guide crop node',
    useMsr &&
      !readiness.models.msrLora?.some((name) => /LTX-2\.5-Licon-MSR/i.test(name)) &&
      'LTX 2.5 Licon MSR LoRA',
  ].filter(Boolean);
  return missing.length
    ? { ready: false, message: `Missing ${missing.join(', ')}` }
    : { ready: true, message: `LTX ${profile} ready` };
}

export const ltxDefinition: ModuleDefinition = {
  id: 'ltx',
  title: 'LTX 2.5 Video',
  kind: 'generator',
  badge: 'VIDEO',
  description: 'LTX 2.5 synchronized video and audio generation',
  capabilities: [
    'text-to-video',
    'image-to-video',
    'audio-output',
    'two-stage-quality',
    'first-frame-handoff',
    'motionless-turnaround',
  ],
  settingsSchema: ltxSchema,
  defaults: ltxDefaults,
  availability: (readiness) => ltxAvailability(readiness, 'turbo'),
};
