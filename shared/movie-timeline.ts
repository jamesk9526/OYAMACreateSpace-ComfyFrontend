import { z } from 'zod';
import { idSchema } from './domain';

export const movieTimelineClipSchema = z.object({
  id: idSchema,
  assetId: idSchema,
  track: z.enum(['video', 'audio']),
  start: z.number().finite().min(0).max(86400),
  duration: z.number().finite().positive().max(86400),
  sourceStart: z.number().finite().min(0).max(86400).default(0),
  volume: z.number().finite().min(0).max(2).default(1),
  muted: z.boolean().default(false),
  locked: z.boolean().default(false),
});

export const movieTimelineSchema = z.object({
  projectId: idSchema,
  fps: z.number().int().min(1).max(120).default(24),
  snap: z.boolean().default(true),
  clips: z.array(movieTimelineClipSchema).max(1000),
});

export type MovieTimelineClip = z.infer<typeof movieTimelineClipSchema>;
export type MovieTimeline = z.infer<typeof movieTimelineSchema>;

export const emptyMovieTimeline = (projectId: string): MovieTimeline => ({
  projectId,
  fps: 24,
  snap: true,
  clips: [],
});
