// Workflow topology adapted from James Knox's Oyama AI Video Studio.
// See docs/workflows.md for provenance and intentionally supported scope.
import { h3Schema, type H3Settings } from './definition';
import { livePreviewSettingsSchema } from '../../../shared/domain';
import {
  collectWorkflowOutputs,
  nodeChoices,
  type ComfyGraph,
  type ObjectInfo,
  type WorkflowOutput,
  type WorkflowUpload,
} from '../../../shared/modules';
export const templateVersion = 'h3-native-av/4';
export const modelFields = {
  diffusion: ['UNETLoader', 'unet_name'],
  encoder: ['CLIPLoader', 'clip_name'],
  vae: ['VAELoader', 'vae_name'],
  lora: ['LoraLoaderModelOnly', 'lora_name'],
} as const;
export function h3Frames(seconds: number) {
  const requested = Math.round(seconds * 24);
  return requested + ((5 - (requested % 17) + 17) % 17);
}
export function modelCatalog(info: ObjectInfo) {
  return Object.fromEntries(
    Object.entries(modelFields).map(([key, [node, field]]) => [
      key,
      nodeChoices(info, node, field),
    ]),
  );
}
function choose(names: string[], patterns: RegExp[], label: string) {
  for (const pattern of patterns) {
    const found = names.find((name) => pattern.test(name));
    if (found) return found;
  }
  throw new Error(`Missing ${label}. Install it in ComfyUI, then refresh the connection.`);
}
export function effectiveSteps(s: H3Settings) {
  return s.nativeDefaults ? (s.quality === 'turbo8' ? 8 : 30) : s.steps;
}
export function compileH3(
  raw: unknown,
  info: ObjectInfo,
  uploads: WorkflowUpload[],
  seed: number,
  prefix: string,
  frameCount?: number,
): ComfyGraph {
  const s = h3Schema.parse(raw);
  const preview = livePreviewSettingsSchema.parse({
    frames: (raw as Record<string, unknown>)?.previewFrames,
    fps: (raw as Record<string, unknown>)?.previewFps,
  });
  if (
    frameCount !== undefined &&
    (!Number.isInteger(frameCount) ||
      frameCount < 22 ||
      frameCount > 396 ||
      (frameCount - 5) % 17 !== 0)
  )
    throw new Error('H3 explicit length must use the 17k+5 frame grid.');
  if (!s.prompt.trim()) throw new Error('Describe the shot before generating.');
  const m = modelCatalog(info);
  const family = s.mode === 'reference' ? 'ref2va' : 'fl2va';
  const diffusion = choose(
    m.diffusion,
    [
      new RegExp(`minimax_h3_${family}_pruned_int8_convrot\\.safetensors$`, 'i'),
      new RegExp(`minimax_h3_${family}.*\\.safetensors$`, 'i'),
    ],
    `H3 ${family} diffusion model`,
  );
  const encoder = choose(
    m.encoder,
    [/qwen3vl_32b_minimax_h3_nvfp4_awq\.safetensors$/i, /qwen3vl_32b_minimax_h3.*\.safetensors$/i],
    'H3 text encoder',
  );
  const videoVae = choose(
    m.vae,
    [/minimax_h3_video_vae_fp16\.safetensors$/i, /minimax_h3_video_vae.*\.safetensors$/i],
    'H3 video VAE',
  );
  const audioVae = choose(
    m.vae,
    [/minimax_h3_audio_vae_fp32\.safetensors$/i, /minimax_h3_audio_vae.*\.safetensors$/i],
    'H3 audio VAE',
  );
  const graph: ComfyGraph = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: diffusion, weight_dtype: 'default' } },
    '2': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: encoder, type: 'minimax', device: 'default' },
    },
    '3': { class_type: 'VAELoader', inputs: { vae_name: videoVae } },
    '4': { class_type: 'VAELoader', inputs: { vae_name: audioVae } },
  };
  let model: [string, number] = ['1', 0];
  if (s.quality === 'turbo8') {
    const loraFamily = s.mode === 'reference' ? 'ref2v' : 'fl2v';
    const lora = choose(
      m.lora,
      [new RegExp(`minimax_h3_${loraFamily}_turbo_8step.*\\.safetensors$`, 'i')],
      `${loraFamily} Turbo 8 LoRA`,
    );
    graph['5'] = {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model, lora_name: lora, strength_model: 1 },
    };
    model = ['5', 0];
    if (s.mode === 'reference') {
      graph['6'] = {
        class_type: 'MiniMaxH3SigmaShift',
        inputs: { model, shift_video: 6, shift_audio: 3 },
      };
      model = ['6', 0];
    }
  }
  if (s.livePreview && info.MiniMaxH3LivePreview) {
    const decoder = nodeChoices(info, 'MiniMaxH3LivePreview', 'tae_decoder').find((name) =>
      /^taeh3(?:_decoder)?\.safetensors$/i.test(name),
    );
    graph['7'] = {
      class_type: 'MiniMaxH3LivePreview',
      inputs: {
        model,
        preview_frames: preview.frames,
        preview_fps: preview.fps,
        max_resolution: 512,
        every_n_steps: 1,
        upscale_method: 'bilinear',
        jpeg_quality: 80,
        suppress_default_preview: true,
        vae_decode_every_n_steps: 0,
        vae_decode_frames: 1,
        vae_decode_device: 'auto',
        tae_decoder: decoder || 'none',
        verbose: false,
      },
    };
    model = ['7', 0];
  }
  const conditioning: Record<string, unknown> = {
    clip: ['2', 0],
    vae: ['3', 0],
    prompt: s.prompt,
    width: s.width,
    height: s.height,
    length: frameCount ?? h3Frames(s.duration),
  };
  let next = 100;
  const load = (assetId: string) => {
    const input = uploads.find((u) => u.id === assetId);
    if (!input) throw new Error('A reference is missing. Import or attach it again.');
    const id = String(next++);
    graph[id] = {
      class_type:
        input.kind === 'image' ? 'LoadImage' : input.kind === 'video' ? 'LoadVideo' : 'LoadAudio',
      inputs: {
        [input.kind === 'image' ? 'image' : input.kind === 'video' ? 'file' : 'audio']: input.name,
      },
    };
    if (input.kind === 'video') {
      const parts = String(next++);
      graph[parts] = { class_type: 'GetVideoComponents', inputs: { video: [id, 0] } };
      return [parts, 0];
    }
    return [id, 0];
  };
  if (s.mode === 'reference') {
    if (!s.references.length) throw new Error('Attach at least one reference for Ref2VA.');
    conditioning.audio_vae = ['4', 0];
    const sizes = nodeChoices(info, 'MiniMaxH3ReferenceToVideo', 'ref_image_size');
    if (sizes.length && !sizes.includes(s.refImageSize))
      throw new Error('Connected Ref2VA node does not support this reference image sizing option.');
    conditioning.ref_image_size = s.refImageSize;
    const indices = { image: 0, video: 0, audio: 0 };
    for (const id of s.references) {
      const input = uploads.find((u) => u.id === id);
      if (!input) throw new Error('Missing reference');
      conditioning[`ref_${input.kind}s.ref_${input.kind}_${indices[input.kind]++}`] = load(id);
    }
  } else if (s.mode === 'image') {
    if (!s.firstFrame) throw new Error('Choose a first frame for Image to Video.');
    if (uploads.find((u) => u.id === s.firstFrame)?.kind !== 'image')
      throw new Error('First frame must be an image.');
    conditioning.first_frame = load(s.firstFrame);
    if (s.lastFrame) {
      if (uploads.find((u) => u.id === s.lastFrame)?.kind !== 'image')
        throw new Error('Last frame must be an image.');
      conditioning.last_frame = load(s.lastFrame);
    }
  }
  graph['10'] = {
    class_type: s.mode === 'reference' ? 'MiniMaxH3ReferenceToVideo' : 'MiniMaxH3ImageToVideo',
    inputs: conditioning,
  };
  Object.assign(graph, {
    '11': { class_type: 'RandomNoise', inputs: { noise_seed: seed } },
    '12': { class_type: 'BasicGuider', inputs: { model, conditioning: ['10', 0] } },
    '13': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'res_multistep' } },
    '14': {
      class_type: 'BasicScheduler',
      inputs: { model, scheduler: 'simple', steps: effectiveSteps(s), denoise: 1 },
    },
    '15': {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['11', 0],
        guider: ['12', 0],
        sampler: ['13', 0],
        sigmas: ['14', 0],
        latent_image: ['10', 1],
      },
    },
    '16': { class_type: 'VAEDecode', inputs: { samples: ['15', 0], vae: ['3', 0] } },
    '17': { class_type: 'VAEDecodeAudio', inputs: { samples: ['15', 0], vae: ['4', 0] } },
    '18': {
      class_type: 'CreateVideo',
      inputs: { images: ['16', 0], audio: ['17', 0], fps: 24, bit_depth: 8, color_space: 'sRGB' },
    },
    '19': {
      class_type: 'SaveVideo',
      inputs: {
        video: ['18', 0],
        filename_prefix: prefix,
        format: 'mp4',
        ...(info.SaveVideo?.input?.required?.format?.[0] === 'COMFY_DYNAMICCOMBO_V3'
          ? { 'format.codec': 'h264', 'format.codec.encoding': 'auto' }
          : { codec: 'h264' }),
      },
    },
  });
  if (info.MiniMaxH3SaveLatent)
    graph['204'] = {
      class_type: 'MiniMaxH3SaveLatent',
      inputs: { latent: ['15', 0], filename_prefix: `${prefix}-context`, clip_index: 1 },
    };
  const missing = [...new Set(Object.values(graph).map((n) => n.class_type))].filter(
    (n) => !info[n],
  );
  if (missing.length) throw new Error(`Missing ComfyUI nodes: ${missing.join(', ')}`);
  return graph;
}
export function h3Outputs(outputs: Record<string, unknown>): WorkflowOutput[] {
  return collectWorkflowOutputs(outputs, ['19'], 'video');
}
