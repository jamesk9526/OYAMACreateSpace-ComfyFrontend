import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  reconcileScript,
  lineageBeatIds,
  validateBeatSources,
  type ContinuationScriptInput,
} from '../shared/continuation';
const make = (): ContinuationScriptInput => ({
  id: randomUUID(),
  projectId: randomUUID(),
  revision: 0,
  name: 'Branch plan',
  sourceVideo: randomUUID(),
  settings: { width: 512, height: 288 },
  beats: [0, 1, 2, 3].map((index) => ({
    id: randomUUID(),
    name: `Beat ${index + 1}`,
    prompt: `Action ${index}`,
    duration: 1,
    method: 'last',
    selectedSeconds: 0,
    source: { kind: index === 0 || index === 3 ? 'original' : 'previous' },
  })),
});
it('plans only the selected ancestry, including earlier-beat branches', () => {
  const input = make();
  input.beats[3].source = { kind: 'beat', beatId: input.beats[1].id };
  expect(lineageBeatIds(input.beats, input.beats[3].id)).toEqual([
    input.beats[0].id,
    input.beats[1].id,
    input.beats[3].id,
  ]);
  expect(lineageBeatIds(input.beats, input.beats[2].id)).toEqual(
    input.beats.slice(0, 3).map((beat) => beat.id),
  );
  expect(() => lineageBeatIds(input.beats, randomUUID())).toThrow('Choose a beat');
});
it('rejects duplicates, removed parents, cycles and forward references', () => {
  const input = make();
  expect(validateBeatSources(input.beats)).toEqual([]);
  input.beats[0].source = { kind: 'beat', beatId: input.beats[1].id };
  expect(() => reconcileScript(undefined, input)).toThrow('cycles and forward');
  input.beats[0].source = { kind: 'original' };
  input.beats[2].source = { kind: 'beat', beatId: randomUUID() };
  expect(() => reconcileScript(undefined, input)).toThrow('removed');
  input.beats[2].source = { kind: 'original' };
  input.beats[1].id = input.beats[0].id;
  expect(() => reconcileScript(undefined, input)).toThrow('unique');
});
it('marks edited parents and their descendants stale while retaining unrelated branches and assets', () => {
  const input = make();
  const previous = reconcileScript(undefined, input);
  previous.beats.forEach(
    (beat) =>
      (beat.result = { jobId: randomUUID(), assetIds: [randomUUID()], deliveredDuration: 22 / 24 }),
  );
  const edited = { ...previous, beats: previous.beats.map((beat) => ({ ...beat })) };
  edited.beats[0].prompt = 'Changed action';
  const result = reconcileScript(previous, edited);
  expect(result.beats.map((beat) => beat.stale)).toEqual([true, true, true, false]);
  expect(result.beats.map((beat) => beat.result)).toEqual(
    previous.beats.map((beat) => beat.result),
  );
  expect(result.beats.map((beat) => beat.revision)).toEqual([2, 2, 2, 1]);
  expect(() => reconcileScript(result, edited)).toThrow('Reload');
});
it('invalidates only camera descendants and treats omitted continuity as its default', () => {
  const input = make();
  const previous = reconcileScript(undefined, input);
  previous.beats.forEach(
    (beat) =>
      (beat.result = {
        jobId: randomUUID(),
        assetIds: [randomUUID()],
        deliveredDuration: 1,
      }),
  );
  const camera = reconcileScript(previous, {
    ...previous,
    beats: previous.beats.map((beat, index) =>
      index === 1 ? { ...beat, camera: 'Track left' } : beat,
    ),
  });
  expect(camera.beats.map((beat) => beat.stale)).toEqual([false, true, true, false]);
  const unchanged = reconcileScript(camera, {
    ...camera,
    continuity: { dialoguePolicy: 'inherit', audioCarry: true, blendFrames: 0 },
  });
  expect(unchanged.beats.map((beat) => beat.revision)).toEqual(
    camera.beats.map((beat) => beat.revision),
  );
  const muted = reconcileScript(unchanged, {
    ...unchanged,
    continuity: { dialoguePolicy: 'none', audioCarry: false, blendFrames: 0 },
  });
  expect(muted.beats.every((beat) => beat.stale)).toBe(true);
  const blended = reconcileScript(unchanged, {
    ...unchanged,
    continuity: { dialoguePolicy: 'inherit', audioCarry: true, blendFrames: 6 },
  });
  expect(blended.beats.every((beat) => beat.stale)).toBe(true);
});
it('invalidates the changed beat and descendants when an owned replacement changes', () => {
  const previous = reconcileScript(undefined, make());
  previous.beats.forEach(
    (beat) =>
      (beat.result = { jobId: randomUUID(), assetIds: [randomUUID()], deliveredDuration: 1 }),
  );
  const edited = reconcileScript(previous, {
    ...previous,
    beats: previous.beats.map((beat, index) =>
      index === 1 ? { ...beat, replacements: { characterId: randomUUID() } } : beat,
    ),
  });
  expect(edited.beats.map((beat) => beat.stale)).toEqual([false, true, true, false]);
});
it('reordering previous sources invalidates the changed lineage and deletion leaves explicit references invalid', () => {
  const input = make();
  input.beats[1].source = { kind: 'original' };
  input.beats[2].source = { kind: 'previous' };
  const previous = reconcileScript(undefined, input);
  previous.beats.forEach(
    (beat) => (beat.result = { jobId: randomUUID(), assetIds: [], deliveredDuration: 1 }),
  );
  const reordered = {
    ...previous,
    beats: [previous.beats[1], previous.beats[0], previous.beats[2], previous.beats[3]],
  };
  const result = reconcileScript(previous, reordered);
  expect(result.beats.map((beat) => beat.stale)).toEqual([false, false, true, false]);
  result.beats[2].source = { kind: 'beat', beatId: result.beats[0].id };
  const deleted = { ...result, beats: result.beats.slice(1) };
  expect(() => reconcileScript(result, deleted)).toThrow('removed');
});
