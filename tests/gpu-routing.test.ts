import { expect, it } from 'vitest';
import { applyGpuRouting, gpuRoutingDefaults, resolvedRoutes } from '../shared/gpu-routing';
import { settingsSchema } from '../shared/domain';
import type { ComfyGraph, ObjectInfo } from '../shared/modules';
const info: ObjectInfo = Object.fromEntries(
  ['SelectModelDevice', 'SelectCLIPDevice', 'SelectVAEDevice'].map((name) => [
    name,
    {
      input: {
        required: { device: [[...(name === 'SelectVAEDevice' ? [] : ['cpu']), 'gpu:2', 'gpu:4']] },
      },
    },
  ]),
);
const devices = [{ index: 4 }, { index: 2 }];
const graph: ComfyGraph = {
  '1': { class_type: 'UNETLoader', inputs: { unet_name: 'model' } },
  '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'encoder' } },
  '3': { class_type: 'VAELoader', inputs: { vae_name: 'video_vae' } },
  '4': { class_type: 'VAELoader', inputs: { vae_name: 'audio_vae' } },
  '5': { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0] } },
  '10': {
    class_type: 'Conditioning',
    inputs: { clip: ['2', 0], vae: ['3', 0], audio_vae: ['4', 0] },
  },
  '20': { class_type: 'Decode', inputs: { vae: ['3', 0] } },
};
it('routes every consumer before LoRA, input encoding and decoding, preserving actual GPU indexes', () => {
  const routing = { ...gpuRoutingDefaults, preset: 'split' as const };
  expect(resolvedRoutes(routing, devices)).toEqual({
    diffusion: 'gpu:2',
    textEncoder: 'gpu:4',
    videoVae: 'gpu:4',
    audioVae: 'gpu:4',
  });
  const result = applyGpuRouting(graph, info, routing, devices);
  expect(result.graph['5'].inputs.model).toEqual(['900', 0]);
  expect(result.graph['900'].inputs).toEqual({ model: ['1', 0], device: 'gpu:2' });
  expect(result.graph['10'].inputs.vae).toEqual(['902', 0]);
  expect(result.graph['20'].inputs.vae).toEqual(['902', 0]);
  expect(result.graph['903'].inputs.device).toBe('gpu:4');
  expect(graph['5'].inputs.model).toEqual(['1', 0]);
});
it('rejects unsupported CPU VAE, missing nodes/devices and single-device split before submission', () => {
  expect(() =>
    applyGpuRouting(
      graph,
      info,
      { ...gpuRoutingDefaults, preset: 'custom', videoVae: 'cpu' },
      devices,
    ),
  ).toThrow('does not advertise');
  expect(() =>
    applyGpuRouting(graph, {}, { ...gpuRoutingDefaults, preset: 'single' }, devices),
  ).toThrow('does not advertise');
  expect(() => resolvedRoutes({ ...gpuRoutingDefaults, preset: 'split' }, [{ index: 2 }])).toThrow(
    'two advertised',
  );
  expect(applyGpuRouting(graph, {}, gpuRoutingDefaults, []).graph).toEqual(graph);
  expect(
    settingsSchema.parse({
      comfyUrl: 'http://127.0.0.1:8188',
      gpuRouting: { preset: 'custom', diffusion: 'gpu:4' },
    }).gpuRouting?.textEncoder,
  ).toBe('auto');
  expect(settingsSchema.parse({ comfyUrl: 'http://127.0.0.1:8188' }).livePreview).toEqual({
    frames: 8,
    fps: 24,
  });
  expect(() =>
    settingsSchema.parse({
      comfyUrl: 'http://127.0.0.1:8188',
      livePreview: { frames: 33, fps: 24 },
    }),
  ).toThrow();
});
