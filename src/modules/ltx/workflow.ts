// LTX 2.5 distilled graph adapted from Oyama AI Video Studio src/lib/ltx25Workflow.ts.
import {
  collectWorkflowOutputs,
  nodeChoices,
  type ComfyGraph,
  type ObjectInfo,
  type WorkflowOutput,
  type WorkflowUpload,
} from '../../../shared/modules';
import { ltxSchema } from './definition';

export const ltxTemplateVersion = 'ltx25-distilled/1';
export const firstStageSigmas =
  '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0';
export const refinerSigmas = '0.85, 0.7250, 0.4219, 0.0';
export const ltxFrames = (seconds: number) => seconds * 24 + 1;
type Link = [string, number];

function choose(names: string[], pattern: RegExp, label: string) {
  const found = names.find((name) => pattern.test(name));
  if (!found)
    throw new Error(`Missing ${label}. Install it in ComfyUI, then refresh the connection.`);
  return found;
}

export function compileLtx(
  raw: unknown,
  info: ObjectInfo,
  uploads: WorkflowUpload[],
  seed: number,
  prefix: string,
): ComfyGraph {
  const s = ltxSchema.parse(raw);
  if (!s.prompt.trim()) throw new Error('Describe the video before generating.');
  const model = choose(
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
  const half = s.profile === 'quality';
  const frames = ltxFrames(s.duration);
  const graph: ComfyGraph = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: model, weight_dtype: 'default' } },
    '2': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: encoder, type: 'ltxv', device: 'default' },
    },
    '3': { class_type: 'VAELoader', inputs: { vae_name: videoVae } },
    '4': { class_type: 'VAELoader', inputs: { vae_name: audioVae } },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: s.prompt } },
    '6': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: s.negative } },
    '7': {
      class_type: 'LTXVConditioning',
      inputs: { positive: ['5', 0], negative: ['6', 0], frame_rate: 24 },
    },
    '8': {
      class_type: 'EmptyLTXVLatentVideo',
      inputs: {
        width: half ? s.width / 2 : s.width,
        height: half ? s.height / 2 : s.height,
        length: frames,
        batch_size: 1,
      },
    },
    '9': {
      class_type: 'LTXVEmptyLatentAudio',
      inputs: { audio_vae: ['4', 0], frames_number: frames, frame_rate: 24, batch_size: 1 },
    },
    '11': { class_type: 'RandomNoise', inputs: { noise_seed: seed } },
    '12': {
      class_type: 'LTXVDualCFGGuider',
      inputs: {
        model: ['1', 0],
        positive: ['7', 0],
        negative: ['7', 1],
        video_cfg: 1,
        audio_cfg: 1,
      },
    },
    '13': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler_ancestral' } },
    '14': { class_type: 'ManualSigmas', inputs: { sigmas: firstStageSigmas } },
  };
  let modelLink: Link = ['1', 0];
  const msrSlots = ['pic1', 'pic2', 'pic3', 'pic4', 'background'] as const;
  const msrInputs: Record<string, unknown> = {};
  const makeMsrGuide = (latent: Link) => ({
    positive: ['5', 0],
    negative: ['6', 0],
    vae: ['3', 0],
    latent,
    strength: 1,
    reference_frames: '33',
    use_tiled_encode: false,
    tile_size: 256,
    tile_overlap: 64,
    msr_parameters: ['47', 1],
    ...msrInputs,
  });
  if (s.msr.enabled) {
    const lora = choose(
      nodeChoices(info, 'ComfyUILTX25MSRICLoRALoader', 'lora_name'),
      /LTX-2\.5-Licon-MSR.*\.safetensors$/i,
      'LTX 2.5 Licon MSR LoRA',
    );
    graph['47'] = {
      class_type: 'ComfyUILTX25MSRICLoRALoader',
      inputs: { model: modelLink, lora_name: lora, strength_model: 1 },
    };
    modelLink = ['47', 0];
    msrSlots.forEach((slot, index) => {
      const id = s.msr[slot];
      if (!id) return;
      const upload = uploads.find((file) => file.id === id && file.kind === 'image');
      if (!upload) throw new Error(`LTX MSR ${slot} image upload is missing.`);
      const node = String(50 + index);
      graph[node] = { class_type: 'LoadImage', inputs: { image: upload.name } };
      msrInputs[slot] = [node, 0];
    });
  }
  graph['12'].inputs.model = modelLink;
  let initialVideo: Link = ['8', 0];
  if (s.msr.enabled && !half) {
    graph['48'] = {
      class_type: 'ComfyUILTX25MSRMultiReferenceGuide',
      inputs: makeMsrGuide(initialVideo),
    };
    graph['7'].inputs = { positive: ['48', 0], negative: ['48', 1], frame_rate: 24 };
    initialVideo = ['48', 2];
  }
  let preparedImage: Link | undefined;
  if (s.mode === 'image') {
    const upload = uploads.find((file) => file.id === s.firstFrame && file.kind === 'image');
    if (!upload) throw new Error('LTX first-frame image upload is missing.');
    graph['20'] = { class_type: 'LoadImage', inputs: { image: upload.name } };
    graph['21'] = {
      class_type: 'ResizeImageMaskNode',
      inputs: {
        input: ['20', 0],
        resize_type: 'scale longer dimension',
        'resize_type.longer_size': 1536,
        scale_method: 'lanczos',
      },
    };
    graph['22'] = {
      class_type: 'LTXVPreprocess',
      inputs: { image: ['21', 0], img_compression: 18 },
    };
    graph['23'] = {
      class_type: 'LTXVImgToVideoInplace',
      inputs: {
        vae: ['3', 0],
        image: ['22', 0],
        latent: initialVideo,
        strength: 0.7,
        bypass: false,
      },
    };
    initialVideo = ['23', 0];
    preparedImage = ['22', 0];
  }
  graph['10'] = {
    class_type: 'LTXVConcatAVLatent',
    inputs: { video_latent: initialVideo, audio_latent: ['9', 0] },
  };
  graph['15'] = {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['11', 0],
      guider: ['12', 0],
      sampler: ['13', 0],
      sigmas: ['14', 0],
      latent_image: ['10', 0],
    },
  };
  graph['16'] = { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['15', 0] } };
  let finalVideo: Link = ['16', 0];
  let finalAudio: Link = ['16', 1];
  if (half) {
    const upscaler = choose(
      nodeChoices(info, 'LatentUpscaleModelLoader', 'model_name'),
      /ltx-2\.5.*latent.*upscaler.*\.safetensors$/i,
      'LTX latent x2 upscaler',
    );
    graph['30'] = { class_type: 'LatentUpscaleModelLoader', inputs: { model_name: upscaler } };
    graph['31'] = {
      class_type: 'LTXVLatentUpsampler',
      inputs: { samples: finalVideo, upscale_model: ['30', 0], vae: ['3', 0] },
    };
    let refinedVideo: Link = ['31', 0];
    if (s.msr.enabled) {
      graph['48'] = {
        class_type: 'ComfyUILTX25MSRMultiReferenceGuide',
        inputs: makeMsrGuide(refinedVideo),
      };
      graph['49'] = {
        class_type: 'LTXVConditioning',
        inputs: { positive: ['48', 0], negative: ['48', 1], frame_rate: 24 },
      };
      refinedVideo = ['48', 2];
    }
    if (preparedImage) {
      graph['32'] = {
        class_type: 'LTXVImgToVideoInplace',
        inputs: {
          vae: ['3', 0],
          image: preparedImage,
          latent: refinedVideo,
          strength: 1,
          bypass: false,
        },
      };
      refinedVideo = ['32', 0];
    }
    graph['33'] = {
      class_type: 'LTXVConcatAVLatent',
      inputs: { video_latent: refinedVideo, audio_latent: finalAudio },
    };
    graph['34'] = { class_type: 'RandomNoise', inputs: { noise_seed: 42 } };
    graph['35'] = {
      class_type: 'LTXVDualCFGGuider',
      inputs: {
        model: modelLink,
        positive: s.msr.enabled ? ['49', 0] : ['7', 0],
        negative: s.msr.enabled ? ['49', 1] : ['7', 1],
        video_cfg: 1,
        audio_cfg: 1,
      },
    };
    graph['36'] = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler_ancestral' } };
    graph['37'] = { class_type: 'ManualSigmas', inputs: { sigmas: refinerSigmas } };
    graph['38'] = {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['34', 0],
        guider: ['35', 0],
        sampler: ['36', 0],
        sigmas: ['37', 0],
        latent_image: ['33', 0],
      },
    };
    graph['39'] = { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['38', 0] } };
    finalVideo = ['39', 0];
    finalAudio = ['39', 1];
  }
  if (s.msr.enabled) {
    graph['55'] = {
      class_type: 'LTXVCropGuides',
      inputs: {
        positive: half ? ['49', 0] : ['7', 0],
        negative: half ? ['49', 1] : ['7', 1],
        latent: finalVideo,
      },
    };
    finalVideo = ['55', 2];
  }
  graph['40'] = {
    class_type: 'VAEDecodeTiled',
    inputs: {
      samples: finalVideo,
      vae: ['3', 0],
      tile_size: 512,
      overlap: 64,
      temporal_size: 64,
      temporal_overlap: 16,
    },
  };
  graph['41'] = {
    class_type: 'LTXVAudioVAEDecode',
    inputs: { samples: finalAudio, audio_vae: ['4', 0] },
  };
  graph['42'] = {
    class_type: 'CreateVideo',
    inputs: { images: ['40', 0], audio: ['41', 0], fps: 24, bit_depth: 8, color_space: 'sRGB' },
  };
  graph['43'] = {
    class_type: 'SaveVideo',
    inputs: { video: ['42', 0], filename_prefix: prefix, format: 'auto', 'format.codec': 'auto' },
  };
  const missing = [...new Set(Object.values(graph).map((node) => node.class_type))].filter(
    (name) => !info[name],
  );
  if (missing.length) throw new Error(`Missing ComfyUI nodes: ${missing.join(', ')}`);
  return graph;
}

export function ltxOutputs(outputs: Record<string, unknown>): WorkflowOutput[] {
  return collectWorkflowOutputs(outputs, ['43'], 'video');
}
