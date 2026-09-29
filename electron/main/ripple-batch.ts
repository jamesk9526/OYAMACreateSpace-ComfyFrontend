import { randomInt, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AppEvent, Draft, Job } from '../../shared/domain';
import { planRippleChunks } from '../../shared/ripple-batch';
import { gpuRoutingDefaults, gpuRoutingSchema } from '../../shared/gpu-routing';
import { rippleSchema, rippleSourceDuration } from '../../src/modules/ripple/definition';
import { Store } from './database';
import { ComfyBridge } from './comfy';
import { MediaService } from './media';

const active = (job: Job) =>
  ['preparing', 'submitting', 'queued', 'running', 'recovering'].includes(job.status);
export class RippleBatchRunner {
  private closed = false;
  private working = new Map<string, Promise<void>>();
  private controllers = new Map<string, AbortController>();
  private timer: ReturnType<typeof setInterval>;
  constructor(
    private store: Store,
    private bridge: ComfyBridge,
    private emit: (event: AppEvent) => void,
  ) {
    this.timer = setInterval(() => void this.tick(), 1800);
  }
  private update(job: Job, patch: Partial<Job>) {
    if (this.closed) return;
    Object.assign(job, patch);
    this.store.saveJob(job);
    this.emit({ type: 'job', job: { ...job } });
  }
  private current(id: string) {
    return this.store.jobs().find((job) => job.id === id);
  }
  private stopped(id: string) {
    return this.closed || this.current(id)?.status === 'cancelled';
  }
  private children(job: Job) {
    return this.store
      .jobs()
      .filter(
        (child) =>
          child.snapshot.batchParentId === job.id && child.snapshot.batchSuperseded !== true,
      );
  }
  async start(draft: Draft): Promise<Job> {
    this.store.project(draft.projectId);
    const settings = rippleSchema.parse(draft.values);
    if (settings.mode !== 'long' || !settings.sourceVideo || !settings.replacementFrame)
      throw new Error('Choose a source video, replacement frame and Long mode.');
    if (
      this.store.jobs().some((job) => job.batch && job.projectId === draft.projectId && active(job))
    )
      throw new Error(
        'This project already has an active Ripple batch. Finish or cancel it first.',
      );
    const source = this.store.asset(settings.sourceVideo),
      replacement = this.store.asset(settings.replacementFrame);
    if (
      source.kind !== 'video' ||
      replacement.kind !== 'image' ||
      [source, replacement].some((asset) => asset.projectId && asset.projectId !== draft.projectId)
    )
      throw new Error('Ripple batch inputs must belong to this project or the global library.');
    const media = new MediaService({ resourcesPath: process.resourcesPath });
    const probe = await media.probe(this.store.assetPath(source.id));
    if (this.closed) throw new Error('The application is closing; no batch was submitted.');
    this.store.saveMediaProbe(source.id, probe);
    const duration = rippleSourceDuration({ ...source, media: probe });
    if (duration + 0.001 < settings.longDuration)
      throw new Error('The source is shorter than the requested long edit.');
    const chunks = planRippleChunks(
      settings.longDuration,
      settings.chunkSeconds,
      settings.overlapSeconds,
    );
    const seed = settings.seed === 'Random' ? randomInt(2147483647) : Number(settings.seed);
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295)
      throw new Error('Seed must be Random or an integer from 0 to 4294967295.');
    if (this.closed) throw new Error('The application is closing; no batch was submitted.');
    const job: Job = {
      id: randomUUID(),
      projectId: draft.projectId,
      moduleId: 'ripple',
      status: 'preparing',
      message: `Preparing ${chunks.length} Ripple chunks`,
      progress: 0,
      createdAt: new Date().toISOString(),
      endpoint: this.store.settings().comfyUrl,
      snapshot: {
        ...settings,
        chunkStartFrame: undefined,
        chunkSourceFrames: undefined,
        seed: String(seed),
        engineRouting: this.store.settings().gpuRouting ?? gpuRoutingDefaults,
      },
      templateVersion: 'ltx-ripple-batch/1',
      assetIds: [],
      batch: {
        schemaVersion: 1,
        sourceAssetId: source.id,
        targetFrames: Math.round(settings.longDuration * 24),
        blend: settings.blendOverlap,
        chunks,
      },
    };
    this.store.saveDraft({ ...draft, values: settings });
    this.update(job, {});
    void this.tick();
    return job;
  }
  async tick() {
    if (this.closed) return;
    const tasks: Promise<void>[] = [];
    for (const parent of this.store
      .jobs()
      .filter((job) => job.batch && (active(job) || job.status === 'cancelled'))) {
      const existing = this.working.get(parent.id);
      if (existing) {
        tasks.push(existing);
        continue;
      }
      const task = this.advance(parent)
        .catch((error) => {
          if (!this.stopped(parent.id))
            this.update(parent, {
              status: 'error',
              message: `Ripple batch stopped: ${(error as Error).message}. Completed chunks are retained.`,
              assetIds: this.children(parent).flatMap((child) => child.assetIds),
            });
        })
        .finally(() => {
          this.working.delete(parent.id);
          this.controllers.delete(parent.id);
        });
      this.working.set(parent.id, task);
      tasks.push(task);
    }
    await Promise.all(tasks);
  }
  private async advance(parent: Job) {
    const children = this.children(parent);
    if (parent.status === 'cancelled') {
      const child = children.find((child) => active(child) && child.status !== 'submitting');
      if (child) await this.bridge.cancel(child.id).catch(() => {});
      return;
    }
    const plan = parent.batch!;
    for (const chunk of plan.chunks) {
      const matches = children.filter((child) => child.snapshot.batchChunkIndex === chunk.index);
      if (matches.length > 1)
        throw new Error('Duplicate chunk records need inspection; no new render was submitted.');
      const child = matches[0];
      if (child?.status === 'complete') continue;
      if (child) {
        if (['error', 'cancelled'].includes(child.status))
          throw new Error(`Chunk ${chunk.index + 1}: ${child.message}`);
        this.update(parent, {
          status: 'recovering',
          progress: (chunk.index + (child.progress ?? 0)) / plan.chunks.length,
          message: `Chunk ${chunk.index + 1}/${plan.chunks.length}: ${child.message}`,
          assetIds: children
            .filter((child) => child.status === 'complete')
            .flatMap((child) => child.assetIds),
        });
        return;
      }
      if (this.stopped(parent.id)) return;
      // Parent snapshot fixes endpoint, routing and seed. A saved child is discovered by parent/index after any crash between start and returning its ID.
      const next = await this.bridge.start(
        {
          projectId: parent.projectId,
          moduleId: 'ripple',
          values: {
            ...parent.snapshot,
            mode: 'single',
            duration: parent.snapshot.chunkSeconds,
            chunkStartFrame: chunk.startFrame,
            chunkSourceFrames: chunk.sourceFrames,
            seed: String((Number(parent.snapshot.seed) + chunk.index) % 4294967296),
          },
        },
        {
          parentId: parent.id,
          chunkIndex: chunk.index,
          endpoint: parent.endpoint,
          routing: gpuRoutingSchema.parse(parent.snapshot.engineRouting),
        },
      );
      if (this.stopped(parent.id)) {
        if (!this.closed) await this.bridge.cancel(next.id).catch(() => {});
        return;
      }
      this.update(parent, {
        status: 'running',
        progress: chunk.index / plan.chunks.length,
        message: `Chunk ${chunk.index + 1}/${plan.chunks.length}: ${next.message}`,
      });
      return;
    }
    if (this.stopped(parent.id)) return;
    const existing = this.store
      .snapshot('', this.bridge.mock)
      .assets.find(
        (asset) =>
          !asset.missing &&
          asset.derivation?.operation === 'ripple' &&
          asset.derivation.jobId === parent.id,
      );
    if (existing) {
      this.update(parent, {
        status: 'complete',
        progress: 1,
        message: 'Long Ripple edit ready',
        assetIds: [existing.id, ...children.flatMap((child) => child.assetIds)],
      });
      return;
    }
    this.update(parent, {
      status: 'recovering',
      progress: 0.95,
      message: 'Assembling edited chunks with original source audio',
    });
    const media = new MediaService({ resourcesPath: process.resourcesPath });
    const clips = [];
    for (const chunk of plan.chunks) {
      const child = children.find((child) => child.snapshot.batchChunkIndex === chunk.index)!;
      const asset = this.store.asset(child.assetIds[0]);
      const probe = await media.probe(this.store.assetPath(asset.id));
      if (this.stopped(parent.id)) return;
      if (!this.bridge.mock && probe.video?.frames !== chunk.outputFrames)
        throw new Error(`Chunk ${chunk.index + 1} has an unexpected frame count.`);
      this.store.saveMediaProbe(asset.id, probe);
      clips.push({
        file: this.store.assetPath(asset.id),
        sourceFrames: chunk.sourceFrames,
        overlapFrames: chunk.overlapFrames,
      });
    }
    const target = path.join(this.store.root, 'temporary', `${parent.id}-ripple.mp4`);
    const controller = new AbortController();
    this.controllers.set(parent.id, controller);
    try {
      const probe = await media.assembleRipple(
        this.store.assetPath(plan.sourceAssetId),
        clips,
        target,
        plan.targetFrames,
        Number(parent.snapshot.width),
        Number(parent.snapshot.height),
        plan.blend,
        controller.signal,
      );
      if (this.stopped(parent.id)) return;
      const asset = await this.store.importFile(target, parent.projectId, 'Ripple-Long.mp4');
      if (this.stopped(parent.id)) return;
      this.store.saveMediaProbe(asset.id, probe);
      const result = this.store.registerDerivation(asset.id, plan.sourceAssetId, {
        operation: 'ripple',
        start: 0,
        end: plan.targetFrames / 24,
        jobId: parent.id,
      });
      this.update(parent, {
        status: 'complete',
        progress: 1,
        message: 'Long Ripple edit ready',
        assetIds: [result.id, ...children.flatMap((child) => child.assetIds)],
      });
      this.emit({ type: 'library' });
    } finally {
      await fs.rm(target, { force: true });
    }
  }
  async cancel(id: string): Promise<boolean> {
    const parent = this.current(id);
    if (!parent?.batch) return false;
    if (!active(parent)) return true;
    this.update(parent, {
      status: 'cancelled',
      message: 'Batch cancelled. Completed chunks remain available; no further chunks will submit.',
    });
    this.controllers.get(id)?.abort();
    await this.tick();
    return true;
  }
  resume(id: string) {
    const parent = this.current(id);
    if (!parent?.batch || !['error', 'cancelled'].includes(parent.status))
      throw new Error('Only stopped Ripple batches can resume.');
    const children = this.children(parent);
    if (
      children.some(
        (child) =>
          active(child) ||
          child.status === 'unknown' ||
          /Unresolved job dismissed/i.test(child.message),
      )
    )
      throw new Error(
        'A chunk is still active or uncertain. Inspect its original prompt before resuming; it will not be resubmitted.',
      );
    for (const child of children.filter((child) => child.status !== 'complete')) {
      child.snapshot.batchSuperseded = true;
      this.store.saveJob(child);
    }
    this.update(parent, {
      status: 'recovering',
      message: 'Resuming batch; completed chunks are retained',
    });
    void this.tick();
    return parent;
  }
  close() {
    this.closed = true;
    clearInterval(this.timer);
    for (const controller of this.controllers.values()) controller.abort();
  }
}
