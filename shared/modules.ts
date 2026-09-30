import type { z } from 'zod';
import type { Readiness } from './domain';
export type ModuleAvailability = { ready: boolean; message: string };
export interface ModuleDefinition {
  id: string;
  title: string;
  kind: 'generator' | 'workspace' | 'tool';
  badge?: string;
  description: string;
  capabilities: string[];
  settingsSchema?: z.ZodType;
  defaults?: Record<string, unknown>;
  availability?: (readiness: Readiness | null) => ModuleAvailability;
}
export type ComfyNode = { class_type: string; inputs: Record<string, unknown> };
export type ComfyGraph = Record<string, ComfyNode>;
export type MediaKind = 'image' | 'video' | 'audio' | 'model';
export type WorkflowUpload = { id: string; kind: MediaKind; name: string };
export type WorkflowOutput = {
  filename: string;
  subfolder: string;
  type: string;
};
export type ObjectInfo = Record<
  string,
  { input?: { required?: Record<string, unknown[]>; optional?: Record<string, unknown[]> } }
>;
export function nodeChoices(info: ObjectInfo, node: string, field: string): string[] {
  const data = info[node]?.input?.required?.[field] ?? info[node]?.input?.optional?.[field];
  if (!data) return [];
  if (Array.isArray(data[0])) return data[0].filter((v): v is string => typeof v === 'string');
  const opts = data[1] as { options?: unknown[] } | undefined;
  return opts?.options?.filter((v): v is string => typeof v === 'string') ?? [];
}

const outputExtensions: Record<MediaKind, RegExp> = {
  image: /\.(png|jpe?g|webp)$/i,
  video: /\.(mp4|webm|mov)$/i,
  audio: /\.(wav|mp3|flac|ogg)$/i,
  model: /\.glb$/i,
};

/** Read files only from a module's declared save nodes. Preview and input nodes are ignored. */
export function collectWorkflowOutputs(
  outputs: Record<string, unknown>,
  saveNodes: readonly string[],
  kind: MediaKind,
): WorkflowOutput[] {
  const found: WorkflowOutput[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const item = value as Record<string, unknown>;
    if (typeof item.filename === 'string' && outputExtensions[kind].test(item.filename))
      found.push({
        filename: item.filename,
        subfolder: typeof item.subfolder === 'string' ? item.subfolder : '',
        type: typeof item.type === 'string' ? item.type : 'output',
      });
    Object.values(item).forEach(visit);
  };
  saveNodes.forEach((node) => visit(outputs[node]));
  return found.filter(
    (file, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.filename === file.filename && candidate.subfolder === file.subfolder,
      ) === index,
  );
}
