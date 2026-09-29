import { describe, expect, it } from 'vitest';
import { collectWorkflowOutputs, type ObjectInfo } from '../shared/modules';
import { zImageDefaults, zImageNegative } from '../src/modules/zimage/definition';
import { compileZImage, zImageOutputs } from '../src/modules/zimage/workflow';
import { generatorAdapters } from '../electron/main/modules';
import { moduleDefaults } from '../src/modules/registry';

const info: ObjectInfo = Object.fromEntries(
  [
    'CLIPTextEncode',
    'ConditioningZeroOut',
    'EmptySD3LatentImage',
    'ModelSamplingAuraFlow',
    'KSampler',
    'VAEDecode',
    'SaveImage',
    'PreviewImage',
  ].map((name) => [name, {}]),
);
info.UNETLoader = {
  input: {
    required: {
      unet_name: [['z_image_turbo_bf16.safetensors', 'z_image_bf16.safetensors']],
    },
  },
};
info.CLIPLoader = { input: { required: { clip_name: [['qwen_3_4b.safetensors']] } } };
info.VAELoader = { input: { required: { vae_name: [['ae.safetensors']] } } };

describe('ZImage workflow', () => {
  it('compiles Turbo with zeroed negatives and its sampling defaults', () => {
    const graph = compileZImage(
      { ...zImageDefaults, prompt: 'A limestone observatory' },
      info,
      [],
      7,
      'test',
    );
    expect(graph['1'].inputs.unet_name).toBe('z_image_turbo_bf16.safetensors');
    expect(graph['5'].class_type).toBe('ConditioningZeroOut');
    expect(graph['8'].inputs).toMatchObject({ seed: 7, steps: 8, cfg: 1 });
    expect(graph['10'].class_type).toBe('SaveImage');
  });

  it('compiles Base with negative conditioning and verified defaults', () => {
    const graph = compileZImage(
      {
        ...zImageDefaults,
        variant: 'base',
        prompt: 'A quiet portrait',
        negative: zImageNegative,
        steps: 40,
        cfg: 4,
      },
      info,
      [],
      42,
      'base',
    );
    expect(graph['1'].inputs.unet_name).toBe('z_image_bf16.safetensors');
    expect(graph['5'].class_type).toBe('CLIPTextEncode');
    expect(graph['5'].inputs.text).toContain('low quality');
    expect(graph['8'].inputs).toMatchObject({ steps: 40, cfg: 4 });
  });

  it('rejects invalid variant settings and missing models or nodes', () => {
    expect(() =>
      compileZImage(
        { ...zImageDefaults, variant: 'base', prompt: 'x', steps: 8, cfg: 1 },
        info,
        [],
        1,
        'x',
      ),
    ).toThrow('Base steps');
    expect(() =>
      compileZImage(
        { ...zImageDefaults, prompt: 'x' },
        { ...info, UNETLoader: { input: { required: { unet_name: [[]] } } } },
        [],
        1,
        'x',
      ),
    ).toThrow('Turbo diffusion model');
    expect(() =>
      compileZImage(
        { ...zImageDefaults, prompt: 'x' },
        { ...info, SaveImage: undefined } as unknown as ObjectInfo,
        [],
        1,
        'x',
      ),
    ).toThrow('SaveImage');
  });

  it('extracts only image files from the declared save node', () => {
    const history = {
      '3': { images: [{ filename: 'input.png' }] },
      '10': { images: [{ filename: 'result.png', subfolder: 'ZImage', type: 'output' }] },
      '11': { images: [{ filename: 'preview.png' }] },
    };
    expect(zImageOutputs(history)).toEqual([
      { filename: 'result.png', subfolder: 'ZImage', type: 'output' },
    ]);
    expect(collectWorkflowOutputs(history, ['10'], 'video')).toEqual([]);
  });

  it('owns its defaults and hands a generated image to H3 without losing its prompt', () => {
    expect(moduleDefaults('missing')).toEqual({});
    expect(moduleDefaults('zimage')).toMatchObject({ variant: 'turbo', steps: 8, cfg: 1 });
    const projectId = '11111111-1111-4111-8111-111111111111';
    const asset = {
      id: '22222222-2222-4222-8222-222222222222',
      projectId,
      name: 'frame.png',
      kind: 'image' as const,
      mime: 'image/png',
      url: '',
      createdAt: '',
    };
    const draft = generatorAdapters.h3.applyAsset?.(
      {
        projectId,
        moduleId: 'h3',
        values: { prompt: 'Keep this authored shot description' },
      },
      'firstFrame',
      asset,
    );
    expect(draft?.values).toMatchObject({
      prompt: 'Keep this authored shot description',
      mode: 'image',
      firstFrame: asset.id,
    });
  });
});
