import type { Asset, Draft, Job, LibraryRecord } from '../../shared/domain';
import type { Store } from './database';
import { continueAdapter } from '../../src/modules/continue/adapter';
import type {
  ComfyGraph,
  MediaKind,
  ObjectInfo,
  WorkflowOutput,
  WorkflowUpload,
} from '../../shared/modules';
import { h3Schema } from '../../src/modules/h3/definition';
import { h3ContextContract } from '../../src/modules/h3/context';
import { compileH3, h3Outputs, templateVersion } from '../../src/modules/h3/workflow';
import { zImageSchema } from '../../src/modules/zimage/definition';
import {
  compileZImage,
  zImageOutputs,
  zImageTemplateVersion,
} from '../../src/modules/zimage/workflow';
import { ltxSchema } from '../../src/modules/ltx/definition';
import { compileLtx, ltxOutputs, ltxTemplateVersion } from '../../src/modules/ltx/workflow';
import {
  rippleDefaultPrompt,
  rippleSchema,
  rippleSourceDuration,
} from '../../src/modules/ripple/definition';
import { MediaService } from './media';
import { photoEditSchema } from '../../src/modules/photo-edit/definition';
import {
  compilePhotoEdit,
  photoEditOutputs,
  photoEditTemplateVersion,
} from '../../src/modules/photo-edit/workflow';
import {
  compileRipple,
  rippleOutputs,
  rippleTemplateVersion,
} from '../../src/modules/ripple/workflow';
export interface GeneratorAdapter {
  context?: {
    saveNode: string;
    sourceAsset(values: Record<string, unknown>): string | undefined;
    frames(values: Record<string, unknown>): number;
    output(job: Job): WorkflowOutput;
  };
  version: string;
  outputKind: MediaKind;
  outputLabel: string;
  mockFilename: string;
  maxUploadBytes?: number;
  prepare?(draft: Draft, store: Store): Promise<Draft>;
  finalize?(job: Job, rawAssets: Asset[], store: Store): Promise<Asset[]>;
  prepareUpload?(
    values: Record<string, unknown>,
    asset: Asset,
    source: string,
    target: string,
  ): Promise<string>;
  resolve(
    draft: Draft,
    records: LibraryRecord[],
    asset: (id: string) => Asset,
    jobs?: Job[],
  ): { values: Record<string, unknown>; assetIds: string[] };
  compile(
    values: Record<string, unknown>,
    info: ObjectInfo,
    uploads: WorkflowUpload[],
    seed: number,
    prefix: string,
  ): ComfyGraph;
  outputs(outputs: Record<string, unknown>): WorkflowOutput[];
  applyAsset?(
    draft: Draft,
    field: string,
    asset: Asset,
    canvas?: { width: number; height: number },
  ): Draft;
}
export const generatorAdapters: Record<string, GeneratorAdapter> = {
  continue: continueAdapter,
  h3: {
    context: h3ContextContract,
    version: templateVersion,
    outputKind: 'video',
    outputLabel: 'Video',
    mockFilename: 'Mock-H3-preview.mp4',
    resolve(draft, records, asset) {
      const s = h3Schema.parse(draft.values);
      let attached = [...s.characterIds, ...s.locationIds].flatMap((id) => {
        const record = records.find((r) => r.id === id);
        if (!record && s.modeExplicit && s.mode !== 'reference') return [];
        if (!record) throw new Error('Attached character or location is missing');
        return [record];
      });
      // Older drafts could retain reference media while still selecting Text to Video.
      if (
        s.mode === 'text' &&
        !s.modeExplicit &&
        (s.references.length || attached.some((r) => r.assetIds.length))
      )
        s.mode = 'reference';
      if (
        s.mode !== 'reference' &&
        !s.modeExplicit &&
        (s.references.length || attached.some((r) => r.assetIds.length))
      )
        throw new Error('Use Ref2VA to apply attached character/location/reference media.');
      if (s.mode !== 'reference') {
        s.references = [];
        attached = s.modeExplicit ? [] : attached.filter((record) => record.assetIds.length === 0);
      } else s.references = [...new Set([...s.references, ...attached.flatMap((r) => r.assetIds)])];
      if (s.mode === 'image' && !s.firstFrame)
        throw new Error('Choose a first frame for Image to Video.');
      if (s.mode === 'reference' && !s.references.length)
        throw new Error('Attach at least one reference for Ref2VA.');
      for (const id of [s.firstFrame, s.lastFrame].filter((id): id is string => Boolean(id))) {
        if (s.mode === 'image' && asset(id).kind !== 'image')
          throw new Error('First and last frames must be images.');
      }
      const limits = { image: 9, video: 3, audio: 3 };
      if (s.mode === 'reference')
        for (const [kind, limit] of Object.entries(limits)) {
          if (s.references.filter((id) => asset(id).kind === kind).length > limit)
            throw new Error(`H3 supports at most ${limit} ${kind} references.`);
        }
      const labels = { image: 0, video: 0, audio: 0 };
      const referenceLabels = new Map(
        s.references.map((id) => {
          const kind = asset(id).kind;
          return [
            id,
            `<${kind === 'image' ? 'Picture' : kind === 'video' ? 'Video' : 'Audio'} ${++labels[kind]}>`,
          ];
        }),
      );
      s.prompt = [
        s.prompt.trim(),
        s.style.trim(),
        ...attached.map(
          (r) =>
            `${r.name}: ${r.description} ${r.assetIds
              .map((id) => referenceLabels.get(id))
              .filter(Boolean)
              .join(' ')}`,
        ),
      ]
        .filter(Boolean)
        .join('\n\n');
      const assetIds =
        s.mode === 'image'
          ? [s.firstFrame, s.lastFrame].filter((id): id is string => Boolean(id))
          : s.mode === 'reference'
            ? s.references
            : [];
      assetIds.forEach((id) => {
        const a = asset(id);
        if (a.projectId && a.projectId !== draft.projectId)
          throw new Error('Reference belongs to a different project');
      });
      return { values: s, assetIds };
    },
    compile: compileH3,
    outputs: h3Outputs,
    applyAsset(draft, field, asset) {
      if (field !== 'firstFrame') throw new Error('H3 supports only first-frame handoff.');
      if (asset.kind !== 'image') throw new Error('H3 first frame must be an image.');
      return {
        ...draft,
        values: h3Schema.parse({
          ...draft.values,
          mode: 'image',
          modeExplicit: true,
          firstFrame: asset.id,
        }),
      };
    },
  },
  zimage: {
    version: zImageTemplateVersion,
    outputKind: 'image',
    outputLabel: 'Image',
    mockFilename: 'Mock-ZImage.png',
    resolve(draft) {
      return { values: zImageSchema.parse(draft.values), assetIds: [] };
    },
    compile: compileZImage,
    outputs: zImageOutputs,
  },
  ltx: {
    version: ltxTemplateVersion,
    outputKind: 'video',
    outputLabel: 'Video',
    mockFilename: 'Mock-LTX-preview.mp4',
    resolve(draft, _records, asset) {
      const settings = ltxSchema.parse(draft.values);
      const assetIds = [
        ...new Set([
          ...(settings.mode === 'image' && settings.firstFrame ? [settings.firstFrame] : []),
          ...(settings.msr.enabled
            ? [
                settings.msr.pic1,
                settings.msr.pic2,
                settings.msr.pic3,
                settings.msr.pic4,
                settings.msr.background,
              ].filter((id): id is string => Boolean(id))
            : []),
        ]),
      ];
      for (const id of assetIds) {
        const frame = asset(id);
        if (frame.kind !== 'image')
          throw new Error('LTX first frame and MSR references must be images.');
        if (frame.projectId && frame.projectId !== draft.projectId)
          throw new Error('First frame belongs to a different project.');
      }
      return { values: settings, assetIds };
    },
    compile: compileLtx,
    outputs: ltxOutputs,
    applyAsset(draft, field, asset) {
      if (field !== 'firstFrame') throw new Error('LTX supports only first-frame handoff.');
      if (asset.kind !== 'image') throw new Error('LTX first frame must be an image.');
      return {
        ...draft,
        values: ltxSchema.parse({ ...draft.values, mode: 'image', firstFrame: asset.id }),
      };
    },
  },
  ripple: {
    version: rippleTemplateVersion,
    outputKind: 'video',
    outputLabel: 'Video',
    mockFilename: 'Mock-Ripple-preview.mp4',
    maxUploadBytes: 100 * 1024 * 1024,
    resolve(draft, _records, asset) {
      const settings = rippleSchema.parse(draft.values);
      if (!settings.sourceVideo || !settings.replacementFrame)
        throw new Error('Choose a source video and an edited first frame.');
      const source = asset(settings.sourceVideo);
      const frame = asset(settings.replacementFrame);
      if (source.kind !== 'video' || frame.kind !== 'image')
        throw new Error('Ripple needs a video source and an image replacement frame.');
      if ([source, frame].some((item) => item.projectId && item.projectId !== draft.projectId))
        throw new Error('Ripple inputs belong to a different project.');
      if (!source.media?.video)
        throw new Error('Inspect the source video in Assets before editing with Ripple.');
      const sourceFps = source.media.video.fps;
      if (!sourceFps) throw new Error('Source video has no usable frame rate.');
      const frames = Math.ceil((settings.duration * 24 - 1) / 8) * 8 + 1;
      const sourceDuration = rippleSourceDuration(source);
      if (
        settings.chunkSourceFrames === undefined &&
        sourceDuration + 0.001 < (settings.sourceInFrame + frames - 1) / 24
      )
        throw new Error(
          `Source video must extend through ${((settings.sourceInFrame + frames - 1) / 24).toFixed(3)} seconds for this edit.`,
        );
      return {
        values: {
          ...settings,
          prompt: settings.prompt.trim() || rippleDefaultPrompt,
          sourceDuration,
          sourceFps,
          preparedFps: 24,
        },
        assetIds: [source.id, frame.id],
      };
    },
    compile: compileRipple,
    outputs: rippleOutputs,
    async prepareUpload(values, asset, source, target) {
      if (asset.id !== values.sourceVideo) return source;
      const settings = rippleSchema.parse(values);
      await new MediaService({ resourcesPath: process.resourcesPath }).prepareRippleVideo(
        source,
        target,
        Math.ceil((settings.duration * 24 - 1) / 8) * 8,
        settings.width,
        settings.height,
        settings.chunkStartFrame ?? settings.sourceInFrame,
        settings.chunkSourceFrames,
      );
      return target;
    },
    applyAsset(draft, field, asset) {
      if (field !== 'replacementFrame' || asset.kind !== 'image')
        throw new Error('Ripple handoff requires an image replacement frame.');
      return {
        ...draft,
        values: rippleSchema.parse({
          ...draft.values,
          replacementFrame: asset.id,
          ...(asset.dimensions
            ? {
                resolutionLock: null,
                width: Math.max(256, Math.min(2048, Math.round(asset.dimensions.width / 32) * 32)),
                height: Math.max(
                  256,
                  Math.min(2048, Math.round(asset.dimensions.height / 32) * 32),
                ),
              }
            : {}),
        }),
      };
    },
  },
  'photo-edit': {
    version: photoEditTemplateVersion,
    outputKind: 'image',
    outputLabel: 'Image',
    mockFilename: 'Mock-Photo-Edit.png',
    resolve(draft, _records, asset) {
      const settings = photoEditSchema.parse(draft.values);
      if (!settings.sourceImage || !settings.prompt.trim())
        throw new Error('Choose a source photo and describe the edit.');
      const assetIds = [...new Set([settings.sourceImage, ...settings.references])];
      for (const id of assetIds) {
        const image = asset(id);
        if (image.kind !== 'image') throw new Error('Photo Edit inputs must be images.');
        if (image.projectId && image.projectId !== draft.projectId)
          throw new Error('Photo Edit input belongs to a different project.');
      }
      return { values: settings, assetIds };
    },
    compile: compilePhotoEdit,
    outputs: photoEditOutputs,
    applyAsset(draft, field, asset, canvas) {
      if (field !== 'sourceImage' || asset.kind !== 'image')
        throw new Error('Photo Edit handoff requires a source image.');
      const dimensions = canvas || asset.dimensions;
      return {
        ...draft,
        values: photoEditSchema.parse({
          ...draft.values,
          sourceImage: asset.id,
          ...(dimensions
            ? {
                resolutionLock: null,
                width: Math.max(256, Math.min(2048, Math.round(dimensions.width / 32) * 32)),
                height: Math.max(256, Math.min(2048, Math.round(dimensions.height / 32) * 32)),
              }
            : {}),
        }),
      };
    },
  },
};
