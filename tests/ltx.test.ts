import { describe, expect, it } from 'vitest';
import type { ObjectInfo } from '../shared/modules';
import { ltxDefaults, ltxAvailability } from '../src/modules/ltx/definition';
import { compileLtx, ltxFrames, ltxOutputs } from '../src/modules/ltx/workflow';
import { generatorAdapters } from '../electron/main/modules';
import { moduleDefaults } from '../src/modules/registry';

const classes = [
  'CLIPTextEncode',
  'LTXVConditioning',
  'EmptyLTXVLatentVideo',
  'LTXVEmptyLatentAudio',
  'RandomNoise',
  'LTXVDualCFGGuider',
  'KSamplerSelect',
  'ManualSigmas',
  'LTXVConcatAVLatent',
  'SamplerCustomAdvanced',
  'LTXVSeparateAVLatent',
  'VAEDecodeTiled',
  'LTXVAudioVAEDecode',
  'CreateVideo',
  'SaveVideo',
  'LoadImage',
  'ResizeImageMaskNode',
  'LTXVPreprocess',
  'LTXVImgToVideoInplace',
  'LatentUpscaleModelLoader',
  'LTXVLatentUpsampler',
  'ComfyUILTX25MSRICLoRALoader',
  'ComfyUILTX25MSRMultiReferenceGuide',
  'LTXVCropGuides',
];
const info: ObjectInfo = Object.fromEntries(classes.map((name) => [name, {}]));
info.UNETLoader = {
  input: {
    required: {
      unet_name: [
        [
          'ltx-2.5-22b-dev-transformer-comfy-int8-convrot.safetensors',
          'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors',
        ],
      ],
    },
  },
};
info.CLIPLoader = {
  input: {
    required: { clip_name: [['gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors']] },
  },
};
info.VAELoader = {
  input: {
    required: {
      vae_name: [['ltx-2.5-video-vae-bf16.safetensors', 'ltx-2.5-audio-vae-bf16.safetensors']],
    },
  },
};
info.LatentUpscaleModelLoader = {
  input: {
    required: {
      model_name: [
        'COMBO',
        { options: ['ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors'] },
      ],
    },
  },
};
info.ComfyUILTX25MSRICLoRALoader = {
  input: {
    required: { lora_name: ['COMBO', { options: ['ltx2.5\\LTX-2.5-Licon-MSR-V1.safetensors'] }] },
  },
};
const firstFrame = '11111111-1111-4111-8111-111111111111';
const secondFrame = '33333333-3333-4333-8333-333333333333';

