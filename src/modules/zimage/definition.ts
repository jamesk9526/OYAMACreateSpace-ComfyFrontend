import { resolutionFields } from '../../../shared/resolution';
import { z } from 'zod';
import type { ModuleDefinition, ModuleAvailability } from '../../../shared/modules';
import type { Readiness } from '../../../shared/domain';

export const zImageNegative =
  'low quality, low resolution, blurry, out of focus, jpeg artifacts, compression artifacts, color banding, posterization, oversharpened, overprocessed, distorted anatomy, malformed hands, extra fingers, missing fingers, fused fingers, extra limbs, duplicate subjects, warped geometry, inconsistent perspective, text, watermark, logo, signature';

export const zImageSchema = z
  .object({
    variant: z.enum(['turbo', 'base']).default('turbo'),
    prompt: z.string().max(20000).default(''),
    negative: z.string().max(10000).default(zImageNegative),
    ...resolutionFields,
    width: z.number().int().min(256).max(2048).multipleOf(32).default(1344),
    height: z.number().int().min(256).max(2048).multipleOf(32).default(768),
    steps: z.number().int().min(4).max(50).default(8),
    cfg: z.number().min(1).max(5).default(1),
    seed: z
      .string()
      .regex(/^(Random|\d{1,10})$/)
      .default('Random'),
  })
  .superRefine((value, context) => {
    const stepRange = value.variant === 'turbo' ? [4, 20] : [28, 50];
    const cfgRange = value.variant === 'turbo' ? [1, 3] : [3, 5];
    if (value.steps < stepRange[0] || value.steps > stepRange[1])
      context.addIssue({
        code: 'custom',
        path: ['steps'],
        message: `${value.variant === 'turbo' ? 'Turbo' : 'Base'} steps must be ${stepRange[0]}–${stepRange[1]}`,
      });
    if (value.cfg < cfgRange[0] || value.cfg > cfgRange[1])
      context.addIssue({
        code: 'custom',
        path: ['cfg'],
        message: `${value.variant === 'turbo' ? 'Turbo' : 'Base'} guidance must be ${cfgRange[0]}–${cfgRange[1]}`,
      });
  });

export type ZImageSettings = z.infer<typeof zImageSchema>;
export const zImageDefaults = zImageSchema.parse({});

export function zImageAvailability(
  readiness: Readiness | null,
  variant: ZImageSettings['variant'] = 'turbo',
): ModuleAvailability {
  if (!readiness?.connected)
    return { ready: false, message: readiness?.message || 'Connect ComfyUI' };
  if (readiness.mock) return { ready: true, message: `Mock ZImage ${variant} ready` };
  const expected = variant === 'turbo' ? /z[_ -]?image.*turbo/i : /z[_ -]?image(?!.*turbo)/i;
  const missing = [
    !readiness.models.diffusion?.some((name) => expected.test(name)) &&
      `${variant === 'turbo' ? 'ZImage Turbo' : 'ZImage Base'} diffusion model`,
    !readiness.models.encoder?.some((name) => /qwen[_ -]?3[_ -]?4b/i.test(name)) &&
      'Qwen 3 4B encoder',
    !readiness.models.vae?.some((name) => /(^|\/)ae\.safetensors$/i.test(name)) && 'ae VAE',
  ].filter(Boolean);
  return missing.length
    ? { ready: false, message: `Missing ${missing.join(', ')}` }
    : { ready: true, message: `ZImage ${variant === 'turbo' ? 'Turbo' : 'Base'} ready` };
}

export const zImageDefinition: ModuleDefinition = {
  id: 'zimage',
  title: 'ZImage',
  kind: 'generator',
  badge: 'IMAGE',
  description: 'ZImage Turbo and Base still-image generation',
  capabilities: ['text-to-image', 'first-frame-handoff'],
  settingsSchema: zImageSchema,
  defaults: zImageDefaults,
  availability: (readiness) => zImageAvailability(readiness),
};
