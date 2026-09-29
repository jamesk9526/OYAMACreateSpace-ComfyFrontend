// Adapted from Oyama AI Video Studio src/lib/ltxRippleWorkflow.ts, single-pass v11.
import {
  collectWorkflowOutputs,
  nodeChoices,
  type ComfyGraph,
  type ObjectInfo,
  type WorkflowOutput,
  type WorkflowUpload,
} from '../../../shared/modules';
import { rippleSchema } from './definition';

export const rippleTemplateVersion = 'ltx-ripple-v11/1';
export const rippleFrames = (seconds: number) => Math.ceil((seconds * 24 - 1) / 8) * 8 + 1;

function choose(names: string[], pattern: RegExp, label: string) {
  const found = names.find((name) => pattern.test(name));
  if (!found) throw new Error(`Missing ${label}. Install it in ComfyUI, then refresh connection.`);
  return found;
}

export function compileRipple(
  raw: Record<string, unknown>,
  info: ObjectInfo,
  uploads: WorkflowUpload[],
  seed: number,
  prefix: string,
): ComfyGraph {
  const s = rippleSchema.parse(raw);
  const frames =
    s.chunkSourceFrames === undefined ? rippleFrames(s.duration) : s.chunkSourceFrames + 1;
  if (!s.sourceVideo || !s.replacementFrame)
    throw new Error('Choose a source video and an edited first frame.');
  if (
    !Number.isFinite(raw.sourceDuration) ||
    (s.chunkSourceFrames === undefined
      ? Number(raw.sourceDuration) + 0.001 < (s.sourceInFrame + frames - 1) / 24
      : (s.chunkStartFrame ?? 0) / 24 >= Number(raw.sourceDuration))
  )
    throw new Error(`Source video must contain at least ${frames - 1} frames at 24 FPS.`);
  if (raw.preparedFps !== 24)
    throw new Error('Ripple source must be prepared at 24 FPS before submission.');
  const source = uploads.find((item) => item.id === s.sourceVideo && item.kind === 'video');
  const edited = uploads.find((item) => item.id === s.replacementFrame && item.kind === 'image');
  if (!source || !edited) throw new Error('Ripple input uploads are missing.');
  const diffusion = choose(
    nodeChoices(info, 'UNETLoader', 'unet_name'),
    /ltx-2\.5.*distilled.*transformer.*\.safetensors$/i,
    'LTX 2.5 distilled diffusion model',
  );
  const encoder = choose(
    nodeChoices(info, 'CLIPLoader', 'clip_name'),
    /gemma.*ltx-2\.5.*\.safetensors$/i,
    'LTX 2.5 Gemma encoder',
  );
  const videoVae = choose(
    nodeChoices(info, 'VAELoader', 'vae_name'),
    /ltx-2\.5-video-vae.*\.safetensors$/i,
    'LTX video VAE',
  );
  const audioVae = choose(
    nodeChoices(info, 'VAELoader', 'vae_name'),
    /ltx-2\.5-audio-vae.*\.safetensors$/i,
    'LTX audio VAE',
  );
  const lora = choose(
    nodeChoices(info, 'LoraLoaderModelOnly', 'lora_name'),
    /LTX25_Ripple_v11.*\.safetensors$/i,
    'LTX Ripple v11 LoRA',
  );
  const graph: ComfyGraph = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: diffusion, weight_dtype: 'default' } },
    '2': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: encoder, type: 'ltxv', device: 'default' },
    },
    '3': { class_type: 'VAELoader', inputs: { vae_name: videoVae } },
    '4': { class_type: 'VAELoader', inputs: { vae_name: audioVae } },
    '5': {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: ['1', 0], lora_name: lora, strength_model: s.strength },
    },
    '6': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: s.prompt } },
    '7': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: s.negative } },
    '8': {
      class_type: 'LTXVConditioning',
      inputs: { positive: ['6', 0], negative: ['7', 0], frame_rate: 24 },
    },
    '9': { class_type: 'LoadVideo', inputs: { file: source.name } },
    '10': { class_type: 'GetVideoComponents', inputs: { video: ['9', 0] } },
    '11': { class_type: 'LoadImage', inputs: { image: edited.name } },
    '12': {
      class_type: 'ImageScale',
      inputs: {
        image: ['10', 0],
        upscale_method: 'lanczos',
        width: s.width,
        height: s.height,
        crop: 'center',
      },
    },
    '13': {
      class_type: 'ImageScale',
      inputs: {
        image: ['11', 0],
        upscale_method: 'lanczos',
        width: s.width,
        height: s.height,
        crop: 'center',
      },
    },
    '14': { class_type: 'ImageBatch', inputs: { image1: ['13', 0], image2: ['12', 0] } },
    '15': {
      class_type: 'ImageFromBatch',
      inputs: { image: ['14', 0], batch_index: 0, length: frames },
    },
    '16': {
      class_type: 'EmptyLTXVLatentVideo',
      inputs: { width: s.width, height: s.height, length: frames, batch_size: 1 },
    },
    '17': {
      class_type: 'LTXAddVideoICLoRAGuide',
      inputs: {
        positive: ['8', 0],
        negative: ['8', 1],
        vae: ['3', 0],
        latent: ['16', 0],
        image: ['15', 0],
        frame_idx: 0,
        strength: s.guideStrength,
        latent_downscale_factor: 1,
        crop: 'disabled',
        use_tiled_encode: frames > 121,
        tile_size: 256,
        tile_overlap: 64,
      },
    },
    '18': {
      class_type: 'LTXVEmptyLatentAudio',
      inputs: { audio_vae: ['4', 0], frames_number: frames, frame_rate: 24, batch_size: 1 },
    },
    '19': {
      class_type: 'LTXVConcatAVLatent',
      inputs: { video_latent: ['17', 2], audio_latent: ['18', 0] },
    },
    '20': { class_type: 'RandomNoise', inputs: { noise_seed: seed } },
    '21': {
      class_type: 'CFGGuider',
      inputs: { model: ['5', 0], positive: ['17', 0], negative: ['17', 1], cfg: 1 },
    },
    '22': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    '23': {
      class_type: 'BasicScheduler',
      inputs: { model: ['5', 0], scheduler: 'simple', steps: 8, denoise: 1 },
    },
    '24': {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['20', 0],
        guider: ['21', 0],
        sampler: ['22', 0],
        sigmas: ['23', 0],
        latent_image: ['19', 0],
      },
    },
    '25': { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['24', 0] } },
    '26': {
      class_type: 'LTXVCropGuides',
      inputs: { positive: ['17', 0], negative: ['17', 1], latent: ['25', 0] },
    },
    '27': { class_type: 'VAEDecode', inputs: { samples: ['26', 2], vae: ['3', 0] } },
    '28': {
      class_type: 'CreateVideo',
      inputs: { images: ['27', 0], audio: ['10', 1], fps: 24, bit_depth: 8, color_space: 'sRGB' },
    },
    '29': {
      class_type: 'SaveVideo',
      inputs: { video: ['28', 0], filename_prefix: prefix, format: 'auto', 'format.codec': 'auto' },
    },
  };
  const missing = [...new Set(Object.values(graph).map((node) => node.class_type))].filter(
    (name) => !info[name],
  );
  if (missing.length) throw new Error(`Missing ComfyUI nodes: ${missing.join(', ')}`);
  return graph;
}

export function rippleOutputs(outputs: Record<string, unknown>): WorkflowOutput[] {
  return collectWorkflowOutputs(outputs, ['29'], 'video');
}
