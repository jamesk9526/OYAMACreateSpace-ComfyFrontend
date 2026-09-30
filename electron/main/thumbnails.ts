import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { nativeImage } from 'electron';
import type { Asset } from '../../shared/domain';
import { MediaService } from './media';

const runFile = promisify(execFile);
const pending = new Map<string, Promise<string>>();

/** Bounded, disposable preview. The original managed media remains unchanged. */
export function thumbnailPath(
  asset: Asset,
  source: string,
  cacheRoot: string,
  resourcesPath: string,
): Promise<string> {
  const target = path.join(cacheRoot, `${asset.id}.png`);
  const current = pending.get(asset.id);
  if (current) return current;
  const task = (async () => {
    await fs.access(source);
    if (asset.kind === 'audio' || asset.kind === 'model') throw new Error('This asset has no image thumbnail.');
    try {
      if ((await fs.stat(target)).size > 0) return target;
    } catch {
      /* cache miss */
    }
    await fs.mkdir(cacheRoot, { recursive: true });
    const temp = path.join(cacheRoot, `${asset.id}-${randomUUID()}.png`);
    try {
      if (asset.kind === 'image') {
        const thumbnail = await nativeImage.createThumbnailFromPath(source, {
          width: 320,
          height: 240,
        });
        if (thumbnail.isEmpty()) throw new Error('Image thumbnail unavailable.');
        await fs.writeFile(temp, thumbnail.toPNG());
      } else {
        const media = new MediaService({ resourcesPath });
        const probe = await media.probe(source);
        const seconds = Math.max(0, Math.min(probe.duration * 0.1, probe.duration - 0.04));
        await runFile(
          media.ffmpeg,
          [
            '-nostdin',
            '-hide_banner',
            '-loglevel',
            'error',
            '-ss',
            seconds.toFixed(3),
            '-i',
            source,
            '-frames:v',
            '1',
            '-vf',
            'scale=320:240:force_original_aspect_ratio=decrease',
            '-y',
            temp,
          ],
          { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 },
        );
      }
      if ((await fs.stat(temp)).size === 0) throw new Error('Empty thumbnail.');
      await fs.rename(temp, target);
      return target;
    } finally {
      await fs.rm(temp, { force: true });
    }
  })();
  pending.set(asset.id, task);
  void task
    .finally(() => {
      pending.delete(asset.id);
    })
    .catch(() => {});
  return task;
}
