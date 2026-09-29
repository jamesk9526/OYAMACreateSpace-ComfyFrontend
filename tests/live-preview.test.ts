import { expect, it, vi } from 'vitest';
import type { Store } from '../electron/main/database';
import { ComfyBridge } from '../electron/main/comfy';
import { h3PreviewData } from '../electron/main/live-preview';
import type { Job } from '../shared/domain';

const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
it('rejects arbitrary URLs, unsupported types, mismatched nodes and oversized preview payloads', () => {
  expect(h3PreviewData({ node_id: '7', image, mime: 'image/jpeg' })).toBe(
    `data:image/jpeg;base64,${image}`,
  );
  for (const data of [
    { node_id: '19', image, mime: 'image/jpeg' },
    { node_id: '7', image: 'https://example.com/x', mime: 'image/jpeg' },
    { node_id: '7', image, mime: 'image/svg+xml' },
    { node_id: '7', image, mime: 'video/mp4' },
    { node_id: '7', image: 'a'.repeat(6 * 1024 * 1024 + 1), mime: 'image/jpeg' },
  ])
    expect(h3PreviewData(data)).toBeUndefined();
});
it('correlates transient previews to active owned H3 prompts and clears them on termination', async () => {
  let socket: { onmessage: (event: { data: string | ArrayBuffer }) => void };
  vi.stubGlobal(
    'WebSocket',
    class {
      static OPEN = 1;
      readyState = 1;
      binaryType = '';
      onmessage = (_event: { data: string | ArrayBuffer }) => {};
      onerror = () => {};
      constructor() {
        socket = this;
      }
      close() {}
      addEventListener(event: string, listener: () => void) {
        if (event === 'open') queueMicrotask(listener);
      }
    },
  );
  const job: Job = {
    id: 'job',
    projectId: 'project',
    moduleId: 'h3',
    status: 'running',
    promptId: 'owned',
    endpoint: 'http://localhost:8188',
    snapshot: { livePreview: true },
    assetIds: [],
    createdAt: '',
    progress: null,
    message: '',
    templateVersion: '',
  };
  const saveJob = vi.fn();
  const store = { jobs: () => [job], saveJob } as unknown as Store;
  const emit = vi.fn();
  const bridge = new ComfyBridge(store, emit, false, {
    image: undefined,
    video: undefined,
    audio: undefined,
  });
  try {
    await (bridge as unknown as { connect(endpoint: string): Promise<void> }).connect(job.endpoint);
    const send = (prompt_id: string, type = 'minimax_h3_preview') =>
      socket.onmessage({
        data: JSON.stringify({
          type,
          data: { prompt_id, node_id: '7', image, mime: 'image/jpeg' },
        }),
      });
    send('someone-else');
    expect(emit).not.toHaveBeenCalled();
    socket!.onmessage({ data: new ArrayBuffer(8) });
    expect(emit).not.toHaveBeenCalled();
    const before = saveJob.mock.calls.length;
    send('owned');
    expect(emit.mock.calls[0][0].job.preview).toBe(`data:image/jpeg;base64,${image}`);
    expect(saveJob).toHaveBeenCalledTimes(before);
    send('owned', 'execution_interrupted');
    expect(emit.mock.calls.at(-1)![0].job.preview).toBeUndefined();
    const count = emit.mock.calls.length;
    send('owned');
    expect(emit).toHaveBeenCalledTimes(count);
  } finally {
    bridge.close();
    vi.unstubAllGlobals();
  }
});
