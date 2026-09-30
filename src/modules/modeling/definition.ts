import { z } from 'zod';
import type { ModuleDefinition } from '../../../shared/modules';
import type { Readiness } from '../../../shared/domain';
import graph from './graph.json';
export const modelingSchema = z.object({
  mode: z.enum(['character', 'asset']).default('asset'),
  look: z.enum(['realistic', 'animated']).default('realistic'),
  description: z.string().max(4000).default(''),
  sourceImage: z.string().uuid().nullable().default(null),
  seed: z
    .string()
    .regex(/^(Random|\d{1,10})$/)
    .default('56'),
  shapeSeed: z
    .string()
    .regex(/^\d{1,10}$/)
    .default('42'),
  textureSeed: z
    .string()
    .regex(/^\d{1,10}$/)
    .default('43'),
  shapeResolution: z.union([z.literal(1024), z.literal(1536)]).default(1536),
  remeshResolution: z.number().int().min(128).max(1024).default(768),
  smoothIterations: z.number().int().min(0).max(100).default(20),
  targetFaces: z.number().int().min(1000).max(2000000).default(700000),
  textureSize: z.union([z.literal(1024), z.literal(2048), z.literal(4096)]).default(4096),
  fov: z.number().min(1).max(170).default(20),
});
export const modelingDefaults = modelingSchema.parse({});
export type ModelingSettings = z.infer<typeof modelingSchema>;
export const modelingModels = {
  diffusion: 'pixal3d_multiview_int8_convrot.safetensors',
  vision: 'dino_v3_L_naf_fp32.safetensors',
  shape: 'trellis_2_shape_vae_bf16.safetensors',
  texture: 'trellis_2_texture_vae_bf16.safetensors',
  background: 'birefnet.safetensors',
};
export function modelingAvailability(r: Readiness | null) {
  if (!r?.connected) return { ready: false, message: 'Connect ComfyUI to generate a model.' };
  if (r.mock) return { ready: false, message: 'Pixal3D requires live ComfyUI.' };
  const missing = [...new Set(Object.values(graph).map((n) => n.class_type))].filter(
    (n) => !r.nodes.includes(n),
  );
  for (const [kind, name] of [
    ['diffusion', modelingModels.diffusion],
    ['vision', modelingModels.vision],
    ['vae', modelingModels.shape],
    ['vae', modelingModels.texture],
    ['backgroundRemoval', modelingModels.background],
  ])
    if (!r.models[kind]?.includes(name)) missing.push(name);
  return missing.length
    ? { ready: false, message: `Missing: ${missing.join(', ')}` }
    : { ready: true, message: 'Pixal3D ready · textured GLB' };
}
export const modelingDefinition: ModuleDefinition = {
  id: 'modeling',
  title: 'Modeling',
  kind: 'generator',
  description: 'Pixal3D image to textured 3D asset',
  capabilities: ['image-to-3d'],
  settingsSchema: modelingSchema,
  defaults: modelingDefaults,
  availability: modelingAvailability,
};
