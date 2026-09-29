import fs from 'node:fs/promises';
import path from 'node:path';
import { MediaService } from '../electron/main/media';

async function main() {
  const media = new MediaService({ resourcesPath: process.resourcesPath });
  const source = path.resolve('public/mock/sample.mp4');
  const metadata = await media.probe(source);
  if (!metadata.video || !metadata.audio || metadata.video.fps !== 24)
    throw new Error('Bundled sample media probe failed.');
  const target = path.resolve('artifacts/live/extracted-frame.png');
  await media.extractFrame(source, target, 1);
  const image = await fs.stat(target);
  if (!image.size) throw new Error('Frame extraction failed.');
  const liveResult = JSON.parse(
    await fs.readFile('artifacts/live-ltx-msr-quality-result.json', 'utf8'),
  ) as { job: { projectId: string; assetIds: string[] } };
  const livePath = path.resolve(
    'artifacts/live-zimage-app/media',
    liveResult.job.projectId,
    `${liveResult.job.assetIds[0]}.mp4`,
  );
  const live = await media.probe(livePath);
  if (!live.video || !live.audio || live.duration < 1 || live.duration > 1.1)
    throw new Error('Live LTX output has incorrect video, audio or duration.');
  console.log(JSON.stringify({ sample: metadata, live, extractedFrameBytes: image.size }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
