import { afterEach, expect, it, vi } from 'vitest';
import { planRippleChunks } from '../shared/ripple-batch';
import type { Job } from '../shared/domain';
import { rippleDefaults } from '../src/modules/ripple/definition';
import { RippleBatchRunner } from '../electron/main/ripple-batch';
import type { Store } from '../electron/main/database';
import type { ComfyBridge } from '../electron/main/comfy';
const probe = {
  duration: 4,
  video: {
    kind: 'video',
    codec: 'h264',
    frames: 96,
    fps: 24,
    width: 512,
    height: 288,
    duration: 4,
  },
  audio: { kind: 'audio', codec: 'aac' },
  streams: [],
};
const mocks = vi.hoisted(() => ({ assemble: vi.fn() }));
vi.mock('../electron/main/media', () => ({
  MediaService: class {
    async probe(file: string) {
      return file === 'source.mp4' ? probe : { ...probe, video: { ...probe.video, frames: 49 } };
    }
    assembleRipple = mocks.assemble;
  },
}));
const runners: RippleBatchRunner[] = [];
afterEach(() => {
  runners.forEach((runner) => runner.close());
  runners.length = 0;
  vi.clearAllMocks();
});
function fixture() {
  const source = '11111111-1111-4111-8111-111111111111',
    image = '22222222-2222-4222-8222-222222222222',
    projectId = '33333333-3333-4333-8333-333333333333';
  const jobs = new Map<string, Job>();
  const store = {
    root: 'artifacts/batch-unit',
    project: vi.fn(),
    asset: (id: string) => ({
      id,
      projectId,
      kind: id === source ? 'video' : 'image',
      media: probe,
    }),
    assetPath: (id: string) => (id === source ? 'source.mp4' : `${id}.mp4`),
    saveMediaProbe: vi.fn(),
    saveDraft: vi.fn(),
    settings: () => ({ comfyUrl: 'http://127.0.0.1:8188' }),
    jobs: () => structuredClone([...jobs.values()]),
    saveJob: (job: Job) => jobs.set(job.id, structuredClone(job)),
    snapshot: () => ({ assets: [] }),
    importFile: vi.fn(async () => ({ id: 'joined' })),
    registerDerivation: vi.fn(() => ({ id: 'joined' })),
  };
  const start = vi.fn(async (draft, batch): Promise<Job> => {
    const child: Job = {
      id: `child-${start.mock.calls.length}`,
      moduleId: 'ripple',
      projectId,
      snapshot: {
        ...draft.values,
        batchParentId: batch.parentId,
        batchChunkIndex: batch.chunkIndex,
      },
      status: 'queued',
      message: 'Queued',
      promptId: `known-${start.mock.calls.length}`,
      endpoint: batch.endpoint,
      progress: 0,
      createdAt: '',
      templateVersion: '',
      assetIds: [],
    };
    store.saveJob(child);
    return child;
  });
  const cancel = vi.fn(async (id: string) => {
    const child = jobs.get(id)!;
    child.status = 'cancelled';
    child.message = 'Cancellation requested';
  });
  const bridge = { start, cancel, mock: false };
  const runner = new RippleBatchRunner(
    store as unknown as Store,
    bridge as unknown as ComfyBridge,
    vi.fn(),
  );
  runners.push(runner);
  const draft = {
    projectId,
    moduleId: 'ripple',
    values: {
      ...rippleDefaults,
      mode: 'long',
      longDuration: 4,
      chunkSeconds: 2,
      overlapSeconds: 0,
      sourceVideo: source,
      replacementFrame: image,
      width: 512,
      height: 288,
      seed: '10',
    },
  };
  return { runner, store, bridge, jobs, draft };
}
it('pads a short tail without losing coverage and validates overlap/clip bounds', () => {
  const chunks = planRippleChunks(49 / 24, 2, 0);
  expect(chunks.map((chunk) => [chunk.startFrame, chunk.sourceFrames, chunk.outputFrames])).toEqual(
    [
      [0, 48, 49],
      [48, 48, 49],
    ],
  );
  const overlapping = planRippleChunks(4, 2, 0.5);
  expect(overlapping.map((chunk) => chunk.startFrame)).toEqual([0, 36, 72]);
  expect(overlapping.at(-1)!.sourceFrames).toBe(48);
  expect(() => planRippleChunks(4, 2, 1)).toThrow('half a chunk');
  expect(() => planRippleChunks(301, 5, 0)).toThrow('2–300');
});
it('discovers a saved child after restart and never resubmits an uncertain chunk', async () => {
  const f = fixture(),
    parent = await f.runner.start(f.draft);
  await vi.waitFor(() => expect(f.bridge.start).toHaveBeenCalledTimes(1));
  await f.runner.tick();
  f.runner.close();
  f.jobs.get('child-1')!.status = 'unknown';
  const runner = new RippleBatchRunner(
    f.store as unknown as Store,
    f.bridge as unknown as ComfyBridge,
    vi.fn(),
  );
  runners.push(runner);
  await runner.tick();
  await runner.tick();
  expect(f.bridge.start).toHaveBeenCalledTimes(1);
  expect(f.jobs.get(parent.id)!.message).toContain('Chunk 1/2');
  expect(() => runner.resume(parent.id)).toThrow('Only stopped');
});
it('cancels only its child and resumes without rerendering completed chunks', async () => {
  const f = fixture(),
    parent = await f.runner.start(f.draft);
  await vi.waitFor(() => expect(f.bridge.start).toHaveBeenCalledTimes(1));
  await f.runner.tick();
  const first = f.jobs.get('child-1')!;
  first.status = 'complete';
  first.assetIds = ['raw-1'];
  await f.runner.tick();
  await vi.waitFor(() => expect(f.bridge.start).toHaveBeenCalledTimes(2));
  await f.runner.cancel(parent.id);
  await vi.waitFor(() => expect(f.bridge.cancel).toHaveBeenCalledWith('child-2'));
  f.runner.resume(parent.id);
  await vi.waitFor(() => expect(f.bridge.start).toHaveBeenCalledTimes(3));
  expect(f.bridge.start.mock.calls[2][1].chunkIndex).toBe(1);
  expect(first.assetIds).toEqual(['raw-1']);
});
it('assembly failure preserves chunks and retry performs no new Comfy submission', async () => {
  const f = fixture(),
    parent = await f.runner.start(f.draft);
  await vi.waitFor(() => expect(f.bridge.start).toHaveBeenCalledTimes(1));
  await f.runner.tick();
  f.jobs.get('child-1')!.status = 'complete';
  f.jobs.get('child-1')!.assetIds = ['raw-1'];
  await f.runner.tick();
  await vi.waitFor(() => expect(f.bridge.start).toHaveBeenCalledTimes(2));
  f.jobs.get('child-2')!.status = 'complete';
  f.jobs.get('child-2')!.assetIds = ['raw-2'];
  mocks.assemble.mockRejectedValueOnce(new Error('disk failure')).mockResolvedValue(probe);
  await f.runner.tick();
  await vi.waitFor(() => expect(f.jobs.get(parent.id)!.status).toBe('error'));
  f.runner.resume(parent.id);
  await vi.waitFor(() => expect(f.jobs.get(parent.id)!.status).toBe('complete'));
  expect(f.bridge.start).toHaveBeenCalledTimes(2);
  expect(f.jobs.get(parent.id)!.assetIds).toEqual(['joined', 'raw-1', 'raw-2']);
});
