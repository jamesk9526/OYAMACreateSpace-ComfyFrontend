import { z } from 'zod';
const beatSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('original') }),
  z.object({ kind: z.literal('previous') }),
  z.object({ kind: z.literal('beat'), beatId: z.string().uuid() }),
]);
export const beatReplacementsSchema = z.object({
  characterId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  wardrobeId: z.string().uuid().nullable().optional(),
});
export const scriptContinuitySchema = z
  .object({
    dialoguePolicy: z.enum(['inherit', 'none', 'allow']).default('inherit'),
    audioCarry: z.boolean().default(true),
    blendFrames: z.number().int().min(0).max(24).default(0),
  })
  .default({ dialoguePolicy: 'inherit', audioCarry: true, blendFrames: 0 });
export const scriptBeatSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  prompt: z.string().max(10000),
  camera: z.string().max(1000).optional(),
  replacements: beatReplacementsSchema.optional(),
  duration: z.number().min(1).max(15).multipleOf(0.5),
  method: z.enum(['last', 'selected', 'motion']).default('last'),
  selectedSeconds: z.number().finite().min(0).max(300).default(0),
  source: beatSourceSchema,
});
export const continuationScriptSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(100),
  sourceVideo: z.string().uuid(),
  settings: z.record(z.string(), z.unknown()),
  continuity: scriptContinuitySchema.optional(),
  beats: z.array(scriptBeatSchema).min(1).max(64),
});
export type ScriptBeatInput = z.infer<typeof scriptBeatSchema>;
export type ContinuationScriptInput = z.infer<typeof continuationScriptSchema>;
export type ScriptBeat = ScriptBeatInput & {
  revision: number;
  stale: boolean;
  result?: { jobId: string; assetIds: string[]; deliveredDuration: number };
};
export type ContinuationScript = Omit<ContinuationScriptInput, 'beats'> & {
  schemaVersion: 1;
  updatedAt: string;
  beats: ScriptBeat[];
};
export type ContinuationSequence = {
  schemaVersion: 1;
  script: ContinuationScript;
  targetBeatId: string;
  beatIds: string[];
};

export function lineageBeatIds(beats: ScriptBeatInput[], targetBeatId: string): string[] {
  const issues = validateBeatSources(beats);
  if (issues.length) throw new Error(issues.join('\n'));
  const index = beats.findIndex((beat) => beat.id === targetBeatId);
  if (index < 0) throw new Error('Choose a beat in this script.');
  const lineage: string[] = [];
  let cursor: number | undefined = index;
  while (cursor !== undefined) {
    const beat = beats[cursor];
    lineage.unshift(beat.id);
    const parent = beatParent(beats, cursor);
    cursor = parent ? beats.findIndex((item) => item.id === parent) : undefined;
  }
  return lineage;
}

export function beatParent(beats: ScriptBeatInput[], index: number): string | null {
  const source = beats[index].source;
  return source.kind === 'beat'
    ? source.beatId
    : source.kind === 'previous' && index > 0
      ? beats[index - 1].id
      : null;
}
export function validateBeatSources(beats: ScriptBeatInput[]): string[] {
  const issues: string[] = [];
  const positions = new Map(beats.map((beat, index) => [beat.id, index]));
  if (positions.size !== beats.length) issues.push('Beat IDs must be unique.');
  beats.forEach((beat, index) => {
    const parent = beatParent(beats, index);
    if (parent && !positions.has(parent))
      issues.push(`${beat.name}: source beat was removed; choose Original or an earlier beat.`);
    else if (parent && positions.get(parent)! >= index)
      issues.push(
        `${beat.name}: source must be an earlier beat; cycles and forward references are not allowed.`,
      );
  });
  return issues;
}
/** Preserve completed media; changes invalidate only the affected lineage. */
export function reconcileScript(
  previous: ContinuationScript | undefined,
  input: ContinuationScriptInput,
): ContinuationScript {
  const issues = validateBeatSources(input.beats);
  if (issues.length) throw new Error(issues.join('\n'));
  if (previous && (previous.projectId !== input.projectId || previous.revision !== input.revision))
    throw new Error('Script changed since it was opened. Reload it before saving.');
  if (!previous && input.revision !== 0)
    throw new Error('New scripts must start at revision zero.');
  const globalChanged = Boolean(
    previous &&
    (previous.sourceVideo !== input.sourceVideo ||
      JSON.stringify(previous.settings) !== JSON.stringify(input.settings) ||
      JSON.stringify(scriptContinuitySchema.parse(previous.continuity)) !==
        JSON.stringify(scriptContinuitySchema.parse(input.continuity))),
  );
  const changed = new Set<string>();
  const fingerprint = (beat: ScriptBeatInput, parent: string | null) =>
    JSON.stringify([
      beat.prompt,
      beat.camera || '',
      beat.replacements || {},
      beat.duration,
      beat.method,
      beat.selectedSeconds,
      parent,
    ]);
  const beats = input.beats.map((beat, index): ScriptBeat => {
    const oldIndex = previous?.beats.findIndex((old) => old.id === beat.id) ?? -1;
    const old = previous?.beats[oldIndex];
    const parent = beatParent(input.beats, index);
    const dirty =
      globalChanged ||
      !old ||
      fingerprint(beat, parent) !== fingerprint(old, beatParent(previous!.beats, oldIndex)) ||
      Boolean(parent && changed.has(parent));
    if (dirty) changed.add(beat.id);
    return {
      ...beat,
      revision: old ? old.revision + (dirty ? 1 : 0) : 1,
      stale: Boolean(old?.result && (old.stale || dirty)),
      ...(old?.result ? { result: old.result } : {}),
    };
  });
  return {
    ...input,
    schemaVersion: 1,
    revision: (previous?.revision || 0) + 1,
    updatedAt: new Date().toISOString(),
    beats,
  };
}
