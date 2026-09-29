// Adapted from Studio src/lib/fireRedEditWorkflow.ts and official FireRed 1.1 recipe.
import {
  collectWorkflowOutputs,
  nodeChoices,
  type ComfyGraph,
  type ObjectInfo,
  type WorkflowOutput,
  type WorkflowUpload,
} from '../../../shared/modules';
import { photoEditSchema } from './definition';

export const photoEditTemplateVersion = 'firered-image-edit/1';
export function selectFireRed(info: ObjectInfo) {
  const rank = (names: string[]) =>
    names
      .filter((name) => /firered[-_ ]image[-_ ]edit/i.test(name))
      .sort(
        (a, b) =>
          Number(/q4_k_m/i.test(b)) - Number(/q4_k_m/i.test(a)) ||
          Number(/1\.1/.test(b)) - Number(/1\.1/.test(a)),
      )[0];
  const gguf = rank(nodeChoices(info, 'UnetLoaderGGUF', 'unet_name'));
  const model = gguf || rank(nodeChoices(info, 'UNETLoader', 'unet_name'));
  const encoder = nodeChoices(info, 'CLIPLoader', 'clip_name').find((name) =>
    /qwen[-_ ]?2[._]?5[-_ ]?vl[-_ ]?7b/i.test(name),
  );
  const vae = nodeChoices(info, 'VAELoader', 'vae_name').find((name) =>
    /(?:^|[\\/])qwen_image_vae\.safetensors$/i.test(name),
  );
  const lora = nodeChoices(info, 'LoraLoaderModelOnly', 'lora_name')
    .filter((name) => /firered[-_ ]image[-_ ]edit.*lightning[-_ ]8steps/i.test(name))
    .sort(
      (a, b) =>
        Number(/image[-_ ]edit[-_ ]1\.1[-_ ]lightning/i.test(b)) -
          Number(/image[-_ ]edit[-_ ]1\.1[-_ ]lightning/i.test(a)) ||
        Number(/v1\.2/i.test(b)) - Number(/v1\.2/i.test(a)) ||
        Number(/v1\.1/i.test(b)) - Number(/v1\.1/i.test(a)),
    )[0];
  if (!model || !encoder || !vae)
    throw new Error('Missing FireRed model, Qwen 2.5 VL 7B encoder or Qwen image VAE.');
  return { model, loader: gguf ? 'UnetLoaderGGUF' : 'UNETLoader', encoder, vae, lora };
}

export function compilePhotoEdit(
  raw: Record<string, unknown>,
  info: ObjectInfo,
  uploads: WorkflowUpload[],
  seed: number,
  prefix: string,
): ComfyGraph {
  const s = photoEditSchema.parse(raw);
  if (!s.prompt.trim() || !s.sourceImage)
    throw new Error('Choose a source image and describe the edit.');
  const source = uploads.find((upload) => upload.id === s.sourceImage && upload.kind === 'image');
  if (!source) throw new Error('Photo Edit source upload is missing.');
  const selected = selectFireRed(info);
  const turbo = s.profile === 'turbo';
  if (turbo && !selected.lora) throw new Error('Turbo requires a FireRed 8-step Lightning LoRA.');
  const graph: ComfyGraph = {
    '1': {
      class_type: selected.loader,
      inputs:
        selected.loader === 'UnetLoaderGGUF'
          ? { unet_name: selected.model }
          : { unet_name: selected.model, weight_dtype: 'default' },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: selected.encoder, type: 'qwen_image', device: 'default' },
    },
    '3': { class_type: 'VAELoader', inputs: { vae_name: selected.vae } },
    '4': { class_type: 'LoadImage', inputs: { image: source.name } },
    '5': {
      class_type: 'ImageScale',
      inputs: {
        image: ['4', 0],
        upscale_method: 'lanczos',
        width: s.width,
        height: s.height,
        crop: 'center',
      },
    },
    '6': { class_type: 'VAEEncode', inputs: { pixels: ['5', 0], vae: ['3', 0] } },
    '7': {
      class_type: 'TextEncodeQwenImageEditPlus',
      inputs: { clip: ['2', 0], vae: ['3', 0], image1: ['5', 0], prompt: s.prompt.trim() },
    },
    '8': {
      class_type: 'TextEncodeQwenImageEditPlus',
      inputs: { clip: ['2', 0], vae: ['3', 0], image1: ['5', 0], prompt: '' },
    },
    '9': {
      class_type: 'ModelSamplingAuraFlow',
      inputs: { model: turbo ? ['13', 0] : ['1', 0], shift: 3.1 },
    },
    '10': { class_type: 'CFGNorm', inputs: { model: ['9', 0], strength: 1 } },
    '11': {
      class_type: 'KSampler',
      inputs: {
        model: ['10', 0],
        positive: ['7', 0],
        negative: ['8', 0],
        latent_image: ['6', 0],
        seed,
        steps: turbo ? 8 : 40,
        cfg: turbo ? 1 : 4,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1,
      },
    },
    '12': { class_type: 'VAEDecode', inputs: { samples: ['11', 0], vae: ['3', 0] } },
    '14': { class_type: 'SaveImage', inputs: { images: ['12', 0], filename_prefix: prefix } },
  };
  if (turbo)
    graph['13'] = {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: ['1', 0], lora_name: selected.lora, strength_model: 1 },
    };
  s.references.forEach((id, index) => {
    const reference = uploads.find((upload) => upload.id === id && upload.kind === 'image');
    if (!reference) throw new Error('Photo Edit reference upload is missing.');
    const node = String(15 + index);
    graph[node] = { class_type: 'LoadImage', inputs: { image: reference.name } };
    graph['7'].inputs[`image${index + 2}`] = [node, 0];
    graph['8'].inputs[`image${index + 2}`] = [node, 0];
  });
  const missing = [...new Set(Object.values(graph).map((node) => node.class_type))].filter(
    (name) => !info[name],
  );
  if (missing.length) throw new Error(`Missing ComfyUI nodes: ${missing.join(', ')}`);
  return graph;
}

export function photoEditOutputs(outputs: Record<string, unknown>): WorkflowOutput[] {
  return collectWorkflowOutputs(outputs, ['14'], 'image');
}
