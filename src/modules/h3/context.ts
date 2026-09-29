import type { Job } from '../../../shared/domain';
import type { ObjectInfo } from '../../../shared/modules';
import { h3Frames } from './workflow';

// Exact per-job files avoid loading an unrelated branch or a rejected attempt's "newest" latent.
export const h3ContextContract = {
  saveNode: '204',
  sourceAsset: (values: Record<string, unknown>) =>
    typeof values.contextSourceAsset === 'string' ? values.contextSourceAsset : undefined,
  frames: (values: Record<string, unknown>) =>
    Number(values.renderFrames || h3Frames(Number(values.duration))),
  output: (job: Job) => ({
    filename: `${job.id}-context_00001.safetensors`,
    subfolder: 'CreateSpace',
    type: 'output',
  }),
};
export function supportsLatentContext(info: ObjectInfo) {
  return Boolean(
    info.MiniMaxH3SaveLatent &&
    info.MiniMaxH3LoadLatent &&
    info.MiniMaxH3VideoExtender?.input?.optional?.prev_latent,
  );
}
