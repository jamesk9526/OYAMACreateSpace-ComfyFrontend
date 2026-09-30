// Source: Comfy-Org/workflow_templates 3d_pixal3d_multi_views, inspected 2026-09-30.
// Front-only conditioning; mesh and PBR settings match the user's Comfy graph (2026-09-30).
import baseGraph from './graph.json';
import { modelingSchema, modelingModels } from './definition';
import {
  collectWorkflowOutputs,
  nodeChoices,
  type ComfyGraph,
  type ObjectInfo,
  type WorkflowUpload,
} from '../../../shared/modules';
export const modelingTemplateVersion = 'pixal3d-front-pbr/2';
export function compileModeling(
  values: Record<string, unknown>,
  info: ObjectInfo,
  uploads: WorkflowUpload[],
  seed: number,
  prefix: string,
): ComfyGraph {
  const s = modelingSchema.parse(values),
    image = uploads.find((u) => u.id === s.sourceImage && u.kind === 'image');
  if (!image) throw new Error('Choose a source image for Modeling.');
  const graph: ComfyGraph = structuredClone(baseGraph);
  for (const n of Object.values(graph))
    if (!info[n.class_type]) throw new Error(`Missing ComfyUI node: ${n.class_type}`);
  for (const [node, field, name] of [
    ['UNETLoader', 'unet_name', modelingModels.diffusion],
    ['CLIPVisionLoader', 'clip_name', modelingModels.vision],
    ['VAELoader', 'vae_name', modelingModels.shape],
    ['VAELoader', 'vae_name', modelingModels.texture],
    ['LoadBackgroundRemovalModel', 'bg_removal_name', modelingModels.background],
  ])
    if (!nodeChoices(info, node, field).includes(name))
      throw new Error(`Missing Pixal3D model: ${name}`);
  graph['364'].inputs.image = image.name;
  graph['324'].inputs.fov = s.fov;
  graph['186'].inputs.target_face_count = s.targetFaces;
  graph['94'].inputs.target_resolution = s.shapeResolution;
  graph['241'].inputs.resolution = s.remeshResolution;
  graph['241'].inputs.smooth_iters = s.smoothIterations;
  graph['196'].inputs.resolution = s.textureSize;
  graph['147'].inputs.texture_size = s.textureSize;
  graph['3'].inputs.seed = seed;
  for (const id of ['18', '23']) graph[id].inputs.seed = Number(s.shapeSeed);
  graph['12'].inputs.seed = Number(s.textureSeed);
  graph['372'].inputs.filename_prefix = prefix;
  return graph;
}
export const modelingOutputs = (outputs: Record<string, unknown>) =>
  collectWorkflowOutputs(outputs, ['372'], 'model');
