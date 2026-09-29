import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { AppEvent, Job } from '../../shared/domain';
import { lineageBeatIds, scriptContinuitySchema } from '../../shared/continuation';
import { gpuRoutingDefaults, gpuRoutingSchema } from '../../shared/gpu-routing';
import { continueSchema } from '../../src/modules/continue/definition';
import { Store } from './database';
import { ComfyBridge } from './comfy';

const active = (job: Job) =>
  ['preparing', 'submitting', 'queued', 'running', 'recovering'].includes(job.status);

/** A parent job fixes the authored script and tracks one selected ancestry. Children are normal Continue jobs. */
export class ContinuationSequenceRunner {
  private closed = false;
  private working = new Map<string, Promise<void>>();
  private timer: ReturnType<typeof setInterval>;
  constructor(
    private store: Store,
    private bridge: ComfyBridge,
    private emit: (event: AppEvent) => void,
  ) {
    this.timer = setInterval(() => void this.tick(), 1800);
  }
  private current(id: string) {
    return this.store.jobs().find((job) => job.id === id);
  }
  private update(job: Job, patch: Partial<Job>) {
    if (this.closed) return;
    Object.assign(job, patch);
    this.store.saveJob(job);
    this.emit({ type: 'job', job: { ...job } });
  }
  private children(parent: Job) {
    return this.store
      .jobs()
      .filter(
        (job) =>
          job.snapshot.sequenceParentId === parent.id && job.snapshot.sequenceSuperseded !== true,
      );
  }
  start(scriptId: string, targetBeatId: string): Job {
    const script = this.store.continuationScript(scriptId);
    this.store.project(script.projectId);
    const source = this.store.asset(script.sourceVideo);
    if (
      source.kind !== 'video' ||
      !existsSync(this.store.assetPath(source.id)) ||
      (source.projectId && source.projectId !== script.projectId)
    )
      throw new Error('The script source video is unavailable.');
    const beatIds = lineageBeatIds(script.beats, targetBeatId);
    if (beatIds.some((id) => !script.beats.find((beat) => beat.id === id)?.prompt.trim()))
      throw new Error('Every beat in the selected lineage needs an action prompt.');
    const settings = continueSchema.parse(script.settings);
    if (this.store.jobs().some((job) => job.sequence?.script.id === scriptId && active(job)))
      throw new Error('This script already has an active sequence.');
    const job: Job = {
      id: randomUUID(),
      projectId: script.projectId,
      moduleId: 'continue',
      status: 'preparing',
      message: `Preparing ${beatIds.length} Continue beats`,
      progress: 0,
      createdAt: new Date().toISOString(),
      endpoint: this.store.settings().comfyUrl,
      snapshot: {
        ...settings,
        scriptId,
        scriptRevision: script.revision,
        engineRouting: this.store.settings().gpuRouting ?? gpuRoutingDefaults,
      },
      templateVersion: 'continue-script/1',
      assetIds: [],
      sequence: { schemaVersion: 1, script, targetBeatId, beatIds },
    };
    this.update(job, {});
    void this.tick();
    return job;
  }
  async tick() {
    if (this.closed) return;
    const tasks: Promise<void>[] = [];
    for (const parent of this.store
      .jobs()
      .filter((job) => job.sequence && (active(job) || job.status === 'cancelled'))) {
      const existing = this.working.get(parent.id);
      if (existing) {
        tasks.push(existing);
        continue;
      }
      const task = this.advance(parent)
        .catch((error) => {
          if (this.current(parent.id)?.status !== 'cancelled')
            this.update(parent, {
              status: 'error',
              message: `Sequence stopped: ${(error as Error).message}. Completed beats remain available.`,
            });
        })
        .finally(() => this.working.delete(parent.id));
      this.working.set(parent.id, task);
      tasks.push(task);
    }
    await Promise.all(tasks);
  }
  private async advance(parent: Job) {
    const sequence = parent.sequence!;
    const children = this.children(parent);
    if (parent.status === 'cancelled') {
      const child = children.find((item) => active(item) && item.status !== 'submitting');
      if (child) await this.bridge.cancel(child.id).catch(() => {});
      return;
    }
    let sourceId = sequence.script.sourceVideo;
    for (let index = 0; index < sequence.beatIds.length; index++) {
      const beatId = sequence.beatIds[index];
      const beat = sequence.script.beats.find((item) => item.id === beatId)!;
      const matches = children.filter((item) => item.snapshot.sequenceBeatId === beatId);
      if (matches.length > 1)
        throw new Error('Duplicate beat records need inspection; no render was submitted.');
      const child = matches[0];
      if (!child && beat.result && !beat.stale) {
        const saved = this.store
          .continuationScript(sequence.script.id)
          .beats.find((item) => item.id === beat.id);
        if (
          saved?.revision === beat.revision &&
          !saved.stale &&
          saved.result?.jobId === beat.result.jobId
        ) {
          const assetId = beat.result.assetIds[0];
          if (assetId) {
            try {
              const reused = this.store.asset(assetId);
              if (reused.kind === 'video' && existsSync(this.store.assetPath(reused.id))) {
                sourceId = reused.id;
                continue;
              }
            } catch (error) {
              if ((error as Error).message !== 'Asset not found') throw error;
            }
          }
        }
      }
      if (child?.status === 'complete') {
        if (!child.assetIds[0])
          throw new Error(`Beat ${beat.name} completed without a joined video.`);
        sourceId = child.assetIds[0];
        this.store.saveBeatResult(sequence.script.id, beat.id, beat.revision, {
          jobId: child.id,
          assetIds: child.assetIds,
          deliveredDuration: Number(child.snapshot.deliveredDuration || beat.duration),
        });
        continue;
      }
      if (child) {
        if (child.status === 'unknown' || /Unresolved job dismissed/i.test(child.message))
          throw new Error(
            `Beat ${beat.name} submission is uncertain. Inspect ComfyUI history before another run.`,
          );
        if (['error', 'cancelled'].includes(child.status))
          throw new Error(`Beat ${beat.name}: ${child.message}`);
        this.update(parent, {
          status: 'recovering',
          progress: (index + (child.progress ?? 0)) / sequence.beatIds.length,
          message: `Beat ${index + 1}/${sequence.beatIds.length}: ${child.message}`,
          assetIds: [sourceId],
        });
        return;
      }
      if (this.closed || this.current(parent.id)?.status === 'cancelled') return;
      const source = this.store.asset(sourceId);
      if (source.kind !== 'video' || !existsSync(this.store.assetPath(source.id)))
        throw new Error(`Source for beat ${beat.name} is unavailable.`);
      const continuity = scriptContinuitySchema.parse(sequence.script.continuity);
      const draft = {
        projectId: parent.projectId,
        moduleId: 'continue',
        values: {
          ...sequence.script.settings,
          ...continuity,
          sourceVideo: sourceId,
          firstFrame: null,
          prompt: [beat.prompt, beat.camera ? `Camera direction: ${beat.camera}` : '']
            .filter(Boolean)
            .join('\n\n'),
          duration: beat.duration,
          method: beat.method,
          selectedSeconds: beat.selectedSeconds,
        },
      };
      // A child is persisted before its network submission. On restart, the parent discovers it by beat ID.
      const next = await this.bridge.start(draft, {
        parentId: parent.id,
        chunkIndex: index,
        sequenceBeatId: beatId,
        endpoint: parent.endpoint,
        routing: gpuRoutingSchema.parse(parent.snapshot.engineRouting),
      });
      if (this.current(parent.id)?.status === 'cancelled') {
        if (!this.closed) await this.bridge.cancel(next.id).catch(() => {});
        return;
      }
      this.update(parent, {
        status: 'running',
        progress: index / sequence.beatIds.length,
        message: `Beat ${index + 1}/${sequence.beatIds.length}: ${next.message}`,
      });
      return;
    }
    this.update(parent, {
      status: 'complete',
      progress: 1,
      message: 'Selected Continue lineage ready',
      assetIds: [sourceId],
    });
    this.emit({ type: 'library' });
  }
  async cancel(id: string): Promise<boolean> {
    const parent = this.current(id);
    if (!parent?.sequence) return false;
    if (!active(parent)) return true;
    this.update(parent, {
      status: 'cancelled',
      message: 'Sequence cancelled. Completed beats remain available.',
    });
    await this.tick();
    return true;
  }
  async resume(id: string): Promise<Job> {
    const parent = this.current(id);
    if (!parent?.sequence || !['error', 'cancelled'].includes(parent.status))
      throw new Error('Only stopped Continue sequences can resume.');
    const children = this.children(parent);
    if (
      children.some(
        (child) =>
          active(child) ||
          child.status === 'unknown' ||
          /Unresolved job dismissed/i.test(child.message),
      )
    )
      throw new Error('A beat is active or uncertain. Inspect its ComfyUI prompt before resuming.');
    for (const child of children.filter((item) => item.status === 'cancelled'))
      await this.bridge.assertStoppedForRetry(child);
    for (const child of children.filter((item) => item.status !== 'complete')) {
      child.snapshot.sequenceSuperseded = true;
      this.store.saveJob(child);
    }
    this.update(parent, {
      status: 'recovering',
      message: 'Resuming sequence with completed beats retained',
    });
    void this.tick();
    return parent;
  }
  close() {
    this.closed = true;
    clearInterval(this.timer);
  }
}
