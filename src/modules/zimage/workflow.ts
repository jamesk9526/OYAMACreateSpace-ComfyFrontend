// Workflow recipe adapted from Oyama AI Video Studio and the Comfy-Org ZImage templates.
import {
  collectWorkflowOutputs,
  nodeChoices,
  type ComfyGraph,
  type ObjectInfo,
  type WorkflowOutput,
  type WorkflowUpload,
} from '../../../shared/modules';
import { zImageSchema } from './definition';

export const zImageTemplateVersion = 'zimage-aura/1';

function choose(names: string[], patterns: RegExp[], label: string) {
  for (const pattern of patterns) {
    const found = names.find((name) => pattern.test(name));
    if (found) return found;
  }
  throw new Error(`Missing ${label}. Install it in ComfyUI, then refresh the connection.`);
}

export function compileZImage(
  raw: unknown,
  info: ObjectInfo,
  _uploads: WorkflowUpload[],
  seed: number,
  prefix: string,
): ComfyGraph {
  const settings = zImageSchema.parse(raw);
  if (!settings.prompt.trim()) throw new Error('Describe the image before generating.');
  const diffusionNames = nodeChoices(info, 'UNETLoader', 'unet_name');
  const model = choose(
    diffusionNames,
    settings.variant === 'turbo'
      ? [/^z_image_turbo_bf16\.safetensors$/i, /z[_ -]?image.*turbo.*\.safetensors$/i]
      : [/^z_image_bf16\.safetensors$/i, /z[_ -]?image(?!.*turbo).*\.safetensors$/i],
    `ZImage ${settings.variant === 'turbo' ? 'Turbo' : 'Base'} diffusion model`,
  );
  const encoder = choose(
    nodeChoices(info, 'CLIPLoader', 'clip_name'),
    [/^qwen_3_4b\.safetensors$/i, /qwen[_ -]?3[_ -]?4b.*\.safetensors$/i],
    'ZImage Qwen 3 4B text encoder',
  );
  const vae = choose(
    nodeChoices(info, 'VAELoader', 'vae_name'),
    [/(^|\/)ae\.safetensors$/i],
    'ZImage ae VAE',
  );
  const graph: ComfyGraph = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: model, weight_dtype: 'default' } },
    '2': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: encoder, type: 'lumina2', device: 'default' },
    },
    '3': { class_type: 'VAELoader', inputs: { vae_name: vae } },
    '4': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: settings.prompt } },
    '5':
      settings.variant === 'base'
        ? {
            class_type: 'CLIPTextEncode',
            inputs: { clip: ['2', 0], text: settings.negative },
          }
        : { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['4', 0] } },
    '6': {
      class_type: 'EmptySD3LatentImage',
      inputs: { width: settings.width, height: settings.height, batch_size: 1 },
    },
    '7': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['1', 0], shift: 3 } },
    '8': {
      class_type: 'KSampler',
      inputs: {
        model: ['7', 0],
        positive: ['4', 0],
        negative: ['5', 0],
        latent_image: ['6', 0],
        seed,
        steps: settings.steps,
        cfg: settings.cfg,
        sampler_name: 'res_multistep',
        scheduler: 'simple',
        denoise: 1,
      },
    },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['3', 0] } },
    '10': { class_type: 'SaveImage', inputs: { images: ['9', 0], filename_prefix: prefix } },
    '11': { class_type: 'PreviewImage', inputs: { images: ['9', 0] } },
  };
  const missing = [...new Set(Object.values(graph).map((node) => node.class_type))].filter(
    (name) => !info[name],
  );
  if (missing.length) throw new Error(`Missing ComfyUI nodes: ${missing.join(', ')}`);
  return graph;
}

export function zImageOutputs(outputs: Record<string, unknown>): WorkflowOutput[] {
  return collectWorkflowOutputs(outputs, ['10'], 'image');
}
