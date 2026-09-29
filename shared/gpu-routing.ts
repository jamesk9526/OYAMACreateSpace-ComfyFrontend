import { z } from 'zod';
import { nodeChoices, type ComfyGraph, type ObjectInfo } from './modules';

export const routeComponents = ['diffusion', 'textEncoder', 'videoVae', 'audioVae'] as const;
export type RouteComponent = (typeof routeComponents)[number];
export const routeLabels: Record<RouteComponent, string> = {
  diffusion: 'Diffusion model',
  textEncoder: 'Text encoder',
  videoVae: 'Video / image VAE',
  audioVae: 'Audio VAE',
};
const routeDevice = z.string().regex(/^(auto|cpu|gpu:\d{1,2})$/);
export const gpuRoutingSchema = z.object({
  preset: z.enum(['auto', 'single', 'split', 'custom']).default('auto'),
  diffusion: routeDevice.default('auto'),
  textEncoder: routeDevice.default('auto'),
  videoVae: routeDevice.default('auto'),
  audioVae: routeDevice.default('auto'),
});
export type GpuRouting = z.infer<typeof gpuRoutingSchema>;
export const gpuRoutingDefaults = gpuRoutingSchema.parse({});
export const routingNodes: Record<RouteComponent, { node: string; input: string }> = {
  diffusion: { node: 'SelectModelDevice', input: 'model' },
  textEncoder: { node: 'SelectCLIPDevice', input: 'clip' },
  videoVae: { node: 'SelectVAEDevice', input: 'vae' },
  audioVae: { node: 'SelectVAEDevice', input: 'vae' },
};
export function routingChoices(info: ObjectInfo): Record<RouteComponent, string[]> {
  return Object.fromEntries(
    routeComponents.map((component) => [
      component,
      [
        'auto',
        ...nodeChoices(info, routingNodes[component].node, 'device').filter((value) =>
          /^(cpu|gpu:\d+)$/.test(value),
        ),
      ],
    ]),
  ) as Record<RouteComponent, string[]>;
}
export function resolvedRoutes(
  settings: GpuRouting,
  devices: { index: number }[],
): Record<RouteComponent, string> {
  const indexes = [...new Set(devices.map((device) => device.index))].sort((a, b) => a - b);
  if (settings.preset === 'auto')
    return { diffusion: 'auto', textEncoder: 'auto', videoVae: 'auto', audioVae: 'auto' };
  if (settings.preset === 'custom')
    return {
      diffusion: settings.diffusion,
      textEncoder: settings.textEncoder,
      videoVae: settings.videoVae,
      audioVae: settings.audioVae,
    };
  if (!indexes.length)
    throw new Error(
      'No CUDA devices are advertised by the connected ComfyUI server. Refresh settings or select Auto.',
    );
  if (settings.preset === 'split' && indexes.length < 2)
    throw new Error(
      'Split GPU routing needs two advertised CUDA devices. Select Auto or Single GPU.',
    );
  const first = `gpu:${indexes[0]}`,
    secondary = settings.preset === 'split' ? `gpu:${indexes[1]}` : first;
  return { diffusion: first, textEncoder: secondary, videoVae: secondary, audioVae: secondary };
}
/** Route verified loaders before every consumer, including input encoding and final decoding. */
export function applyGpuRouting(
  graph: ComfyGraph,
  info: ObjectInfo,
  settings: GpuRouting,
  devices: { index: number }[],
): { graph: ComfyGraph; placements: string[] } {
  const result = structuredClone(graph);
  const targets = resolvedRoutes(gpuRoutingSchema.parse(settings), devices);
  const choices = routingChoices(info);
  const placements: string[] = [];
  let next = 900;
  const sources = Object.entries(result);
  for (const [id, loader] of sources) {
    const component: RouteComponent | undefined =
      loader.class_type === 'UNETLoader'
        ? 'diffusion'
        : loader.class_type === 'CLIPLoader'
          ? 'textEncoder'
          : loader.class_type === 'VAELoader'
            ? /audio/i.test(String(loader.inputs.vae_name))
              ? 'audioVae'
              : 'videoVae'
            : undefined;
    if (!component || targets[component] === 'auto') continue;
    const target = targets[component];
    if (!choices[component].includes(target))
      throw new Error(
        `${routeLabels[component]} cannot use ${target}: the connected server does not advertise that device for ${routingNodes[component].node}. Refresh GPU routing in Settings.`,
      );
    if (
      target.startsWith('gpu:') &&
      !devices.some((device) => device.index === Number(target.slice(4)))
    )
      throw new Error(
        `${routeLabels[component]} requested ${target}, but this server does not report it. Select an available GPU or Auto.`,
      );
    while (result[String(next)]) next++;
    const selector = String(next++);
    for (const node of Object.values(result)) {
      for (const [key, input] of Object.entries(node.inputs))
        if (Array.isArray(input) && input.length === 2 && input[0] === id && input[1] === 0)
          node.inputs[key] = [selector, 0];
    }
    result[selector] = {
      class_type: routingNodes[component].node,
      inputs: { [routingNodes[component].input]: [id, 0], device: target },
    };
    placements.push(`${routeLabels[component]}: ${target}`);
  }
  // Do not pretend a custom GGUF loader supports the core model reload factory.
  if (targets.diffusion !== 'auto' && sources.some(([, node]) => /GGUF/.test(node.class_type)))
    throw new Error(
      'Explicit diffusion routing is unavailable for this GGUF loader. Select Auto routing or the safetensors profile.',
    );
  return { graph: result, placements };
}
