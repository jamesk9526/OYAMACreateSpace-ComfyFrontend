import { expect, it } from 'vitest';
import { h3Availability } from '../src/modules/h3/definition';
import type { Readiness } from '../shared/domain';

const ready: Readiness = {
  connected: true,
  mock: false,
  message: 'Connected',
  devices: [],
  models: {
    diffusion: ['minimax_h3_fl2va_pruned_int8_convrot.safetensors'],
    encoder: ['qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors'],
    vae: ['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_audio_vae_fp32.safetensors'],
    lora: [],
  },
  nodes: [
    'MiniMaxH3ImageToVideo',
    'UNETLoader',
    'CLIPLoader',
    'VAELoader',
    'RandomNoise',
    'KSamplerSelect',
    'BasicScheduler',
    'VAEDecode',
    'VAEDecodeAudio',
    'BasicGuider',
    'SamplerCustomAdvanced',
    'CreateVideo',
    'SaveVideo',
  ],
};

it('gates H3 generation on the selected graph family and installed recipe', () => {
  expect(h3Availability(ready, 'text', 'native').ready).toBe(true);
  expect(h3Availability(ready, 'reference', 'native').message).toContain('ref2va diffusion model');
  expect(h3Availability(ready, 'text', 'turbo8').message).toContain('Turbo 8 LoRA');
  expect(
    h3Availability(
      { ...ready, nodes: ready.nodes.filter((node) => node !== 'SaveVideo') },
      'text',
      'native',
    ).message,
  ).toContain('SaveVideo');
});