describe('LTX 2.5 workflow', () => {
  it('compiles distilled text to video with audio and an 8n+1 frame grid', () => {
    expect(ltxFrames(4)).toBe(97);
    const graph = compileLtx(
      { ...ltxDefaults, prompt: 'Rain on a harbor at dusk.' },
      info,
      [],
      17,
      'test',
    );
    expect(graph['1'].inputs.unet_name).toContain('distilled');
    expect(graph['8'].inputs).toMatchObject({ width: 768, height: 512, length: 97 });
    expect(graph['9'].inputs).toMatchObject({ frames_number: 97, frame_rate: 24 });
    expect(graph['14'].inputs.sigmas).toContain('0.99375');
    expect(graph['42'].inputs).toMatchObject({ audio: ['41', 0], fps: 24 });
    expect(graph['43'].class_type).toBe('SaveVideo');
    expect(graph['30']).toBeUndefined();
  });

  it('wires the first frame into both stages of quality rendering', () => {
    const graph = compileLtx(
      {
        ...ltxDefaults,
        mode: 'image',
        profile: 'quality',
        prompt: 'The scene begins to move.',
        firstFrame,
      },
      info,
      [{ id: firstFrame, name: 'uploaded.png', kind: 'image' }],
      22,
      'quality',
    );
    expect(graph['8'].inputs).toMatchObject({ width: 384, height: 256 });
    expect(graph['21'].inputs['resize_type.longer_size']).toBe(1536);
    expect(graph['10'].inputs.video_latent).toEqual(['23', 0]);
    expect(graph['31'].inputs.samples).toEqual(['16', 0]);
    expect(graph['32'].inputs.latent).toEqual(['31', 0]);
    expect(graph['33'].inputs.video_latent).toEqual(['32', 0]);
    expect(graph['40'].inputs.samples).toEqual(['39', 0]);
    expect(graph['41'].inputs.samples).toEqual(['39', 1]);
  });

  it('rejects incompatible dimensions, missing inputs, models and upscaler', () => {
    expect(() =>
      compileLtx({ ...ltxDefaults, prompt: 'x', width: 700 }, info, [], 1, 'x'),
    ).toThrow();
    expect(() =>
      compileLtx({ ...ltxDefaults, prompt: 'x', mode: 'image', firstFrame }, info, [], 1, 'x'),
    ).toThrow('upload is missing');
    expect(() =>
      compileLtx(
        { ...ltxDefaults, prompt: 'x' },
        {
          ...info,
          UNETLoader: {
            input: { required: { unet_name: [['ltx-2.5-22b-dev-transformer.safetensors']] } },
          },
        },
        [],
        1,
        'x',
      ),
    ).toThrow('distilled diffusion model');
    expect(() =>
      compileLtx(
        { ...ltxDefaults, prompt: 'x', profile: 'quality' },
        { ...info, LatentUpscaleModelLoader: {} },
        [],
        1,
        'x',
      ),
    ).toThrow('latent x2 upscaler');
  });

  it('extracts only video from the declared save node and keeps draft handoff fields', () => {
    expect(
      ltxOutputs({
        '42': { videos: [{ filename: 'preview.mp4' }] },
        '43': { videos: [{ filename: 'result.mp4', type: 'output' }] },
      }),
    ).toEqual([{ filename: 'result.mp4', type: 'output', subfolder: '' }]);
    expect(moduleDefaults('ltx')).toMatchObject({ mode: 'text', profile: 'turbo' });
    const projectId = '22222222-2222-4222-8222-222222222222';
    const draft = generatorAdapters.ltx.applyAsset?.(
      { projectId, moduleId: 'ltx', values: { prompt: 'Keep this shot', duration: 5 } },
      'firstFrame',
      {
        id: firstFrame,
        projectId,
        kind: 'image',
        name: 'first.png',
        mime: 'image/png',
        url: '',
        createdAt: '',
      },
    );
    expect(draft?.values).toMatchObject({
      prompt: 'Keep this shot',
      duration: 5,
      mode: 'image',
      firstFrame,
    });
  });

  it('requires installed distilled assets and stage-specific upscaler', () => {
    const readiness = {
      connected: true,
      mock: false,
      message: '',
      devices: [],
      nodes: classes,
      models: {
        diffusion: ['ltx-2.5-22b-distilled-transformer.safetensors'],
        encoder: ['gemma-ltx-2.5.safetensors'],
        vae: ['ltx-2.5-video-vae.safetensors', 'ltx-2.5-audio-vae.safetensors'],
        upscaler: [],
      },
    };
    expect(ltxAvailability(readiness, 'turbo').ready).toBe(true);
    expect(ltxAvailability(readiness, 'quality').message).toContain('upscaler');
    expect(ltxAvailability(readiness, 'turbo', true).message).toContain('MSR LoRA');
  });

  it('keeps ordered MSR slots and attaches the guide at the correct sampling stage', () => {
    const msr = { ...ltxDefaults.msr, enabled: true, pic1: firstFrame, background: secondFrame };
    const uploads = [
      { id: firstFrame, name: 'person.png', kind: 'image' as const },
      { id: secondFrame, name: 'room.png', kind: 'image' as const },
    ];
    const turbo = compileLtx(
      { ...ltxDefaults, prompt: 'Two people enter a room.', msr },
      info,
      uploads,
      1,
      'msr-turbo',
    );
    expect(turbo['50'].inputs.image).toBe('person.png');
    expect(turbo['54'].inputs.image).toBe('room.png');
    expect(turbo['48'].inputs).toMatchObject({
      pic1: ['50', 0],
      background: ['54', 0],
      latent: ['8', 0],
    });
    expect(turbo['7'].inputs.positive).toEqual(['48', 0]);
    expect(turbo['10'].inputs.video_latent).toEqual(['48', 2]);
    expect(turbo['12'].inputs.model).toEqual(['47', 0]);
    expect(turbo['55'].inputs.latent).toEqual(['16', 0]);
    expect(turbo['40'].inputs.samples).toEqual(['55', 2]);
    const quality = compileLtx(
      { ...ltxDefaults, prompt: 'Two people enter a room.', profile: 'quality', msr },
      info,
      uploads,
      1,
      'msr-quality',
    );
    expect(quality['7'].inputs.positive).toEqual(['5', 0]);
    expect(quality['48'].inputs.latent).toEqual(['31', 0]);
    expect(quality['33'].inputs.video_latent).toEqual(['48', 2]);
    expect(quality['35'].inputs.positive).toEqual(['49', 0]);
    expect(quality['35'].inputs.model).toEqual(['47', 0]);
    expect(quality['55'].inputs.latent).toEqual(['39', 0]);
    expect(quality['40'].inputs.samples).toEqual(['55', 2]);
    expect(() =>
      compileLtx(
        { ...ltxDefaults, prompt: 'x', msr: { ...msr, pic1: null } },
        info,
        uploads,
        1,
        'x',
      ),
    ).toThrow('first MSR reference');
  });
});
