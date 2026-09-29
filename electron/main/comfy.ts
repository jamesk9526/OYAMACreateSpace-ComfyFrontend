import fs, { openAsBlob } from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import type { AppEvent, Draft, Job, Readiness } from '../../shared/domain';
import { livePreviewDefaults } from '../../shared/domain';
import { nodeChoices, type ObjectInfo, type WorkflowUpload } from '../../shared/modules';
import { Store } from './database';
import { generatorAdapters } from './modules';
import { h3PreviewData } from './live-preview';
import {
  maxContextBytes,
  validateGenerationContext,
  stageGenerationContext,
} from './generation-context';
import {
  applyGpuRouting,
  gpuRoutingDefaults,
  gpuRoutingSchema,
  routingChoices,
  type GpuRouting,
} from '../../shared/gpu-routing';

type HistoryEntry = {
  outputs?: Record<string, unknown>;
  status?: { completed?: boolean; status_str?: string; messages?: unknown[] };
};
type Queue = { queue_running: unknown[][]; queue_pending: unknown[][] };
const active = (job: Job) =>
  ['preparing', 'submitting', 'queued', 'running', 'recovering'].includes(job.status);
const cancelled = (job: Job) => job.status === 'cancelled';
const observable = (job: Job) => active(job) || (job.status === 'unknown' && Boolean(job.promptId));
class ComfyHTTPError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export class ComfyBridge {
  private jobs = new Map<string, Job>();
  private sockets = new Map<string, WebSocket>();
  private polling = false;
  private missingSince = new Map<string, number>();
  private nextUnknownCheck = new Map<string, number>();
  private timer: ReturnType<typeof setInterval>;
  private closed = false;
  private clientId = randomUUID();
  constructor(
    private store: Store,
    private emit: (event: AppEvent) => void,
    readonly mock: boolean,
    private mockSamples: Record<'image' | 'video' | 'audio', string | undefined>,
  ) {
    for (const job of store
      .jobs()
      .filter((job) => observable(job) && !job.batch && !job.sequence)) {
      const stoppedBeforeSubmission = job.status === 'preparing' && !job.promptId;
      job.status =
        mock || stoppedBeforeSubmission ? 'cancelled' : job.promptId ? 'recovering' : 'unknown';
      job.message = mock
        ? 'Mock session ended'
        : stoppedBeforeSubmission
          ? 'App closed before submission; prepared inputs are retained.'
          : job.promptId
            ? 'Reconnecting to existing render'
            : 'Submission outcome unknown; inspect ComfyUI history before retrying.';
      this.jobs.set(job.id, job);
      store.saveJob(job);
    }
    this.timer = setInterval(() => void this.poll(), 1800);
  }
  async request(endpoint: string, route: string, init?: RequestInit, timeout = 20000) {
    const response = await fetch(endpoint.replace(/\/$/, '') + route, {
      ...init,
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok)
      throw new ComfyHTTPError(
        response.status,
        `ComfyUI ${response.status}: ${(await response.text()).slice(0, 1500)}`,
      );
    return response;
  }
  async inspect(): Promise<Readiness> {
    const endpoint = this.store.settings().comfyUrl;
    try {
      if (this.mock) {
        if (this.store.settings().mockScenario === 'disconnected')
          throw new Error('Mock server is offline');
        return {
          connected: true,
          mock: true,
          message: 'Mock ComfyUI · simulated results',
          devices: [
            {
              index: 0,
              name: 'Mock RTX 3090',
              vram_total: 24 * 1024 ** 3,
              vram_free: 16 * 1024 ** 3,
            },
          ],
          nodes: [],
          routing: {
            diffusion: ['auto', 'cpu', 'gpu:0'],
            textEncoder: ['auto', 'cpu', 'gpu:0'],
            videoVae: ['auto', 'gpu:0'],
            audioVae: ['auto', 'gpu:0'],
          },
          queue: { running: 0, pending: 0 },
          models: {
            diffusion: [],
            encoder: [],
            vae: [],
            lora: [
              'minimax_h3_fl2v_turbo_8step_mock.safetensors',
              'minimax_h3_ref2v_turbo_8step_mock.safetensors',
            ],
          },
        };
      }
      const [info, stats, queue] = await Promise.all([
        this.request(endpoint, '/object_info').then((r) => r.json()) as Promise<ObjectInfo>,
        this.request(endpoint, '/system_stats').then((r) => r.json()) as Promise<{
          devices: Readiness['devices'];
        }>,
        this.request(endpoint, '/queue')
          .then((r) => r.json() as Promise<Queue>)
          .catch(() => null),
      ]);
      return {
        connected: true,
        mock: false,
        message: 'ComfyUI Connected',
        devices: stats.devices || [],
        nodes: Object.keys(info),
        routing: routingChoices(info),
        ...(queue
          ? { queue: { running: queue.queue_running.length, pending: queue.queue_pending.length } }
          : {}),
        models: {
          diffusion: nodeChoices(info, 'UNETLoader', 'unet_name'),
          encoder: nodeChoices(info, 'CLIPLoader', 'clip_name'),
          vae: nodeChoices(info, 'VAELoader', 'vae_name'),
          lora: nodeChoices(info, 'LoraLoaderModelOnly', 'lora_name'),
          upscaler: nodeChoices(info, 'LatentUpscaleModelLoader', 'model_name'),
          msrLora: nodeChoices(info, 'ComfyUILTX25MSRICLoRALoader', 'lora_name'),
          gguf: nodeChoices(info, 'UnetLoaderGGUF', 'unet_name'),
        },
      };
    } catch (error) {
      return {
        connected: false,
        mock: this.mock,
        message: (error as Error).message,
        devices: [],
        nodes: [],
        models: {},
      };
    }
  }
  private update(job: Job, patch: Partial<Job>) {
    if (this.closed) return;
    Object.assign(job, patch);
    if (!active(job)) job.preview = undefined;
    this.store.saveJob(job);
    this.emit({ type: 'job', job: { ...job } });
  }
  async start(
    draft: Draft,
    batch?: {
      parentId: string;
      chunkIndex: number;
      endpoint: string;
      routing: GpuRouting;
      sequenceBeatId?: string;
    },
  ): Promise<Job> {
    const adapter = generatorAdapters[draft.moduleId];
    if (!adapter) throw new Error('Generator unavailable');
    this.store.project(draft.projectId);
    const prepared = adapter.prepare ? await adapter.prepare(draft, this.store) : draft;
    if (this.closed) throw new Error('The application is closing; no workflow was submitted.');
    const resolved = adapter.resolve(
      prepared,
      this.store.snapshot('', this.mock).records,
      (id) => this.store.asset(id),
      this.store.jobs(),
    );
    if (!String(resolved.values.prompt).trim()) throw new Error('Describe your shot first.');
    const seed =
      resolved.values.seed === 'Random' ? randomInt(2147483647) : Number(resolved.values.seed);
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295)
      throw new Error('Seed must be Random or an integer from 0 to 4294967295');
    const settings = this.store.settings();
    const previewSettings = settings.livePreview ?? livePreviewDefaults;
    const job: Job = {
      id: randomUUID(),
      projectId: draft.projectId,
      moduleId: draft.moduleId,
      createdAt: new Date().toISOString(),
      status: 'preparing',
      message: 'Checking workflow and inputs',
      progress: null,
      endpoint: batch?.endpoint ?? settings.comfyUrl,
      snapshot: {
        ...resolved.values,
        seed: String(seed),
        engineRouting: batch?.routing ?? settings.gpuRouting ?? gpuRoutingDefaults,
        ...(['h3', 'continue'].includes(draft.moduleId)
          ? {
              previewFrames: previewSettings.frames,
              previewFps: previewSettings.fps,
            }
          : {}),
        ...(batch?.sequenceBeatId
          ? { sequenceParentId: batch.parentId, sequenceBeatId: batch.sequenceBeatId }
          : batch
            ? { batchParentId: batch.parentId, batchChunkIndex: batch.chunkIndex }
            : {}),
      },
      templateVersion: adapter.version,
      assetIds: [],
    };
    this.jobs.set(job.id, job);
    if (!batch)
      this.store.saveDraft(
        draft.moduleId === 'h3'
          ? { ...prepared, values: { ...prepared.values, mode: resolved.values.mode } }
          : prepared,
      );
    this.store.saveJob(job);
    void this.submit(job, resolved.assetIds).catch((error) => {
      if (job.status === 'cancelled') return;
      const rejected = error instanceof ComfyHTTPError && error.status >= 400 && error.status < 500;
      const uncertain = job.status === 'submitting' && !rejected;
      this.update(job, {
        status: uncertain ? 'unknown' : 'error',
        message: uncertain
          ? `Submission uncertain: ${(error as Error).message}. Check ComfyUI history before retrying.`
          : (error as Error).message,
      });
    });
    return job;
  }
  private async submit(job: Job, ids: string[]) {
    if (this.mock) {
      if (this.store.settings().mockScenario === 'disconnected')
        throw new Error('Mock ComfyUI is offline.');
      this.update(job, {
        status: 'queued',
        promptId: `mock-${job.id}`,
        message: 'Waiting in mock queue',
      });
      for (let i = 1; i <= 8; i++) {
        await new Promise((r) => setTimeout(r, 350));
        if (cancelled(job) || this.closed) return;
        this.update(job, { status: 'running', progress: i / 8, message: `Mock sampler ${i}/8` });
      }
      if (this.store.settings().mockScenario === 'error')
        throw new Error(
          'Simulated generation failure. Change the mock scenario in Settings to retry.',
        );
      const adapter = generatorAdapters[job.moduleId];
      const sample = this.mockSamples[adapter.outputKind];
      if (!sample) throw new Error(`No mock ${adapter.outputKind} fixture is bundled.`);
      const asset = await this.store.importFile(sample, job.projectId, adapter.mockFilename);
      this.update(job, { rawAssetIds: [asset.id] });
      const outputs = adapter.finalize ? await adapter.finalize(job, [asset], this.store) : [asset];
      if (cancelled(job) || this.closed) return;
      this.update(job, {
        status: 'complete',
        progress: 1,
        message: `Mock ${adapter.outputLabel.toLowerCase()} ready`,
        assetIds: outputs.map((output) => output.id),
      });
      this.emit({ type: 'library' });
      return;
    }
    const adapter = generatorAdapters[job.moduleId];
    const info = (await (await this.request(job.endpoint, '/object_info')).json()) as ObjectInfo;
    if (cancelled(job) || this.closed) return;
    let uploadLimit = adapter.maxUploadBytes;
    if (uploadLimit) {
      try {
        const features = (await (await this.request(job.endpoint, '/features')).json()) as {
          max_upload_size?: unknown;
        };
        if (
          typeof features.max_upload_size === 'number' &&
          Number.isFinite(features.max_upload_size) &&
          features.max_upload_size > 0
        )
          uploadLimit = features.max_upload_size;
      } catch {
        /* Older servers use the module's bounded fallback. */
      }
    }
    const placeholders: WorkflowUpload[] = ids.map((id) => ({
      id,
      kind: this.store.asset(id).kind,
      name: this.store.asset(id).name,
    }));
    const contextAsset = adapter.context?.sourceAsset(job.snapshot);
    if (contextAsset) job.snapshot.contextUploadPath = `CreateSpaceContext/${job.id}.safetensors`;
    const routing = gpuRoutingSchema.parse(job.snapshot.engineRouting ?? gpuRoutingDefaults);
    const routingStats =
      routing.preset === 'auto'
        ? { devices: [] }
        : ((await (await this.request(job.endpoint, '/system_stats')).json()) as {
            devices: Readiness['devices'];
          });
    const preflight = adapter.compile(
      job.snapshot,
      info,
      placeholders,
      Number(job.snapshot.seed),
      `CreateSpace/${job.id}`,
    );
    applyGpuRouting(preflight, info, routing, routingStats.devices);
    const uploaded: WorkflowUpload[] = [];
    if (contextAsset) {
      const context = this.store.asset(contextAsset);
      if (context.projectId && context.projectId !== job.projectId)
        throw new Error('H3 context belongs to a different project.');
      const source = this.store.contextPath(contextAsset);
      await validateGenerationContext(source);
      const { size } = await fsp.stat(source);
      if (uploadLimit && size > uploadLimit)
        throw new Error(
          `Saved H3 latents exceed ComfyUI's ${(uploadLimit / 1024 ** 2).toFixed(0)} MB upload limit. Select Trailing video frames or a shorter/smaller H3 source.`,
        );
      if (cancelled(job) || this.closed) return;
      job.snapshot.contextUploadPath = await stageGenerationContext(source, job.id, async (form) =>
        (
          await this.request(job.endpoint, '/upload/image', { method: 'POST', body: form }, 120000)
        ).json(),
      );
      if (cancelled(job) || this.closed) return;
    }
    for (const id of ids) {
      if (job.status === 'cancelled') return;
      const asset = this.store.asset(id);
      const temporary = path.join(this.store.root, `upload-${job.id}-${id}.mp4`);
      try {
        const source = adapter.prepareUpload
          ? await adapter.prepareUpload(job.snapshot, asset, this.store.assetPath(id), temporary)
          : this.store.assetPath(id);
        if (cancelled(job) || this.closed) return;
        if (uploadLimit) {
          const { size } = await fsp.stat(source);
          if (size > uploadLimit)
            throw new Error(
              `Input exceeds ComfyUI’s ${(uploadLimit / 1024 ** 2).toFixed(0)} MB upload limit. Use a shorter clip in Assets or a smaller replacement image and retry.`,
            );
        }
        const form = new FormData();
        form.append('image', await openAsBlob(source), `${id}${path.extname(source)}`);
        form.append('overwrite', 'false');
        const result = (await (
          await this.request(job.endpoint, '/upload/image', { method: 'POST', body: form }, 120000)
        ).json()) as { name: string; subfolder?: string };
        uploaded.push({
          id,
          kind: asset.kind,
          name: result.subfolder ? `${result.subfolder}/${result.name}` : result.name,
        });
      } finally {
        await fsp.rm(temporary, { force: true });
      }
    }
    if (cancelled(job) || this.closed) return;
    const compiled = adapter.compile(
      job.snapshot,
      info,
      uploaded,
      Number(job.snapshot.seed),
      `CreateSpace/${job.id}`,
    );
    const { graph, placements } = applyGpuRouting(compiled, info, routing, routingStats.devices);
    job.snapshot.routingPlacements = placements;
    if (adapter.context && graph[adapter.context.saveNode]) {
      job.snapshot.contextSaved = true;
      job.snapshot.contextRenderFrames = adapter.context.frames(job.snapshot);
    }
    await this.connect(job.endpoint);
    if (cancelled(job) || this.closed) return;
    this.update(job, { status: 'submitting', message: 'Submitting workflow' });
    const response = await this.request(job.endpoint, '/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: graph,
        client_id: this.clientId,
        extra_data: { createspace_job_id: job.id },
      }),
    });
    const result = (await response.json()) as { prompt_id?: string; error?: unknown };
    if (!result.prompt_id) {
      this.update(job, {
        status: 'error',
        message: JSON.stringify(result.error || 'Server returned no prompt ID'),
      });
      return;
    }
    this.update(job, {
      promptId: result.prompt_id,
      status: 'queued',
      message: 'Waiting in ComfyUI queue',
    });
  }
  private async connect(endpoint: string) {
    if (this.sockets.get(endpoint)?.readyState === WebSocket.OPEN) return;
    this.sockets.get(endpoint)?.close();
    const url = new URL(endpoint.replace(/\/$/, '') + '/ws');
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('clientId', this.clientId);
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.sockets.set(endpoint, ws);
    ws.onmessage = (event) => {
      try {
        if (event.data instanceof ArrayBuffer) return; // Final media is authoritative; no uncorrelated binary previews.
        const message = JSON.parse(String(event.data)) as {
          type: string;
          data: {
            prompt_id?: string;
            node?: string;
            value?: number;
            max?: number;
            exception_message?: string;
            node_id?: string;
            image?: string;
            mime?: string;
          };
        };
        const job = [...this.jobs.values()].find(
          (j) => j.endpoint === endpoint && j.promptId === message.data?.prompt_id && active(j),
        );
        if (!job) return;
        if (
          message.type === 'minimax_h3_preview' &&
          ['h3', 'continue'].includes(job.moduleId) &&
          job.snapshot.livePreview !== false
        ) {
          const preview = h3PreviewData(message.data);
          if (preview) {
            job.preview = preview;
            this.emit({ type: 'job', job: { ...job } });
          }
        } else if (message.type === 'progress') {
          const fraction = message.data.max ? (message.data.value || 0) / message.data.max : null;
          const quality = job.moduleId === 'ltx' && job.snapshot.profile === 'quality';
          const refinement = quality && message.data.node === '38';
          this.update(job, {
            status: 'running',
            progress:
              fraction === null
                ? null
                : quality
                  ? refinement
                    ? 0.45 + fraction * 0.45
                    : fraction * 0.45
                  : fraction,
            message:
              job.moduleId === 'ltx'
                ? `${refinement ? 'Refinement' : 'First stage'} sampling ${message.data.value ?? '?'}/${message.data.max ?? '?'}`
                : `Sampling ${message.data.value ?? '?'}/${message.data.max ?? '?'}`,
          });
        } else if (message.type === 'executing' && message.data.node) {
          const stage: Record<string, string> = {
            '15': 'Sampling first stage',
            '31': 'Upscaling latent video',
            '38': 'Sampling refinement',
            '40': 'Decoding video',
            '41': 'Decoding audio',
            '43': 'Saving video',
          };
          this.update(job, {
            status: 'running',
            message:
              job.moduleId === 'ltx'
                ? stage[message.data.node] || `Executing node ${message.data.node}`
                : `Executing node ${message.data.node}`,
          });
        } else if (message.type === 'execution_error')
          this.update(job, {
            status: 'error',
            message: message.data.exception_message || 'ComfyUI execution failed',
          });
        else if (message.type === 'execution_interrupted')
          this.update(job, { status: 'cancelled', message: 'Render interrupted' });
        else if (message.type === 'execution_success') void this.poll();
      } catch {
        /* Malformed unrelated server messages do not change a job. */
      }
    };
    ws.onerror = () => {};
    await Promise.race([
      new Promise<void>((resolve) => {
        ws.addEventListener('open', () => resolve(), { once: true });
        ws.addEventListener('error', () => resolve(), { once: true });
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
  private async poll() {
    if (this.polling || this.mock || this.closed) return;
    this.polling = true;
    try {
      for (const job of [...this.jobs.values()].filter((j) => observable(j) && j.promptId)) {
        if (job.status === 'unknown' && Date.now() < (this.nextUnknownCheck.get(job.id) || 0))
          continue;
        try {
          await this.connect(job.endpoint);
          const history = (await (
            await this.request(job.endpoint, `/history/${encodeURIComponent(job.promptId!)}`)
          ).json()) as Record<string, HistoryEntry>;
          if (cancelled(job) || this.closed) continue;
          const entry = history[job.promptId!];
          if (entry) {
            this.missingSince.delete(job.id);
            this.nextUnknownCheck.delete(job.id);
          }
          if (entry?.status?.status_str === 'error') {
            this.update(job, {
              status: 'error',
              message: JSON.stringify(entry.status.messages).slice(0, 1500),
            });
            continue;
          }
          if (entry?.status?.completed) {
            const files = generatorAdapters[job.moduleId].outputs(entry.outputs || {});
            if (!files.length)
              throw new Error(
                `Workflow completed without the expected ${generatorAdapters[job.moduleId].outputKind} output`,
              );
            const assetIds: string[] = [...(job.rawAssetIds || [])];
            for (const [index, file] of files.entries()) {
              if (assetIds[index] && fs.existsSync(this.store.assetPath(assetIds[index]))) continue;
              const response = await this.request(
                job.endpoint,
                `/view?${new URLSearchParams(file)}`,
                undefined,
                120000,
              );
              if (!response.body) throw new Error('Empty output download');
              const temp = path.join(
                this.store.root,
                `${job.id}-${randomUUID()}${path.extname(file.filename)}`,
              );
              try {
                await pipeline(
                  Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
                  fs.createWriteStream(temp),
                );
                assetIds[index] = (
                  await this.store.importFile(temp, job.projectId, path.basename(file.filename))
                ).id;
                this.update(job, { rawAssetIds: [...assetIds], message: 'Saving generated media' });
              } finally {
                await fsp.rm(temp, { force: true });
              }
            }
            const adapter = generatorAdapters[job.moduleId];
            const rawAssets = assetIds.map((id) => this.store.asset(id));
            if (adapter.finalize) this.update(job, { message: 'Joining source and continuation' });
            const outputs = adapter.finalize
              ? await adapter.finalize(job, rawAssets, this.store)
              : rawAssets;
            if (cancelled(job) || this.closed) continue;
            if (adapter.context && job.snapshot.contextSaved) {
              const file = adapter.context.output(job);
              const response = await this.request(
                job.endpoint,
                `/view?${new URLSearchParams(file)}`,
                undefined,
                120000,
              );
              if (
                !response.body ||
                Number(response.headers.get('content-length')) > maxContextBytes
              )
                throw new Error('Saved H3 context exceeds the supported size.');
              const temporary = path.join(
                this.store.root,
                `${job.id}-context-download.safetensors`,
              );
              try {
                let bytes = 0;
                await pipeline(
                  Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
                  async function* (source) {
                    for await (const chunk of source) {
                      bytes += chunk.length;
                      if (bytes > maxContextBytes)
                        throw new Error('Saved H3 context exceeds the supported size.');
                      yield chunk;
                    }
                  },
                  fs.createWriteStream(temporary),
                );
                await validateGenerationContext(temporary);
                await this.store.saveGenerationContext(job, outputs, temporary);
              } finally {
                await fsp.rm(temporary, { force: true });
              }
            }
            if (cancelled(job) || this.closed) continue;
            this.update(job, {
              status: 'complete',
              message: `${adapter.outputLabel} ready`,
              progress: 1,
              assetIds: outputs.map((output) => output.id),
            });
            this.emit({ type: 'library' });
          } else {
            const queue = (await (await this.request(job.endpoint, '/queue')).json()) as Queue;
            if (cancelled(job) || this.closed) continue;
            if (queue.queue_running.some((row) => row[1] === job.promptId)) {
              this.missingSince.delete(job.id);
              this.nextUnknownCheck.delete(job.id);
              this.update(job, {
                status: 'running',
                message: job.status === 'running' ? job.message : 'ComfyUI is rendering',
              });
            } else if (queue.queue_pending.some((row) => row[1] === job.promptId)) {
              this.missingSince.delete(job.id);
              this.nextUnknownCheck.delete(job.id);
              this.update(job, { status: 'queued', message: 'Waiting in ComfyUI queue' });
            } else {
              const since = this.missingSince.get(job.id) ?? Date.now();
              this.missingSince.set(job.id, since);
              const expired = Date.now() - since >= 30000;
              if (expired) this.nextUnknownCheck.set(job.id, Date.now() + 30000);
              this.update(job, {
                status: expired ? 'unknown' : 'recovering',
                message: expired
                  ? 'Job is absent from queue and history. Its saved prompt is checked without resubmission; inspect ComfyUI before retrying.'
                  : 'Waiting for completed ComfyUI history. Keeping the existing prompt; no resubmission.',
              });
            }
          }
        } catch (error) {
          if (cancelled(job) || this.closed) continue;
          this.update(job, {
            status: 'recovering',
            message: `Reconnecting / recovering output: ${(error as Error).message}`,
          });
        }
      }
    } finally {
      this.polling = false;
    }
  }
  async cancel(id: string) {
    const job = this.jobs.get(id) || this.store.jobs().find((job) => job.id === id);
    if (job?.status === 'unknown') {
      this.update(job, {
        status: 'cancelled',
        message: 'Unresolved job dismissed locally. No server job was stopped or resubmitted.',
      });
      return;
    }
    if (!job || !active(job)) return;
    if (job.status === 'submitting')
      throw new Error('Wait for submission to resolve before cancelling.');
    if (!this.mock && job.promptId) {
      const queue = (await (await this.request(job.endpoint, '/queue')).json()) as Queue;
      if (queue.queue_pending.some((row) => row[1] === job.promptId))
        await this.request(job.endpoint, '/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ delete: [job.promptId] }),
        });
      else if (queue.queue_running.some((row) => row[1] === job.promptId))
        await this.request(job.endpoint, '/interrupt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt_id: job.promptId }),
        });
      else throw new Error('The job has already left the queue. Refresh its result.');
    }
    this.update(job, { status: 'cancelled', message: 'Cancellation requested' });
  }
  async assertStoppedForRetry(job: Job) {
    if (this.mock || !job.promptId) return;
    const queue = (await (await this.request(job.endpoint, '/queue')).json()) as Queue;
    if ([...queue.queue_running, ...queue.queue_pending].some((row) => row[1] === job.promptId))
      throw new Error('The cancelled beat is still in ComfyUI queue; wait before resuming.');
    const history = (await (
      await this.request(job.endpoint, `/history/${encodeURIComponent(job.promptId)}`)
    ).json()) as Record<string, HistoryEntry>;
    const status = history[job.promptId]?.status;
    if (status?.completed || status?.status_str !== 'error')
      throw new Error(
        'The cancelled beat outcome is uncertain or completed. Inspect its ComfyUI history before retrying.',
      );
  }
  close() {
    this.closed = true;
    clearInterval(this.timer);
    for (const ws of this.sockets.values()) ws.close();
  }
}
