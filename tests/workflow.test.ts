import { describe, expect, it } from 'vitest';
import { compileH3, h3Frames, h3Outputs } from '../src/modules/h3/workflow';
import { h3Defaults } from '../src/modules/h3/definition';
import type { ObjectInfo } from '../shared/modules';
import { generatorAdapters } from '../electron/main/modules';
const imageId = '11111111-1111-4111-8111-111111111111';
const info: ObjectInfo = Object.fromEntries(
  [
    'MiniMaxH3ImageToVideo',
    'MiniMaxH3ReferenceToVideo',
    'MiniMaxH3SigmaShift',
    'RandomNoise',
    'BasicGuider',
    'KSamplerSelect',
    'BasicScheduler',
    'SamplerCustomAdvanced',
    'VAEDecode',
    'VAEDecodeAudio',
    'CreateVideo',
    'SaveVideo',
    'LoadImage',
    'LoadVideo',
    'GetVideoComponents',
    'LoadAudio',
  ].map((name) => [name, {}]),
);
info.UNETLoader = {
  input: {
    required: {
      unet_name: [
        [
          'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
          'minimax_h3_ref2va_pruned_int8_convrot.safetensors',
        ],
      ],
    },
  },
};
info.CLIPLoader = {
  input: { required: { clip_name: [['qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors']] } },
};
info.VAELoader = {
  input: {
    required: {
      vae_name: [
        ['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae_fp32.safetensors'],
      ],
    },
  },
};
info.LoraLoaderModelOnly = {
  input: {
    required: {
      lora_name: [
        [
          'minimax_h3_fl2v_turbo_8step_v1.0.safetensors',
          'minimax_h3_ref2v_turbo_8step_v1.0_768p.safetensors',
        ],
      ],
    },
  },
};
const base = { ...h3Defaults, prompt: 'A quiet coast' };
describe('H3 workflow', () => {
  it('uses custom steps for Turbo and Native without changing their model recipes', () => {
    for (const quality of ['turbo8', 'native'] as const) {
      const graph = compileH3(
        { ...base, quality, nativeDefaults: false, steps: 12 },
        info,
        [],
        7,
        'test',
      );
      expect(graph['14'].inputs.steps).toBe(12);
      expect(graph['13'].inputs.sampler_name).toBe('res_multistep');
      expect(Boolean(graph['5'])).toBe(quality === 'turbo8');
      expect(
        compileH3({ ...base, quality, nativeDefaults: true, steps: 12 }, info, [], 7, 'test')['14']
          .inputs.steps,
      ).toBe(quality === 'turbo8' ? 8 : 30);
    }
    expect(() =>
      compileH3({ ...base, nativeDefaults: false, steps: 0 }, info, [], 7, 'test'),
    ).toThrow();
  });
  it('honors an explicit text/image mode without applying dormant Ref2VA media', () => {
    const recordId = '22222222-2222-4222-8222-222222222222';
    const projectId = '33333333-3333-4333-8333-333333333333';
    const records = [
      {
        id: recordId,
        kind: 'character' as const,
        name: 'Character',
        description: 'Private reference direction',
        assetIds: [imageId],
        createdAt: '',
      },
    ];
    for (const mode of ['text', 'image'] as const) {
      const resolved = generatorAdapters.h3.resolve(
        {
          projectId,
          moduleId: 'h3',
          values: {
            ...base,
            mode,
            modeExplicit: true,
            references: [imageId],
            characterIds: [recordId],
            firstFrame: imageId,
          },
        },
        records,
        () => ({
          id: imageId,
          projectId,
          kind: 'image',
          mime: 'image/png',
          name: 'frame.png',
          url: '',
          createdAt: '',
        }),
      );
      expect(resolved.values.mode).toBe(mode);
      expect(resolved.values.references).toEqual([]);
      expect(resolved.values.prompt).not.toContain('Private reference direction');
      expect(resolved.assetIds).toEqual(mode === 'image' ? [imageId] : []);
    }
  });
  it('patches the sampled model with the installed optional live decoder', () => {
    const previewInfo = {
      ...info,
      MiniMaxH3LivePreview: {
        input: { required: { tae_decoder: [['none', 'taeh3_decoder.safetensors']] } },
      },
    };
    const graph = compileH3(base, previewInfo, [], 42, 'preview');
    expect(graph['7'].inputs.tae_decoder).toBe('taeh3_decoder.safetensors');
    expect(graph['7'].inputs.preview_frames).toBe(8);
    expect(graph['7'].inputs.preview_fps).toBe(24);
    const configured = compileH3(
      { ...base, previewFrames: 12, previewFps: 12 },
      previewInfo,
      [],
      42,
      'configured',
    );
    expect(configured['7'].inputs.preview_frames).toBe(12);
    expect(configured['7'].inputs.preview_fps).toBe(12);
    expect(() =>
      compileH3({ ...base, previewFrames: 33 }, previewInfo, [], 42, 'invalid'),
    ).toThrow();
    expect(graph['12'].inputs.model).toEqual(['7', 0]);
    expect(graph['14'].inputs.model).toEqual(['7', 0]);
    expect(
      compileH3({ ...base, livePreview: false }, previewInfo, [], 42, 'disabled')['7'],
    ).toBeUndefined();
    expect(compileH3(base, info, [], 42, 'unavailable')['7']).toBeUndefined();
  });
  it('maps the current SaveVideo dynamic codec input and legacy codec', () => {
    const current = {
      ...info,
      SaveVideo: { input: { required: { format: ['COMFY_DYNAMICCOMBO_V3', {}] } } },
    };
    expect(compileH3(base, current, [], 42, 'test')['19'].inputs['format.codec']).toBe('h264');
    expect(compileH3(base, info, [], 42, 'test')['19'].inputs.codec).toBe('h264');
  });
  it('uses the native AV topology and frame grid', () => {
    const g = compileH3(base, info, [], 42, 'test');
    expect(g['10'].inputs.length).toBe(158);
    expect(g['13'].inputs.sampler_name).toBe('res_multistep');
    expect(g['14'].inputs.steps).toBe(30);
    expect(g['18'].inputs.audio).toEqual(['17', 0]);
    expect(g['11'].inputs.noise_seed).toBe(42);
  });
  it('requires aligned dimensions, a prompt and mode-specific media', () => {
    expect(() => compileH3({ ...base, height: 720 }, info, [], 1, 'test')).toThrow();
    expect(() => compileH3({ ...base, prompt: '' }, info, [], 1, 'test')).toThrow();
    expect(() => compileH3({ ...base, mode: 'image' }, info, [], 1, 'test')).toThrow('first frame');
    expect(() => compileH3({ ...base, mode: 'reference' }, info, [], 1, 'test')).toThrow(
      'reference',
    );
  });
  it('maps uploaded I2V images and ordered reference sockets', () => {
    const upload = { id: imageId, kind: 'image' as const, name: 'folder/input.png' };
    const g = compileH3({ ...base, mode: 'image', firstFrame: imageId }, info, [upload], 1, 'test');
    expect(g['100'].inputs.image).toBe('folder/input.png');
    expect(g['10'].inputs.first_frame).toEqual(['100', 0]);
    const ref = compileH3(
      { ...base, mode: 'reference', references: [imageId], quality: 'turbo8' },
      info,
      [upload],
      1,
      'test',
    );
    expect(ref['10'].inputs['ref_images.ref_image_0']).toEqual(['100', 0]);
    expect(ref['1'].inputs.unet_name).toContain('ref2va');
    expect(ref['14'].inputs.steps).toBe(8);
    expect(ref['6'].inputs.shift_video).toBe(6);
    expect(ref['10'].inputs.ref_image_size).toBe('match');
    const maximum = compileH3(
      { ...base, mode: 'reference', references: [imageId], refImageSize: 'max' },
      info,
      [upload],
      1,
      'max',
    );
    expect(maximum['10'].inputs.ref_image_size).toBe('max');
    expect(maximum['10'].inputs.width).toBe(base.width);
    expect(() =>
      compileH3(
        { ...base, mode: 'reference', references: [imageId], refImageSize: 'max' },
        {
          ...info,
          MiniMaxH3ReferenceToVideo: { input: { required: { ref_image_size: [['match']] } } },
        },
        [upload],
        1,
        'unsupported',
      ),
    ).toThrow('does not support');
  });
  it('fails before queueing missing models or nodes', () => {
    expect(() =>
      compileH3(base, { ...info, SaveVideo: undefined } as unknown as ObjectInfo, [], 1, 'test'),
    ).toThrow('SaveVideo');
    expect(() =>
      compileH3(
        { ...base, quality: 'turbo8' },
        { ...info, LoraLoaderModelOnly: {} },
        [],
        1,
        'test',
      ),
    ).toThrow('LoRA');
  });
  it('rounds frames up without exceeding one H3 temporal interval', () => {
    for (const s of [1, 3, 6, 10, 15]) {
      const n = h3Frames(s);
      expect(n % 17).toBe(5);
      expect(n).toBeGreaterThanOrEqual(s * 24);
      expect(n - s * 24).toBeLessThan(17);
    }
  });
  it('extracts videos only from the declared save node', () => {
    expect(
      h3Outputs({
        '72': { images: [{ filename: 'preview.png' }] },
        '19': { images: [{ filename: 'result.mp4', subfolder: 'x', type: 'output' }] },
      }),
    ).toEqual([{ filename: 'result.mp4', subfolder: 'x', type: 'output' }]);
    expect(h3Outputs({ '18': { videos: [{ filename: 'wrong.mp4' }] } })).toEqual([]);
  });
  it('resolves current reusable records and rejects cross-project assets', () => {
    const recordId = '22222222-2222-4222-8222-222222222222';
    const draft = {
      projectId: imageId,
      moduleId: 'h3',
      values: { ...base, mode: 'reference', characterIds: [recordId] },
    };
    const record = {
      id: recordId,
      kind: 'character' as const,
      name: 'Mara',
      description: 'Red hair',
      assetIds: [imageId],
    };
    const asset = {
      id: imageId,
      projectId: null,
      name: 'Mara.png',
      kind: 'image' as const,
      mime: 'image/png',
      url: '',
      createdAt: '',
    };
    const r = generatorAdapters.h3.resolve(draft, [record], () => asset);
    const oldTextDraft = generatorAdapters.h3.resolve(
      { ...draft, values: { ...draft.values, mode: 'text' } },
      [record],
      () => asset,
    );
    expect(oldTextDraft.values.mode).toBe('reference');
    expect(oldTextDraft.assetIds).toEqual([imageId]);
    expect(r.values.prompt).toContain('<Picture 1>');
    expect(r.assetIds).toEqual([imageId]);
    expect(() =>
      generatorAdapters.h3.resolve(draft, [record], () => ({ ...asset, projectId: recordId })),
    ).toThrow('different project');
  });
});
