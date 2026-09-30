import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { modelingSchema } from '../src/modules/modeling/definition';
import { modelingImagePrompt } from '../src/modules/modeling/prompt';
import { modelingAdapter } from '../src/modules/modeling/adapter';
import { compileModeling, modelingOutputs } from '../src/modules/modeling/workflow';
import graph from '../src/modules/modeling/graph.json';
import type { Asset } from '../shared/domain';
import type { ObjectInfo } from '../shared/modules';
const projectId = randomUUID(),
  sourceId = randomUUID();
const info: ObjectInfo = Object.fromEntries(Object.values(graph).map((n) => [n.class_type, {}]));
info.UNETLoader = {
  input: { required: { unet_name: [['pixal3d_multiview_int8_convrot.safetensors']] } },
};
info.CLIPVisionLoader = {
  input: { required: { clip_name: [['dino_v3_L_naf_fp32.safetensors']] } },
};
info.VAELoader = {
  input: {
    required: {
      vae_name: [
        ['trellis_2_shape_vae_bf16.safetensors', 'trellis_2_texture_vae_bf16.safetensors'],
      ],
    },
  },
};
info.LoadBackgroundRemovalModel = {
  input: { required: { bg_removal_name: [['birefnet.safetensors']] } },
};
describe('Modeling', () => {
  it('uses distinct character and asset prompts with the chosen look', () => {
    expect(
      modelingImagePrompt({ mode: 'character', look: 'animated', description: 'An explorer' }),
    ).toContain('neutral A-pose');
    expect(
      modelingImagePrompt({ mode: 'character', look: 'animated', description: 'An explorer' }),
    ).toContain('Stylized animated');
    expect(
      modelingImagePrompt({ mode: 'asset', look: 'realistic', description: 'A chest' }),
    ).toContain('standalone game prop');
    expect(
      modelingImagePrompt({ mode: 'asset', look: 'realistic', description: 'A chest' }),
    ).toContain('physically plausible');
  });
  it('rejects foreign, missing and non-image source assets', () => {
    const draft = { projectId, moduleId: 'modeling', values: { sourceImage: sourceId } };
    const asset: Asset = {
      id: sourceId,
      projectId: randomUUID(),
      kind: 'image',
      name: 'source.png',
      mime: 'image/png',
      url: 'oyama://media/' + sourceId,
      createdAt: '',
    };
    expect(() => modelingAdapter.resolve(draft, [], () => asset)).toThrow('available image');
    expect(() =>
      modelingAdapter.resolve(draft, [], () => ({ ...asset, projectId, missing: true })),
    ).toThrow('available image');
    expect(() =>
      modelingAdapter.resolve(draft, [], () => ({ ...asset, projectId, kind: 'model' })),
    ).toThrow('available image');
  });
  it('compiles bounded PBR output with managed source, seeds and triangle budget', () => {
    const compiled = compileModeling(
      { sourceImage: sourceId, targetFaces: 10000, textureSize: 2048 },
      info,
      [{ id: sourceId, kind: 'image', name: 'managed.png' }],
      123,
      'owned/job',
    );
    expect(compiled['364'].inputs.image).toBe('managed.png');
    expect(compiled['186'].inputs.target_face_count).toBe(10000);
    expect(compiled['147'].inputs.texture_size).toBe(2048);
    expect(compiled['372'].inputs.filename_prefix).toBe('owned/job');
    expect(compiled['3'].inputs.seed).toBe(123);
    expect(compiled['18'].inputs.seed).toBe(42);
    expect(compiled['12'].inputs.seed).toBe(43);
    expect(compiled['94'].inputs.target_resolution).toBe(1536);
    expect(compiled['241'].inputs).toMatchObject({
      resolution: 768,
      smooth_iters: 20,
      sign_mode: 'udf',
    });
    expect(compiled['210'].inputs).toMatchObject({ occlusion: ['233', 0], normal_map: ['224', 0] });
    expect(graph['186'].inputs.target_face_count).toBe(700000);
    expect(() =>
      compileModeling(
        { sourceImage: sourceId },
        {},
        [{ id: sourceId, kind: 'image', name: 'managed.png' }],
        123,
        'owned/job',
      ),
    ).toThrow('Missing ComfyUI node');
    expect(modelingSchema.safeParse({ targetFaces: 0 }).success).toBe(false);
  });
  it('collects only GLB files from the declared save node', () => {
    expect(
      modelingOutputs({
        '372': {
          mesh: [
            { filename: 'asset.glb', subfolder: '3d', type: 'output' },
            { filename: 'source.png' },
          ],
        },
        other: { filename: 'unrelated.glb' },
      }),
    ).toEqual([{ filename: 'asset.glb', subfolder: '3d', type: 'output' }]);
  });
});
