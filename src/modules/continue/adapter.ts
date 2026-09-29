// Main-process contribution. Never import this file from a renderer registry.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { GeneratorAdapter } from '../../../electron/main/modules';
import { MediaService } from '../../../electron/main/media';
import { canReuseContext, continueSchema, continueSourceRange, continueTiming } from './definition';
import { compileContinue, continueOutputs, continueTemplateVersion } from './workflow';
import { rippleSourceDuration } from '../ripple/definition';
import { h3ContextContract } from '../h3/context';

export const continueAdapter: GeneratorAdapter = {
  context: h3ContextContract,
  maxUploadBytes: 100 * 1024 * 1024,
  version: continueTemplateVersion,
  outputKind: 'video',
  outputLabel: 'Joined video',
  mockFilename: 'Mock-Continue-beat.mp4',
  async prepare(draft, store) {
    const settings = continueSchema.parse(draft.values);
    if (!settings.sourceVideo || !settings.prompt.trim())
      throw new Error('Choose a source and describe the next action.');
    let source = store.asset(settings.sourceVideo);
    if (source.kind !== 'video' || (source.projectId && source.projectId !== draft.projectId))
      throw new Error('Choose a video from this project or the global library.');
    const media = new MediaService({ resourcesPath: process.resourcesPath });
    const metadata = await media.probe(store.assetPath(source.id));
    source = store.saveMediaProbe(source.id, metadata);
    const duration = rippleSourceDuration(source);
    const fps = metadata.video?.fps;
    if (!fps || !duration || duration > 300)
      throw new Error(
        'Choose a video under five minutes with usable frames, or create a clip in Assets.',
      );
    const { frameTime: seconds } = continueSourceRange(settings, source);
    if (settings.method === 'motion') {
      if (Math.round(duration * 24) < settings.contextFrames)
        throw new Error(
          'Source is too short for the selected motion context. Choose fewer context frames.',
        );
      return { ...draft, values: { ...settings, firstFrame: null } };
    }
    const temporary = path.join(store.root, 'temporary', `${randomUUID()}.png`);
    try {
      await media.extractFrame(store.assetPath(source.id), temporary, seconds);
      const frame = await store.importFile(
        temporary,
        draft.projectId,
        `${source.name}-${settings.method}-frame.png`,
      );
      store.registerDerivation(frame.id, source.id, { operation: 'frame', start: seconds });
      return { ...draft, values: { ...settings, firstFrame: frame.id } };
    } finally {
      await fs.rm(temporary, { force: true });
    }
  },
  resolve(draft, _records, asset, jobs = []) {
    const settings = continueSchema.parse(draft.values);
    if (!settings.sourceVideo || (settings.method !== 'motion' && !settings.firstFrame))
      throw new Error('Source frame preparation is incomplete.');
    const source = asset(settings.sourceVideo);
    const frame = settings.method === 'motion' ? undefined : asset(settings.firstFrame!);
    if (
      source.kind !== 'video' ||
      (frame && frame.kind !== 'image') ||
      [source, ...(frame ? [frame] : [])].some(
        (item) => item.projectId && item.projectId !== draft.projectId,
      )
    )
      throw new Error('Continuation inputs are invalid or belong to a different project.');
    const sourceJob = jobs.find(
      (job) => job.status === 'complete' && job.assetIds.includes(source.id),
    );
    const context =
      settings.inheritContext && sourceJob ? String(sourceJob.snapshot.prompt || '') : '';
    const prompt = [
      context && `Source scene context:\n${context}`,
      `Next action:\n${settings.prompt}`,
      settings.dialoguePolicy === 'none'
        ? 'Dialogue direction: no spoken dialogue in the new beat.'
        : settings.dialoguePolicy === 'allow'
          ? 'Dialogue direction: new speech may differ from the source.'
          : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    if (prompt.length > 20000)
      throw new Error(
        'Inherited context plus next action is too long. Disable source context or shorten the action.',
      );
    const timing = continueTiming(settings.duration, settings.method, settings.contextFrames);
    const range = continueSourceRange(settings, source);
    if (settings.method === 'motion' && range.retainedSourceFrames < settings.contextFrames)
      throw new Error('Source is too short for the selected motion context.');
    if (settings.blendFrames >= Math.min(range.retainedSourceFrames, timing.frames))
      throw new Error('Blend overlap must be shorter than both the source and generated beat.');
    const reusable =
      settings.method === 'motion' &&
      settings.contextMode !== 'frames' &&
      canReuseContext(settings, source);
    if (settings.method === 'motion' && settings.contextMode === 'latent' && !reusable)
      throw new Error(
        'This source has no compatible saved H3 latents. Match its canvas/context length, or use trailing frames.',
      );
    return {
      values: {
        ...settings,
        prompt,
        actionPrompt: settings.prompt,
        sourcePrompt: context,
        sourceJobId: sourceJob?.id,
        sourceCharacterIds:
          sourceJob?.snapshot.characterIds || sourceJob?.snapshot.sourceCharacterIds || [],
        sourceLocationIds:
          sourceJob?.snapshot.locationIds || sourceJob?.snapshot.sourceLocationIds || [],
        sourceDuration: rippleSourceDuration(source),
        sourceFrameTime: range.frameTime,
        retainedSourceFrames: range.retainedSourceFrames,
        renderFrames: timing.frames + timing.trimFrames,
        contextStart:
          settings.method === 'motion'
            ? (range.retainedSourceFrames - settings.contextFrames) / 24
            : undefined,
        deliveredDuration: timing.duration,
        trimFrames: timing.trimFrames,
        contextSourceAsset: reusable ? source.id : undefined,
        contextMethod: settings.method === 'motion' ? (reusable ? 'latent' : 'frames') : undefined,
      },
      assetIds: frame ? [frame.id] : [source.id],
    };
  },
  compile: compileContinue,
  async prepareUpload(values, asset, source, target) {
    const settings = continueSchema.parse({
      ...values,
      prompt: values.actionPrompt ?? values.prompt,
    });
    if (settings.method !== 'motion') return source;
    if (asset.id !== settings.sourceVideo || asset.kind !== 'video')
      throw new Error('Motion-context upload must be the selected source video.');
    await new MediaService({ resourcesPath: process.resourcesPath }).prepareMotionContext(
      source,
      target,
      settings.contextFrames,
      settings.width,
      settings.height,
    );
    return target;
  },
  outputs: continueOutputs,
  async finalize(job, rawAssets, store) {
    const settings = continueSchema.parse({
      ...job.snapshot,
      prompt: job.snapshot.actionPrompt ?? job.snapshot.prompt,
    });
    if (!settings.sourceVideo || !rawAssets[0])
      throw new Error('Continuation output or source is missing.');
    const existing = store
      .snapshot('', false)
      .assets.find(
        (asset) =>
          !asset.missing &&
          asset.derivation?.operation === 'continue' &&
          asset.derivation.jobId === job.id,
      );
    if (existing) return [existing, ...rawAssets];
    const source = store.asset(settings.sourceVideo);
    const media = new MediaService({ resourcesPath: process.resourcesPath });
    const beat = rawAssets[0];
    const beatMetadata = await media.probe(store.assetPath(beat.id));
    if (
      !job.promptId?.startsWith('mock-') &&
      beatMetadata.video?.frames !==
        continueTiming(settings.duration, settings.method, settings.contextFrames).frames
    )
      throw new Error(
        'H3 continuation returned an unexpected frame count. The raw beat is retained.',
      );
    store.saveMediaProbe(beat.id, beatMetadata);
    const target = path.join(store.root, 'temporary', `${job.id}-joined.mp4`);
    try {
      const metadata = await media.joinVideos(
        store.assetPath(source.id),
        store.assetPath(beat.id),
        target,
        settings.width,
        settings.height,
        settings.method === 'selected' ? Number(job.snapshot.retainedSourceFrames) : undefined,
        settings.audioCarry,
        settings.blendFrames,
      );
      const joined = await store.importFile(target, job.projectId, `${source.name}-continued.mp4`);
      store.saveMediaProbe(joined.id, metadata);
      const derived = store.registerDerivation(joined.id, source.id, {
        operation: 'continue',
        start: 0,
        end:
          Number(
            job.snapshot.retainedSourceFrames || Math.round(rippleSourceDuration(source) * 24),
          ) / 24,
        generatedAssetId: beat.id,
        jobId: job.id,
      });
      return [derived, ...rawAssets];
    } finally {
      await fs.rm(target, { force: true });
    }
  },
  applyAsset(draft, field, asset) {
    if (field !== 'sourceVideo' || asset.kind !== 'video')
      throw new Error('Continue handoff requires a video source.');
    return {
      ...draft,
      values: continueSchema.parse({
        ...draft.values,
        sourceVideo: asset.id,
        selectedSeconds: 0,
        firstFrame: null,
        ...(asset.media?.video?.width && asset.media.video.height
          ? {
              resolutionLock: null,
              width: Math.max(256, Math.min(2048, Math.round(asset.media.video.width / 32) * 32)),
              height: Math.max(256, Math.min(2048, Math.round(asset.media.video.height / 32) * 32)),
            }
          : {}),
      }),
    };
  },
};
