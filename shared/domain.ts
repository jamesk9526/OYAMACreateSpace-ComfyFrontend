import { z } from 'zod';
import type { Diagnostics } from './logs';
import type {
  ContinuationScript,
  ContinuationScriptInput,
  ContinuationSequence,
} from './continuation';
import { gpuRoutingSchema, type RouteComponent } from './gpu-routing';
import type { RippleBatchState } from './ripple-batch';
import type { MovieTimeline } from './movie-timeline';

export const idSchema = z.string().uuid();
export const livePreviewSettingsSchema = z.object({
  frames: z.number().int().min(1).max(32).default(8),
  fps: z.number().int().min(1).max(60).default(24),
});
export const livePreviewDefaults = livePreviewSettingsSchema.parse({});
export const settingsSchema = z.object({
  comfyUrl: z
    .string()
    .url()
    .refine((value) => {
      const u = new URL(value);
      return (
        ['http:', 'https:'].includes(u.protocol) &&
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash
      );
    }, 'Use an HTTP(S) server address without credentials, query or fragment'),
  mockScenario: z.enum(['success', 'error', 'disconnected']).default('success'),
  gpuRouting: gpuRoutingSchema.optional(),
  livePreview: livePreviewSettingsSchema.default(livePreviewDefaults),
});
export type Settings = z.infer<typeof settingsSchema>;
export const draftSchema = z.object({
  projectId: idSchema,
  moduleId: z.string().regex(/^[a-z][a-z0-9-]*$/),
  values: z.record(z.string(), z.unknown()),
});
export type Draft = z.infer<typeof draftSchema>;
export const recordSchema = z.object({
  id: idSchema,
  kind: z.enum(['character', 'location', 'wardrobe']),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(10000),
  assetIds: z.array(idSchema).max(32),
  characterId: idSchema.nullable().optional(),
  colors: z.string().max(2000).optional(),
  materials: z.string().max(2000).optional(),
  visualStyle: z.string().max(2000).optional(),
  approvedAssetIds: z.array(idSchema).max(16).optional(),
  coverAssetId: idSchema.nullable().optional(),
  masterAssetId: idSchema.nullable().optional(),
  turntableAssetId: idSchema.nullable().optional(),
  angleSamples: z
    .array(
      z.object({
        assetId: idSchema,
        label: z.enum(['Front', 'Front three-quarter', 'Profile', 'Back three-quarter', 'Back']),
        frame: z.number().int().nonnegative(),
        seconds: z.number().finite().nonnegative(),
      }),
    )
    .max(5)
    .optional(),
  identityNotes: z.string().max(4000).optional(),
  voice: z.string().max(2000).optional(),
  environment: z.string().max(4000).optional(),
  timeOfDay: z.string().max(1000).optional(),
  lighting: z.string().max(2000).optional(),
  atmosphere: z.string().max(2000).optional(),
  accuracyNotes: z.string().max(4000).optional(),
});
export type LibraryRecord = z.infer<typeof recordSchema>;
export type Project = { id: string; name: string; createdAt: string };
export type Asset = {
  id: string;
  projectId: string | null;
  name: string;
  kind: 'image' | 'video' | 'audio' | 'model';
  mime: string;
  url: string;
  createdAt: string;
  missing?: boolean;
  dimensions?: { width: number; height: number };
  generationContext?: {
    format: 'h3-av/1';
    jobId: string;
    width: number;
    height: number;
    frames: number;
    available?: boolean;
  };
  media?: MediaProbe;
  parentAssetId?: string;
  derivation?: {
    operation: 'frame' | 'clip' | 'continue' | 'ripple';
    start: number;
    end?: number;
    generatedAssetId?: string;
    jobId?: string;
  };
};
export type JobStatus =
  | 'preparing'
  | 'submitting'
  | 'queued'
  | 'running'
  | 'recovering'
  | 'complete'
  | 'error'
  | 'cancelled'
  | 'unknown';
export type Job = {
  id: string;
  projectId: string;
  moduleId: string;
  status: JobStatus;
  message: string;
  progress: number | null;
  createdAt: string;
  promptId?: string;
  endpoint: string;
  snapshot: Record<string, unknown>;
  templateVersion: string;
  assetIds: string[];
  libraryImageTarget?:
    { kind: 'assets' } | { kind: 'record'; recordId: string; purpose: 'master' | 'reference' };
  libraryImageAssetId?: string;
  rawAssetIds?: string[];
  preview?: string;
  batch?: RippleBatchState;
  sequence?: ContinuationSequence;
};
export type Device = { name: string; index: number; vram_total: number; vram_free: number };
export type Readiness = {
  connected: boolean;
  message: string;
  devices: Device[];
  nodes: string[];
  models: Record<string, string[]>;
  mock: boolean;
  routing?: Record<RouteComponent, string[]>;
  queue?: { running: number; pending: number };
};
export type Bootstrap = {
  projects: Project[];
  assets: Asset[];
  records: LibraryRecord[];
  drafts: Draft[];
  jobs: Job[];
  settings: Settings;
  version: string;
  mock: boolean;
};
export type AppEvent =
  { type: 'job'; job: Job } | { type: 'library' } | { type: 'connection'; readiness: Readiness };
