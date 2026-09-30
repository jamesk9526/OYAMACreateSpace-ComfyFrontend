import { describe, expect, it } from 'vitest';
import type { Asset, Job, LibraryRecord } from '../shared/domain';
import type { ObjectInfo } from '../shared/modules';
import {
  continueDefaults,
  continueSourceRange,
  continueTiming,
} from '../src/modules/continue/definition';
import { compileContinue } from '../src/modules/continue/workflow';
import { continueAdapter } from '../src/modules/continue/adapter';

const sourceId = '11111111-1111-4111-8111-111111111111';
const frameId = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';
const source: Asset = {
  id: sourceId,
  projectId,
  kind: 'video',
  mime: 'video/mp4',
  name: 'source.mp4',
  url: '',
  createdAt: '',
  media: {
    duration: 2.1,
    streams: [],
    video: {
      kind: 'video',
      codec: 'h264',
      width: 512,
      height: 320,
      fps: 24,
      frames: 49,
      duration: 49 / 24,
    },
    audio: null,
  },
};
const frame: Asset = { ...source, id: frameId, kind: 'image', mime: 'image/png', media: undefined };
const settings = {
  ...continueDefaults,
  sourceVideo: sourceId,
  firstFrame: frameId,
  prompt: 'Turns left.',
  duration: 1,
};
const info: ObjectInfo = Object.fromEntries(
  [
    'MiniMaxH3ImageToVideo',
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
  ].map((name) => [name, {}]),
);
info.UNETLoader = {
  input: { required: { unet_name: [['minimax_h3_fl2va_pruned_int8_convrot.safetensors']] } },
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
  input: { required: { lora_name: [['minimax_h3_fl2v_turbo_8step_v1.0.safetensors']] } },
};
describe('Continue last-frame beat', () => {
  it('snapshots owned beat changes, suppresses conflicting inherited text, and carries choices forward', () => {
    const characterId = '44444444-4444-4444-8444-444444444444';
    const locationId = '55555555-5555-4555-8555-555555555555';
    const records: LibraryRecord[] = [
      {
        id: characterId,
        kind: 'character',
        name: 'Mara',
        description: 'Red hair',
        identityNotes: 'Freckles',
        assetIds: [],
      },
      {
        id: locationId,
        kind: 'location',
        name: 'Atrium',
        description: 'Stone arches',
        lighting: 'Dawn',
        assetIds: [],
      },
    ];
    const sourceJob = {
      id: projectId,
      projectId,
      status: 'complete',
      assetIds: [sourceId],
      snapshot: { prompt: 'Old actor in old room', characterIds: [frameId] },
    } as unknown as Job;
    const resolved = continueAdapter.resolve(
      {
        projectId,
        moduleId: 'continue',
        values: { ...settings, replacements: { characterId, locationId } },
      },
      records,
      (id) => (id === sourceId ? source : frame),
      [sourceJob],
    );
    expect(resolved.values.prompt).toContain('Change character to Mara');
    expect(resolved.values.prompt).toContain('Change location to Atrium');
    expect(resolved.values.prompt).not.toContain('Old actor in old room');
    expect(resolved.values.effectiveCharacterIds).toEqual([characterId]);
    expect(resolved.values.effectiveLocationIds).toEqual([locationId]);
    const nextSource = { ...source, id: '66666666-6666-4666-8666-666666666666' };
    const nextJob = { ...sourceJob, assetIds: [nextSource.id], snapshot: resolved.values } as Job;
    const next = continueAdapter.resolve(
      { projectId, moduleId: 'continue', values: { ...settings, sourceVideo: nextSource.id } },
      records,
      (id) => (id === nextSource.id ? nextSource : frame),
      [nextJob],
    );
    expect(next.values.sourceCharacterIds).toEqual([characterId]);
    expect(next.values.sourceLocationIds).toEqual([locationId]);
    const joined = { ...nextSource, id: '77777777-7777-4777-8777-777777777777' };
    const joinedNext = continueAdapter.resolve(
      {
        projectId,
        moduleId: 'continue',
        values: { ...settings, sourceVideo: joined.id, sourceBeatJobId: nextJob.id },
      },
      records,
      (id) => (id === joined.id ? joined : frame),
      [nextJob],
    );
    expect(joinedNext.values.sourceCharacterIds).toEqual([characterId]);
    expect(() =>
      continueAdapter.resolve(
        {
          projectId,
          moduleId: 'continue',
          values: { ...settings, replacements: { characterId: locationId } },
        },
        records,
        (id) => (id === sourceId ? source : frame),
        [sourceJob],
      ),
    ).toThrow('replacement is unavailable');
  });
  it('keeps script dialogue guidance and audio carry in the resolved job snapshot', () => {
    const sourceJob: Job = {
      id: projectId,
      projectId,
      moduleId: 'h3',
      status: 'complete',
      message: '',
      progress: 1,
      createdAt: '',
      endpoint: '',
      snapshot: { prompt: 'The actor says hello.' },
      templateVersion: 'test',
      assetIds: [sourceId],
    };
    for (const dialoguePolicy of ['none', 'allow'] as const) {
      const resolved = continueAdapter.resolve(
        {
          projectId,
          moduleId: 'continue',
          values: { ...settings, dialoguePolicy, audioCarry: false },
        },
        [],
        (id) => (id === sourceId ? source : frame),
        [sourceJob],
      );
      expect(resolved.values.prompt).toContain('Source scene context:');
      expect(resolved.values.prompt).toContain(
        dialoguePolicy === 'none'
          ? 'no spoken dialogue in the new beat'
          : 'new speech may differ from the source',
      );
      expect(resolved.values.audioCarry).toBe(false);
    }
  });
  it('honors custom Turbo and Native steps while keeping profile defaults available', () => {
    for (const quality of ['turbo8', 'native'] as const) {
      const graph = compileContinue(
        { ...settings, quality, nativeDefaults: false, steps: 12 },
        info,
        [{ id: frameId, kind: 'image', name: 'frame.png' }],
        123,
        'custom-steps',
      );
      expect(graph['14'].inputs.steps).toBe(12);
      const defaults = compileContinue(
        { ...settings, quality, nativeDefaults: true, steps: 12 },
        info,
        [{ id: frameId, kind: 'image', name: 'frame.png' }],
        123,
        'profile-steps',
      );
      expect(defaults['14'].inputs.steps).toBe(quality === 'turbo8' ? 8 : 30);
    }
  });
  it('passes global preview frame and playback settings to its H3 graph', () => {
    const previewInfo = {
      ...info,
      MiniMaxH3LivePreview: {
        input: { required: { tae_decoder: [['none', 'taeh3_decoder.safetensors']] } },
      },
    };
    const graph = compileContinue(
      { ...settings, previewFrames: 6, previewFps: 48 },
      previewInfo,
      [{ id: frameId, kind: 'image', name: 'frame.png' }],
      123,
      'preview-settings',
    );
    expect(graph['7'].inputs.preview_frames).toBe(6);
    expect(graph['7'].inputs.preview_fps).toBe(48);
  });
  it('reuses only owned compatible H3 checkpoints and wires the exact previous latent', () => {
    const checkpoint = {
      ...source,
      generationContext: {
        format: 'h3-av/1' as const,
        jobId: projectId,
        width: 512,
        height: 320,
        frames: 39,
        available: true,
      },
    };
    const values = {
      ...settings,
      method: 'motion' as const,
      width: 512,
      height: 320,
      contextMode: 'latent' as const,
    };
    const resolved = continueAdapter.resolve(
      { projectId, moduleId: 'continue', values },
      [],
      () => checkpoint,
    );
    expect(resolved.values.contextSourceAsset).toBe(sourceId);
    expect(resolved.values.contextMethod).toBe('latent');
    const motionInfo: ObjectInfo = {
      ...info,
      MiniMaxH3SaveLatent: {},
      MiniMaxH3LoadLatent: {},
      MiniMaxH3VideoExtender: { input: { optional: { prev_latent: ['LATENT'] } } },
      MiniMaxH3LoopTrim: {},
      LoadVideo: {},
      GetVideoComponents: {},
    };
    const graph = compileContinue(
      { ...resolved.values, contextUploadPath: `CreateSpaceContext/${sourceId}.safetensors` },
      motionInfo,
      [{ id: sourceId, kind: 'video', name: 'tail.mp4' }],
      123,
      'exact-branch',
    );
    expect(graph['202'].inputs.prev_latent).toEqual(['205', 0]);
    expect(graph['202'].inputs.prev_audio).toBeUndefined();
    expect(graph['205'].inputs.latent_path).toBe(`CreateSpaceContext/${sourceId}.safetensors`);
    expect(graph['204'].inputs).toEqual({
      latent: ['15', 0],
      filename_prefix: 'exact-branch-context',
      clip_index: 1,
    });
    for (const incompatible of [
      source,
      { ...checkpoint, generationContext: { ...checkpoint.generationContext, available: false } },
      { ...checkpoint, generationContext: { ...checkpoint.generationContext, width: 832 } },
      { ...checkpoint, generationContext: { ...checkpoint.generationContext, frames: 5 } },
    ])
      expect(() =>
        continueAdapter.resolve(
          { projectId, moduleId: 'continue', values },
          [],
          () => incompatible,
        ),
      ).toThrow('compatible');
    const fallback = continueAdapter.resolve(
      { projectId, moduleId: 'continue', values: { ...values, contextMode: 'auto' } },
      [],
      () => source,
    );
    expect(fallback.values.contextMethod).toBe('frames');
    expect(fallback.values.contextSourceAsset).toBeUndefined();
    const forced = continueAdapter.resolve(
      { projectId, moduleId: 'continue', values: { ...values, contextMode: 'frames' } },
      [],
      () => checkpoint,
    );
    expect(forced.values.contextMethod).toBe('frames');
    expect(() =>
      compileContinue(
        { ...resolved.values, contextUploadPath: '../unowned.safetensors' },
        motionInfo,
        [{ id: sourceId, kind: 'video', name: 'tail.mp4' }],
        123,
        'bad',
      ),
    ).toThrow('Managed');
  });
  it('pins only a bounded motion tail and trims the repeated visual/audio context', () => {
    const motionInfo = {
      ...info,
      ...Object.fromEntries(
        ['MiniMaxH3VideoExtender', 'MiniMaxH3LoopTrim', 'LoadVideo', 'GetVideoComponents'].map(
          (name) => [name, {}],
        ),
      ),
    };
    for (const contextFrames of [5, 22, 39] as const) {
      const motion = { ...settings, method: 'motion' as const, firstFrame: null, contextFrames };
      const graph = compileContinue(
        motion,
        motionInfo,
        [{ id: sourceId, kind: 'video', name: 'tail.mp4' }],
        1,
        'motion',
      );
      expect(graph['10'].inputs.length).toBe(17 + contextFrames);
      expect(graph['10'].inputs.first_frame).toBeUndefined();
      expect(graph['12'].inputs.conditioning).toEqual(['202', 0]);
      expect(graph['202'].inputs).toMatchObject({
        context_length: contextFrames,
        anchor_mode: 'head',
        prev_audio: ['201', 1],
      });
      expect(graph['203'].inputs.trim_frames).toEqual(['202', 1]);
      expect(graph['18'].inputs).toMatchObject({ images: ['203', 0], audio: ['203', 1] });
      const snapshot = continueAdapter.resolve(
        { projectId, moduleId: 'continue', values: motion },
        [],
        () => source,
      );
      expect(snapshot.assetIds).toEqual([sourceId]);
      expect(snapshot.values).toMatchObject({
        renderFrames: 17 + contextFrames,
        deliveredDuration: 17 / 24,
        trimFrames: contextFrames,
      });
    }
    expect(() =>
      compileContinue({ ...settings, method: 'motion' }, info, [], 1, 'missing'),
    ).toThrow();
    expect(() =>
      continueAdapter.resolve(
        {
          projectId,
          moduleId: 'continue',
          values: { ...settings, method: 'motion', contextFrames: 39 },
        },
        [],
        () => ({
          ...source,
          media: { ...source.media!, video: { ...source.media!.video!, duration: 1 } },
        }),
      ),
    ).toThrow('too short');
  });
  it('retains source through the selected frame and rejects out-of-range selections', () => {
    expect(
      continueSourceRange({ ...settings, method: 'selected', selectedSeconds: 0.5 }, source),
    ).toEqual({ frameTime: 0.5, retainedSourceFrames: 13, retainedDuration: 13 / 24 });
    expect(
      continueSourceRange({ ...settings, method: 'selected', selectedSeconds: 0 }, source)
        .retainedSourceFrames,
    ).toBe(1);
    expect(continueSourceRange(settings, source).retainedSourceFrames).toBe(49);
    expect(() =>
      continueSourceRange({ ...settings, method: 'selected', selectedSeconds: 2.1 }, source),
    ).toThrow('outside');
  });
  it('selects nearest H3 grid while retaining every generated head frame', () => {
    expect(continueTiming(1)).toEqual({ frames: 22, duration: 22 / 24, trimFrames: 0 });
    expect(continueTiming(2).frames).toBe(56);
    for (let seconds = 1; seconds <= 15; seconds += 0.5)
      expect((continueTiming(seconds).frames - 5) % 17).toBe(0);
    const graph = compileContinue(
      settings,
      info,
      [{ id: frameId, name: 'last.png', kind: 'image' }],
      12,
      'test',
    );
    expect(graph['10'].inputs).toMatchObject({ first_frame: ['100', 0], length: 22 });
    expect(graph['14'].inputs.steps).toBe(8);
    expect(graph['18'].inputs.audio).toEqual(['17', 0]);
    expect(graph['10'].inputs.ref_frames).toBeUndefined();
  });
  it('snapshots inherited context and action without overwriting the authored draft', () => {
    const draft = { projectId, moduleId: 'continue', values: settings };
    const job = {
      id: 'original',
      status: 'complete',
      assetIds: [sourceId],
      snapshot: { prompt: 'A quiet scene.', characterIds: [frameId] },
    } as unknown as Job;
    const asset = (id: string) => (id === sourceId ? source : frame);
    const resolved = continueAdapter.resolve(draft, [], asset, [job]);
    expect(resolved.values).toMatchObject({
      prompt: 'Source scene context:\nA quiet scene.\n\nNext action:\nTurns left.',
      actionPrompt: 'Turns left.',
      sourceJobId: 'original',
      sourceDuration: 49 / 24,
      renderFrames: 22,
      deliveredDuration: 22 / 24,
      duration: 1,
      trimFrames: 0,
    });
    expect(draft.values.prompt).toBe('Turns left.');
    const solo = continueAdapter.resolve(
      { ...draft, values: { ...settings, inheritContext: false } },
      [],
      asset,
      [job],
    );
    expect(solo.values.prompt).toBe('Next action:\nTurns left.');
    expect(() =>
      continueAdapter.resolve(draft, [], () => ({ ...source, projectId: frameId }), [job]),
    ).toThrow('different project');
  });
  it('inherits source canvas on handoff and supports long merged context for Native', () => {
    expect(
      continueAdapter.applyAsset?.(
        { projectId, moduleId: 'continue', values: { prompt: 'Keep action', duration: 2 } },
        'sourceVideo',
        source,
      )?.values,
    ).toMatchObject({
      sourceVideo: sourceId,
      firstFrame: null,
      width: 512,
      height: 320,
      duration: 2,
      prompt: 'Keep action',
    });
    const graph = compileContinue(
      { ...settings, quality: 'native', prompt: 'x'.repeat(11000), actionPrompt: 'Turns left.' },
      info,
      [{ id: frameId, name: 'last.png', kind: 'image' }],
      1,
      'native',
    );
    expect(graph['14'].inputs.steps).toBe(30);
    expect(graph['5']).toBeUndefined();
    expect(graph['10'].inputs.prompt).toHaveLength(11000);
  });
});
