import { resolutionFields } from '../../../shared/resolution';
import { z } from 'zod';
import type { Readiness } from '../../../shared/domain';
import type { ModuleAvailability, ModuleDefinition } from '../../../shared/modules';

export const photoEditNodes = [
  'CLIPLoader',
  'VAELoader',
  'LoadImage',
  'ImageScale',
  'VAEEncode',
  'TextEncodeQwenImageEditPlus',
  'ModelSamplingAuraFlow',
  'CFGNorm',
  'KSampler',
  'VAEDecode',
  'SaveImage',
];
export const photoEditSchema = z.object({
  prompt: z.string().max(20000).default(''),
  profile: z.enum(['turbo', 'quality']).default('turbo'),
  sourceImage: z.string().uuid().nullable().default(null),
  references: z.array(z.string().uuid()).max(2).default([]),
  ...resolutionFields,
  width: z.number().int().min(256).max(2048).multipleOf(32).default(768),
  height: z.number().int().min(256).max(2048).multipleOf(32).default(512),
  seed: z
    .string()
    .regex(/^(Random|\d{1,10})$/)
    .default('Random'),
});
export type PhotoEditSettings = z.infer<typeof photoEditSchema>;
export const photoEditDefaults = photoEditSchema.parse({});

export function photoEditAvailability(
  readiness: Readiness | null,
  profile: PhotoEditSettings['profile'] = 'turbo',
): ModuleAvailability {
  if (!readiness?.connected)
    return { ready: false, message: readiness?.message || 'Connect ComfyUI' };
  if (readiness.mock) return { ready: true, message: 'Mock Photo Edit ready' };
  const hasGguf = readiness.models.gguf?.some((name) => /firered[-_ ]image[-_ ]edit/i.test(name));
  const missing = [
    !hasGguf &&
      !readiness.models.diffusion?.some((name) => /firered[-_ ]image[-_ ]edit/i.test(name)) &&
      'FireRed Image Edit model',
    !readiness.models.encoder?.some((name) => /qwen[-_ ]?2[._]?5[-_ ]?vl[-_ ]?7b/i.test(name)) &&
      'Qwen 2.5 VL 7B encoder',
    !readiness.models.vae?.some((name) => /(?:^|[\\/])qwen_image_vae\.safetensors$/i.test(name)) &&
      'Qwen image VAE',
    ...photoEditNodes.map((node) => !readiness.nodes.includes(node) && node),
    !readiness.nodes.includes(hasGguf ? 'UnetLoaderGGUF' : 'UNETLoader') && 'FireRed model loader',
    profile === 'turbo' &&
      !readiness.models.lora?.some((name) =>
        /firered[-_ ]image[-_ ]edit.*lightning[-_ ]8steps/i.test(name),
      ) &&
      'FireRed 8-step Lightning LoRA',
    profile === 'turbo' && !readiness.nodes.includes('LoraLoaderModelOnly') && 'LoRA loader',
  ].filter(Boolean);
  return missing.length
    ? { ready: false, message: `Missing ${missing.join(', ')}` }
    : { ready: true, message: `FireRed ${profile} ready` };
}

export const photoEditDefinition: ModuleDefinition = {
  id: 'photo-edit',
  title: 'Photo Edit',
  kind: 'generator',
  badge: 'IMAGE',
  description: 'FireRed instruction-based image editing and Ripple frame handoff',
  capabilities: ['image-edit', 'reference-images', 'ripple-handoff'],
  settingsSchema: photoEditSchema,
  defaults: photoEditDefaults,
  availability: (readiness) => photoEditAvailability(readiness),
};