export type ImportRequest = { projectId: string | null };
export const libraryImageRequestSchema = z.object({
  projectId: idSchema,
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('assets') }),
    z.object({
      kind: z.literal('record'),
      recordId: idSchema,
      purpose: z.enum(['master', 'reference']),
    }),
  ]),
  values: z.record(z.string(), z.unknown()),
});
export type LibraryImageRequest = z.infer<typeof libraryImageRequestSchema>;
export const attachRecordImageSchema = z.object({
  projectId: idSchema,
  recordId: idSchema,
  assetId: idSchema,
  purpose: z.enum(['master', 'reference']),
});
export type AttachRecordImageRequest = z.infer<typeof attachRecordImageSchema>;
export type MovieImportRequest = { projectId: string; source: 'files' | 'folder' };
export const assetHandoffSchema = z.object({
  assetId: idSchema,
  projectId: idSchema,
  targetModuleId: z.string().regex(/^[a-z][a-z0-9-]*$/),
  targetField: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
  canvas: z
    .object({
      width: z.number().int().min(256).max(2048).multipleOf(32),
      height: z.number().int().min(256).max(2048).multipleOf(32),
    })
    .optional(),
});
export type AssetHandoff = z.infer<typeof assetHandoffSchema>;
export const recordPromotionSchema = z.object({
  assetId: idSchema,
  projectId: idSchema,
  kind: z.enum(['character', 'location']),
});
export type RecordPromotion = z.infer<typeof recordPromotionSchema>;
export type RecordPromotionResult = { asset: Asset; record: LibraryRecord };
export type MediaStream = {
  kind: 'video' | 'audio';
  codec: string;
  width?: number;
  height?: number;
  fps?: number;
  frames?: number;
  sampleRate?: number;
  duration?: number;
};
export type MediaProbe = {
  duration: number;
  streams: MediaStream[];
  video: MediaStream | null;
  audio: MediaStream | null;
};
export const frameRequestSchema = z.object({
  assetId: idSchema,
  seconds: z.number().finite().nonnegative(),
  frame: z.number().int().nonnegative().optional(),
});
export type FrameRequest = z.infer<typeof frameRequestSchema>;
export const clipRequestSchema = z
  .object({
    assetId: idSchema,
    start: z.number().finite().nonnegative(),
    end: z.number().finite().positive(),
  })
  .refine((value) => value.end > value.start, 'Clip end must follow start');
export type ClipRequest = z.infer<typeof clipRequestSchema>;
export interface DesktopAPI {
  listContinuationScripts(projectId: string): Promise<ContinuationScript[]>;
  saveContinuationScript(script: ContinuationScriptInput): Promise<ContinuationScript>;
  runContinuationScript(scriptId: string, targetBeatId: string): Promise<Job>;
  resumeContinuationScript(jobId: string): Promise<Job>;
  diagnostics(): Promise<Diagnostics>;
  exportLogs(): Promise<void>;
  reportRendererLog(entry: { level: 'info' | 'warn' | 'error'; message: string }): Promise<void>;
  load(): Promise<Bootstrap>;
  createProject(name: string): Promise<Project>;
  renameProject(id: string, name: string): Promise<Project>;
  saveRecord(record: LibraryRecord): Promise<LibraryRecord>;
  removeRecord(id: string): Promise<void>;
  saveDraft(draft: Draft): Promise<void>;
  saveSettings(settings: Settings): Promise<Settings>;
  importMedia(request: ImportRequest): Promise<Asset[]>;
  importMovieMedia(request: MovieImportRequest): Promise<Asset[]>;
  importDroppedMovieMedia(projectId: string, files: File[]): Promise<Asset[]>;
  exportAsset(id: string): Promise<void>;
  promoteAsset(id: string): Promise<Asset>;
  promoteAssetToRecord(request: RecordPromotion): Promise<RecordPromotionResult>;
  handoffAsset(request: AssetHandoff): Promise<Draft>;
  probeAsset(id: string): Promise<MediaProbe>;
  extractFrame(request: FrameRequest): Promise<Asset>;
  clipVideo(request: ClipRequest): Promise<Asset>;
  loadMovieTimeline(projectId: string): Promise<MovieTimeline>;
  saveMovieTimeline(timeline: MovieTimeline): Promise<MovieTimeline>;
  checkConnection(): Promise<Readiness>;
  generate(draft: Draft): Promise<Job>;
  generateLibraryImage(request: LibraryImageRequest): Promise<Job>;
  useLibraryImage(jobId: string): Promise<Asset>;
  attachRecordImage(request: AttachRecordImageRequest): Promise<LibraryRecord>;
  cancelJob(id: string): Promise<void>;
  resumeBatchJob(id: string): Promise<Job>;
  windowAction(action: 'minimize' | 'maximize' | 'close'): Promise<void>;
  onEvent(callback: (event: AppEvent) => void): () => void;
}
export const ipcChannels = [
  'listContinuationScripts',
  'saveContinuationScript',
  'runContinuationScript',
  'resumeContinuationScript',
  'diagnostics',
  'exportLogs',
  'reportRendererLog',
  'load',
  'createProject',
  'renameProject',
  'saveRecord',
  'removeRecord',
  'saveDraft',
  'saveSettings',
  'importMedia',
  'importMovieMedia',
  'importDroppedMovieMedia',
  'exportAsset',
  'promoteAsset',
  'promoteAssetToRecord',
  'handoffAsset',
  'probeAsset',
  'extractFrame',
  'clipVideo',
  'loadMovieTimeline',
  'saveMovieTimeline',
  'checkConnection',
  'generate',
  'generateLibraryImage',
  'useLibraryImage',
  'attachRecordImage',
  'cancelJob',
  'resumeBatchJob',
  'windowAction',
] as const;
