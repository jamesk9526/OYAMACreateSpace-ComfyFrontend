import type { ComfyGraph, ObjectInfo, WorkflowUpload } from '../../../shared/modules';
import { h3Defaults } from '../h3/definition';
import { compileH3, h3Outputs } from '../h3/workflow';
import { continueSchema, continueTiming } from './definition';
import { supportsLatentContext } from '../h3/context';

export const continueTemplateVersion = 'h3-continue-frame/4';
export function compileContinue(
  raw: Record<string, unknown>,
  info: ObjectInfo,
  uploads: WorkflowUpload[],
  seed: number,
  prefix: string,
): ComfyGraph {
  const settings = continueSchema.parse({ ...raw, prompt: raw.actionPrompt ?? raw.prompt });
  if (
    !settings.sourceVideo ||
    (settings.method !== 'motion' && !settings.firstFrame) ||
    !settings.prompt.trim()
  )
    throw new Error('Choose a source video and describe the next action.');
  const timing = continueTiming(settings.duration, settings.method, settings.contextFrames);
  const graph = compileH3(
    {
      ...h3Defaults,
      ...settings,
      previewFrames: raw.previewFrames,
      previewFps: raw.previewFps,
      prompt: raw.prompt,
      mode: settings.method === 'motion' ? 'text' : 'image',
    },
    info,
    uploads,
    seed,
    prefix,
    timing.frames + timing.trimFrames,
  );
  if (settings.method === 'motion') {
    const source = uploads.find(
      (upload) => upload.id === settings.sourceVideo && upload.kind === 'video',
    );
    if (!source) throw new Error('Prepared motion-context video is missing.');
    for (const name of [
      'MiniMaxH3VideoExtender',
      'MiniMaxH3LoopTrim',
      'LoadVideo',
      'GetVideoComponents',
    ])
      if (!info[name]) throw new Error(`Missing motion-context node: ${name}`);
    graph['200'] = { class_type: 'LoadVideo', inputs: { file: source.name } };
    graph['201'] = { class_type: 'GetVideoComponents', inputs: { video: ['200', 0] } };
    graph['202'] = {
      class_type: 'MiniMaxH3VideoExtender',
      inputs: {
        conditioning: ['10', 0],
        latent: ['10', 1],
        vae: ['3', 0],
        mode: 'always_extend',
        context_length: settings.contextFrames,
        encode_mode: 'video',
        anchor_mode: 'head',
        crop: 'center',
        audio_context_length: settings.contextFrames,
        audio_mode: 'timeline',
        prev_frames: ['201', 0],
        prev_audio: ['201', 1],
        audio_vae: ['4', 0],
      },
    };
    if (raw.contextSourceAsset) {
      if (!supportsLatentContext(info))
        throw new Error(
          'Direct H3 latent reuse requires Save/Load AV Latent and an extender with prev_latent support. Select trailing frames if these nodes are unavailable.',
        );
      if (
        typeof raw.contextUploadPath !== 'string' ||
        !/^CreateSpaceContext\/[0-9a-f-]{36}\.safetensors$/i.test(raw.contextUploadPath)
      )
        throw new Error('Managed H3 latent upload is missing.');
      graph['205'] = {
        class_type: 'MiniMaxH3LoadLatent',
        inputs: { latent_path: raw.contextUploadPath, clip_index: 0 },
      };
      graph['202'].inputs.prev_latent = ['205', 0];
      delete graph['202'].inputs.prev_audio;
    }
    graph['12'].inputs.conditioning = ['202', 0];
    graph['203'] = {
      class_type: 'MiniMaxH3LoopTrim',
      inputs: {
        images: ['16', 0],
        audio: ['17', 0],
        trim_frames: ['202', 1],
        fps: 24,
        match_tail: true,
        retain_overlap_frames: 0,
      },
    };
    graph['18'].inputs.images = ['203', 0];
    graph['18'].inputs.audio = ['203', 1];
  }
  return graph;
}
export const continueOutputs = h3Outputs;
