import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MediaService } from '../electron/main/media';
import { planRippleChunks } from '../shared/ripple-batch';
const run = promisify(execFile);
async function main() {
  const root = path.resolve('artifacts/ripple-media');
  await fs.mkdir(root, { recursive: true });
  const media = new MediaService({
    explicitDirectory: path.resolve('.generated/media-tools/win-x64'),
    pathEnv: '',
  });
  const source = path.join(root, 'source.mp4');
  await run(
    media.ffmpeg,
    [
      '-nostdin',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=320x256:rate=25:duration=4',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000:duration=3.7',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-y',
      source,
    ],
    { windowsHide: true },
  );
  const plan = planRippleChunks(4, 2, 0.5),
    clips = [];
  for (const chunk of plan) {
    const file = path.join(root, `chunk-${chunk.index}.mp4`);
    await media.prepareRippleVideo(
      source,
      file,
      48,
      320,
      256,
      chunk.startFrame,
      chunk.sourceFrames,
    );
    if ((await media.probe(file)).video?.frames !== chunk.sourceFrames)
      throw new Error('Chunk normalization/padding failed.');
    clips.push({ file, sourceFrames: chunk.sourceFrames, overlapFrames: chunk.overlapFrames });
  }
  const results = [];
  for (const blend of [false, true]) {
    const file = path.join(root, `joined-${blend ? 'blend' : 'cut'}.mp4`);
    const probe = await media.assembleRipple(source, clips, file, 96, 320, 256, blend);
    if (Math.abs((probe.audio?.duration ?? 0) - 4) > 0.06)
      throw new Error('Original short audio was not padded to the output duration.');
    results.push({ blend, probe });
  }
  const silent = path.join(root, 'silent.mp4');
  await run(
    media.ffmpeg,
    ['-nostdin', '-v', 'error', '-i', source, '-an', '-c:v', 'copy', '-y', silent],
    { windowsHide: true },
  );
  const silentOutput = await media.assembleRipple(
    silent,
    clips,
    path.join(root, 'joined-silent.mp4'),
    96,
    320,
    256,
    true,
  );
  if (!silentOutput.audio || Math.abs((silentOutput.audio.duration ?? 0) - 4) > 0.06)
    throw new Error('Silent-source assembly failed.');
  let aborted = false;
  try {
    await media.assembleRipple(
      source,
      clips,
      path.join(root, 'cancelled.mp4'),
      96,
      320,
      256,
      true,
      AbortSignal.abort(),
    );
  } catch (error) {
    aborted = (error as Error).name === 'AbortError';
  }
  if (!aborted) throw new Error('Assembly did not respect cancellation.');
  await fs.writeFile(
    path.join(root, 'evidence.json'),
    JSON.stringify(
      {
        tools: { ffmpeg: media.ffmpeg, ffprobe: media.ffprobe },
        plan,
        results,
        silentOutput,
        aborted,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ chunks: clips.length, frames: 96, results, silentOutput, aborted }));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
