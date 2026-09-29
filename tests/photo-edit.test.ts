import { describe, expect, it } from 'vitest';
import type { ObjectInfo } from '../shared/modules';
import {
  compilePhotoEdit,
  photoEditOutputs,
  selectFireRed,
} from '../src/modules/photo-edit/workflow';
import { photoEditDefaults, photoEditNodes } from '../src/modules/photo-edit/definition';
import { generatorAdapters } from '../electron/main/modules';

const sourceImage = '11111111-1111-4111-8111-111111111111';
const reference = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';
const info: ObjectInfo = Object.fromEntries(photoEditNodes.map((node) => [node, {}]));
info.UNETLoader = {
  input: { required: { unet_name: [['FireRed-Image-Edit-1.1_fp8mixed_comfy.safetensors']] } },
};
info.CLIPLoader = {
  input: { required: { clip_name: [['qwen_2.5_vl_7b_fp8_scaled.safetensors']] } },
};
info.VAELoader = { input: { required: { vae_name: [['qwen_image_vae.safetensors']] } } };
info.LoraLoaderModelOnly = {
  input: {
    required: { lora_name: [['FireRed-Image-Edit-1.0-Lightning-8steps-v1.1.safetensors']] },
  },
};
const settings = { ...photoEditDefaults, sourceImage, prompt: 'Change the cube to blue.' };
const uploads = [
  { id: sourceImage, kind: 'image' as const, name: 'source.png' },
  { id: reference, kind: 'image' as const, name: 'reference.png' },
];

describe('FireRed Photo Edit', () => {
  it('compiles source-conditioned Turbo with Lightning and reference ordering', () => {
    const graph = compilePhotoEdit(
      { ...settings, references: [reference, sourceImage] },
      info,
      uploads,
      17,
      'edit',
    );
    expect(graph['5'].inputs).toMatchObject({ width: 768, height: 512, crop: 'center' });
    expect(graph['6'].inputs.pixels).toEqual(['5', 0]);
    expect(graph['7'].inputs).toMatchObject({
      image1: ['5', 0],
      image2: ['15', 0],
      image3: ['16', 0],
    });
    expect(graph['9'].inputs).toEqual({ model: ['13', 0], shift: 3.1 });
    expect(graph['11'].inputs).toMatchObject({ steps: 8, cfg: 1, denoise: 1 });
    expect(
      photoEditOutputs({
        '14': { images: [{ filename: 'edit.png' }] },
        '12': { images: [{ filename: 'preview.png' }] },
      }),
    ).toEqual([{ filename: 'edit.png', subfolder: '', type: 'output' }]);
  });
  it('uses 40-step Quality without requiring Lightning and supports installed GGUF', () => {
    const gguf: ObjectInfo = {
      ...info,
      LoraLoaderModelOnly: {},
      UnetLoaderGGUF: {
        input: { required: { unet_name: [['FireRed-Image-Edit-1.1-Q4_K_M.gguf']] } },
      },
    };
    expect(selectFireRed(gguf).loader).toBe('UnetLoaderGGUF');
    const graph = compilePhotoEdit(
      { ...settings, profile: 'quality' },
      gguf,
      uploads,
      1,
      'quality',
    );
    expect(graph['1'].class_type).toBe('UnetLoaderGGUF');
    expect(graph['13']).toBeUndefined();
    expect(graph['11'].inputs).toMatchObject({ steps: 40, cfg: 4 });
    expect(() => compilePhotoEdit(settings, gguf, uploads, 1, 'x')).toThrow('Lightning');
    expect(() =>
      compilePhotoEdit(
        { ...settings, references: [reference, reference, reference] },
        info,
        uploads,
        1,
        'x',
      ),
    ).toThrow();
  });
  it('inherits the Ripple canvas and returns actual result dimensions without losing source settings', () => {
    const asset = {
      id: sourceImage,
      projectId,
      kind: 'image' as const,
      name: 'edit.png',
      mime: 'image/png',
      url: '',
      createdAt: '',
      dimensions: { width: 832, height: 480 },
    };
    const photo = generatorAdapters['photo-edit'].applyAsset?.(
      {
        projectId,
        moduleId: 'photo-edit',
        values: { prompt: 'Keep this instruction', profile: 'quality' },
      },
      'sourceImage',
      asset,
      { width: 512, height: 320 },
    );
    expect(photo?.values).toMatchObject({
      width: 512,
      height: 320,
      prompt: 'Keep this instruction',
      sourceImage,
    });
    const ripple = generatorAdapters.ripple.applyAsset?.(
      {
        projectId,
        moduleId: 'ripple',
        values: { sourceVideo: reference, duration: 2, strength: 1.5 },
      },
      'replacementFrame',
      asset,
    );
    expect(ripple?.values).toMatchObject({
      sourceVideo: reference,
      replacementFrame: sourceImage,
      duration: 2,
      strength: 1.5,
      width: 832,
      height: 480,
    });
  });
});
