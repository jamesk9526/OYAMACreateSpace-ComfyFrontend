import { expect, it, vi } from 'vitest';
import type { Store } from '../electron/main/database';
import { ComfyBridge } from '../electron/main/comfy';
import { generatorAdapters } from '../electron/main/modules';
import type { Asset, Job } from '../shared/domain';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function recoveryFixture(status: Job['status'] = 'running') {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'oyama-history-test-'));
  const file = path.join(folder, 'existing.png');
  await fs.writeFile(file, 'retained managed output');
  const job: Job = {
    id: 'owned-job',
    projectId: 'owned-project',
    moduleId: 'zimage',
    status,
    message: '',
    progress: 0.8,
    createdAt: '',
    endpoint: 'http://127.0.0.1:8188',
    promptId: 'existing-prompt',
    snapshot: {},
    templateVersion: '',
    assetIds: [],
    rawAssetIds: ['existing-asset'],
  };
  const asset: Asset = {
    id: 'existing-asset',
    projectId: job.projectId,
    kind: 'image',
    mime: 'image/png',
    name: 'existing.png',
    url: '',
    createdAt: '',
  };
  const store = {
    jobs: () => [job],
    saveJob: vi.fn(),
    asset: () => asset,
    assetPath: () => file,
  } as unknown as Store;
  const bridge = new ComfyBridge(store, vi.fn(), false, {
    image: undefined,
    video: undefined,
    audio: undefined,
  });
  vi.spyOn(
    bridge as unknown as { connect(endpoint: string): Promise<void> },
    'connect',
  ).mockResolvedValue();
  let completed = false;
  const requests = vi.spyOn(bridge, 'request').mockImplementation(async (_endpoint, route) => {
    if (route.startsWith('/history/'))
      return Response.json(
        completed
          ? {
              'existing-prompt': {
                status: { completed: true },
                outputs: {
                  '10': { images: [{ filename: 'existing.png', subfolder: '', type: 'output' }] },
                },
              },
            }
          : {},
      );
    if (route === '/queue') return Response.json({ queue_running: [], queue_pending: [] });
    throw new Error(`Unexpected request: ${route}`);
  });
  return {
    job,
    bridge,
    requests,
    complete: () => {
      completed = true;
    },
    cleanup: async () => {
      bridge.close();
      await fs.rm(folder, { recursive: true, force: true });
      vi.restoreAllMocks();
      vi.useRealTimers();
    },
  };
}

it('waits across queue/history publication gaps and saves the existing prompt without resubmission', async () => {
  vi.useFakeTimers();
  const fixture = await recoveryFixture();
  try {
    await vi.advanceTimersByTimeAsync(1800);
    expect(fixture.job.status).toBe('recovering');
    expect(fixture.job.message).toContain('no resubmission');
    fixture.complete();
    await vi.advanceTimersByTimeAsync(1800);
    expect(fixture.job.status).toBe('complete');
    expect(fixture.job.assetIds).toEqual(['existing-asset']);
    expect(
      fixture.requests.mock.calls.every(
        (call) => call[1].startsWith('/history/') || call[1] === '/queue',
      ),
    ).toBe(true);
  } finally {
    await fixture.cleanup();
  }
});

it('reconciles a persisted unknown job only through its known prompt ID', async () => {
  vi.useFakeTimers();
  const fixture = await recoveryFixture('unknown');
  try {
    expect(fixture.job.status).toBe('recovering');
    fixture.complete();
    await vi.advanceTimersByTimeAsync(1800);
    expect(fixture.job.status).toBe('complete');
    expect(fixture.requests.mock.calls.map((call) => call[1])).toEqual([
      '/history/existing-prompt',
    ]);
  } finally {
    await fixture.cleanup();
  }
});

it('bounds missing-history grace, backs off passive checks and respects local dismissal', async () => {
  vi.useFakeTimers();
  const fixture = await recoveryFixture();
  try {
    await vi.advanceTimersByTimeAsync(33600);
    expect(fixture.job.status).toBe('unknown');
    const before = fixture.requests.mock.calls.length;
    await vi.advanceTimersByTimeAsync(15000);
    expect(fixture.requests.mock.calls).toHaveLength(before);
    let unblock!: (value: Response) => void;
    fixture.requests.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          unblock = resolve;
        }),
    );
    await vi.advanceTimersByTimeAsync(15000);
    await fixture.bridge.cancel(fixture.job.id);
    unblock(Response.json({}));
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.job.status).toBe('cancelled');
    expect(fixture.job.message).toContain('No server job was stopped or resubmitted');
  } finally {
    await fixture.cleanup();
  }
});

it('closing during capability inspection prevents later workflow submission', async () => {
  const store = {
    jobs: () => [],
    project: () => ({}),
    snapshot: () => ({ records: [] }),
    settings: () => ({ comfyUrl: 'http://127.0.0.1:8188' }),
    saveDraft: vi.fn(),
    saveJob: vi.fn(),
  } as unknown as Store;
  const bridge = new ComfyBridge(store, vi.fn(), false, {
    image: undefined,
    video: undefined,
    audio: undefined,
  });
  let unblock!: (value: Response) => void;
  const inspection = new Promise<Response>((resolve) => {
    unblock = resolve;
  });
  const requests = vi
    .spyOn(bridge, 'request')
    .mockImplementation(async (_endpoint, route) =>
      route === '/object_info' ? inspection : Response.json({ prompt_id: 'unexpected-submission' }),
    );
  const connect = vi
    .spyOn(bridge as unknown as { connect(endpoint: string): Promise<void> }, 'connect')
    .mockResolvedValue();
  vi.spyOn(generatorAdapters.h3, 'compile').mockReturnValue({});
  try {
    await bridge.start({
      projectId: '33333333-3333-4333-8333-333333333333',
      moduleId: 'h3',
      values: { prompt: 'A quiet scene.' },
    });
    bridge.close();
    unblock(Response.json({}));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requests.mock.calls.map((call) => call[1])).toEqual(['/object_info']);
    expect(connect).not.toHaveBeenCalled();
  } finally {
    bridge.close();
    vi.restoreAllMocks();
  }
});
