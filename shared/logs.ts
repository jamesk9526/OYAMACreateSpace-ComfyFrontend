import { z } from 'zod';
export const rendererLogSchema = z.object({
  level: z.enum(['info', 'warn', 'error']),
  message: z.string().max(8000),
});
export type LogLevel = 'info' | 'warn' | 'error';
export type LogEntry = {
  id: string;
  time: string;
  level: LogLevel;
  source: string;
  message: string;
};
export type Diagnostics = { info: Record<string, string>; entries: LogEntry[] };
