import type { GeneratorAdapter } from '../../../electron/main/modules';
import { modelingSchema } from './definition';
import { compileModeling, modelingOutputs, modelingTemplateVersion } from './workflow';
export const modelingAdapter: GeneratorAdapter = {
  version: modelingTemplateVersion,
  outputKind: 'model',
  outputLabel: '3D model',
  mockFilename: 'model.glb',
  resolve(draft, _records, asset) {
    const s = modelingSchema.parse(draft.values);
    if (!s.sourceImage) throw new Error('Choose a source image for Modeling.');
    const a = asset(s.sourceImage);
    if (a.kind !== 'image' || a.missing || (a.projectId && a.projectId !== draft.projectId))
      throw new Error('Choose an available image from this project or the global library.');
    return { values: s, assetIds: [a.id] };
  },
  compile: compileModeling,
  outputs: modelingOutputs,
};
