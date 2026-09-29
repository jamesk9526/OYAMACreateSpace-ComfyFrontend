import { describe, expect, it } from 'vitest';
import type { Asset } from '../shared/domain';
import type { ObjectInfo } from '../shared/modules';
import { generatorAdapters } from '../electron/main/modules';
import { rippleDefaults } from '../src/modules/ripple/definition';
import { compileRipple, rippleFrames, rippleOutputs } from '../src/modules/ripple/workflow';

const sourceId = '11111111-1111-4111-8111-111111111111';
const frameId = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';
const info: ObjectInfo = Object.fromEntries(
  [
    'LoadVideo',
    'GetVideoComponents',
    'LoadImage',
    'ImageScale',
    'ImageBatch',
    'ImageFromBatch',
    'CLIPTextEncode',
    'LTXVConditioning',
    'EmptyLTXVLatentVideo',
    'LTXAddVideoICLoRAGuide',
    'LTXVEmptyLatentAudio',
    'LTXVConcatAVLatent',
    'RandomNoise',
    'CFGGuider',
    'KSamplerSelect',
    'BasicScheduler',
    'SamplerCustomAdvanced',
    'LTXVSeparateAVLatent',
    'LTXVCropGuides',
    'VAEDecode',
    'CreateVideo',
    'SaveVideo',
  ].map((name) => [name, {}]),
);
info.UNETLoader = {
  input: { required: { unet_name: [['ltx-2.5-22b-distilled-transformer.safetensors']] } },
};
info.CLIPLoader = {
  input: { required: { clip_name: [['gemma4-with-proj-ltx-2.5.safetensors']] } },
};
info.VAELoader = {
  input: {
    required: { vae_name: [['ltx-2.5-video-vae.safetensors', 'ltx-2.5-audio-vae.safetensors']] },
  },
};
info.LoraLoaderModelOnly = {
  input: { required: { lora_name: [['LTX25_Ripple_v11.safetensors']] } },
};
const values = {
  ...rippleDefaults,
  sourceVideo: sourceId,
  replacementFrame: frameId,
  sourceDuration: 5,
  sourceFps: 30,
  preparedFps: 24,
};
const uploads = [
  { id: sourceId, kind: 'video' as const, name: 'source.mp4' },
  { id: frameId, kind: 'image' as const, name: 'edited.png' },
];

describe('Ripple single pass', () => {
  it('orders edited frame before source, crops guides and keeps source audio', () => {
    const graph = compileRipple(values, info, uploads, 77, 'ripple');
    expect(rippleFrames(2)).toBe(49);
    expect(rippleFrames(20)).toBe(481);
    expect(graph['14'].inputs).toEqual({ image1: ['13', 0], image2: ['12', 0] });
    expect(graph['15'].inputs.length).toBe(121);
    expect(graph['17'].inputs).toMatchObject({ image: ['15', 0], strength: 1, frame_idx: 0 });
    expect(graph['27'].inputs.samples).toEqual(['26', 2]);
    expect(graph['28'].inputs.audio).toEqual(['10', 1]);
    expect(graph['23'].inputs).toMatchObject({ steps: 8, scheduler: 'simple' });
    expect(graph['5'].inputs.strength_model).toBe(1.35);
    expect(
      rippleOutputs({
        '27': { videos: [{ filename: 'preview.mp4' }] },
        '29': { videos: [{ filename: 'edited.mp4' }] },
      }),
    ).toEqual([{ filename: 'edited.mp4', type: 'output', subfolder: '' }]);
  });
  it('rejects short sources, unprepared media, missing models and invalid dimensions', () => {
    expect(() => compileRipple({ ...values, sourceInFrame: 72 }, info, uploads, 1, 'x')).toThrow(
      'at least',
    );
    expect(() =>
      compileRipple({ ...values, sourceInFrame: 72, sourceDuration: 10 }, info, uploads, 1, 'x'),
    ).not.toThrow();
    expect(() => compileRipple({ ...values, sourceDuration: 1 }, info, uploads, 1, 'x')).toThrow(
      'at least',
    );
    expect(() => compileRipple({ ...values, preparedFps: 30 }, info, uploads, 1, 'x')).toThrow(
      'prepared',
    );
    expect(() => compileRipple({ ...values, width: 700 }, info, uploads, 1, 'x')).toThrow();
    expect(() =>
      compileRipple(values, { ...info, LoraLoaderModelOnly: {} }, uploads, 1, 'x'),
    ).toThrow('Ripple v11');
  });
  it('derives submission media facts from managed assets and rejects other projects', () => {
    const source: Asset = {
      id: sourceId,
      projectId,
      kind: 'video',
      name: 'source.mp4',
      mime: 'video/mp4',
      url: '',
      createdAt: '',
      media: {
        duration: 8,
        streams: [],
        video: { kind: 'video', codec: 'h264', fps: 30, frames: 150 },
        audio: null,
      },
    };
    const frame: Asset = {
      id: frameId,
      projectId,
      kind: 'image',
      name: 'edited.png',
      mime: 'image/png',
      url: '',
      createdAt: '',
    };
    const draft = {
      projectId,
      moduleId: 'ripple',
      values: { ...values, sourceDuration: 999, sourceFps: 999 },
    };
    const resolved = generatorAdapters.ripple.resolve(draft, [], (id) =>
      id === sourceId ? source : frame,
    );
    expect(resolved.values).toMatchObject({ sourceDuration: 5, sourceFps: 30, preparedFps: 24 });
    expect(resolved.assetIds).toEqual([sourceId, frameId]);
    expect(() =>
      generatorAdapters.ripple.resolve(draft, [], (id) =>
        id === sourceId ? { ...source, projectId: frameId } : frame,
      ),
    ).toThrow('different project');
    expect(() =>
      generatorAdapters.ripple.resolve(draft, [], (id) =>
        id === sourceId ? { ...source, media: undefined } : frame,
      ),
    ).toThrow('Inspect');
  });
});
