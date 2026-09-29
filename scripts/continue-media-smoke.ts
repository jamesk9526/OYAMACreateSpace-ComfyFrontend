import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MediaService } from '../electron/main/media';
const run = promisify(execFile);

async function main() {
  const root = path.resolve('artifacts/continue-media');
  await fs.mkdir(root, { recursive: true });
  const media = new MediaService();
  const source = path.join(root, 'variable-fps-silent.mp4');
  const beat = path.join(root, 'different-fps-short-audio.mp4');
  await run(
    'ffmpeg',
    [
      '-nostdin',
      '-v',
      'error',
      '-i',
      path.resolve('public/mock/sample.mp4'),
      '-vf',
      'select=not(mod(n\\,2))+eq(mod(n\\,5)\\,1)',
      '-fps_mode',
      'vfr',
      '-an',
      '-c:v',
      'libx264',
      '-y',
      source,
    ],
    { windowsHide: true },
  );
  await run(
    'ffmpeg',
    [
      '-nostdin',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=384x256:r=25:d=1',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000:duration=0.4',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-y',
      beat,
    ],
    { windowsHide: true },
  );
  const [sourceProbe, beatProbe] = await Promise.all([media.probe(source), media.probe(beat)]);
  if (!sourceProbe.video || sourceProbe.audio || sourceProbe.video.fps === 24 || !beatProbe.audio)
    throw new Error('Media fixtures lack required timing/audio differences.');
  const joined = await media.joinVideos(source, beat, path.join(root, 'joined.mp4'), 512, 320);
  const audible = path.join(root, 'audible-source.mp4');
  await run(
    'ffmpeg',
    [
      '-nostdin',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=green:s=512x320:r=24:d=1',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=660:sample_rate=48000:duration=1',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-shortest',
      '-y',
      audible,
    ],
    { windowsHide: true },
  );
  const carry = path.join(root, 'carry-audio.mp4');
  const muted = path.join(root, 'mute-audio.mp4');
  await media.joinVideos(audible, beat, carry, 512, 320, undefined, true);
  await media.joinVideos(audible, beat, muted, 512, 320, undefined, false);
  const meanVolume = async (file: string) => {
    const { stderr } = await run(
      'ffmpeg',
      [
        '-nostdin',
        '-hide_banner',
        '-ss',
        '0.1',
        '-t',
        '0.5',
        '-i',
        file,
        '-vn',
        '-af',
        'volumedetect',
        '-f',
        'null',
        '-',
      ],
      { windowsHide: true },
    );
    const value = /mean_volume: (-?\d+(?:\.\d+)?|-inf) dB/.exec(stderr)?.[1];
    if (!value) throw new Error(`No measured audio volume for ${file}`);
    return value === '-inf' ? -Infinity : Number(value);
  };
  const [carryVolume, mutedVolume] = await Promise.all([meanVolume(carry), meanVolume(muted)]);
  if (carryVolume > -10 || carryVolume < -45 || mutedVolume > -65)
    throw new Error(`Audio carry policy failed: ${JSON.stringify({ carryVolume, mutedVolume })}`);
  for (const input of [source, beat]) {
    const context = path.join(
      root,
      input === source ? 'silent-context.mp4' : 'short-audio-context.mp4',
    );
    await media.prepareMotionContext(input, context, 22, 512, 288);
    const probe = await media.probe(context);
    if (
      probe.video?.frames !== 22 ||
      probe.video?.fps !== 24 ||
      !probe.audio ||
      Math.abs((probe.audio.duration || 0) - 22 / 24) > 0.05
    )
      throw new Error(`Motion tail did not normalize frames/audio: ${JSON.stringify(probe)}`);
  }
  const expectedFrames = Math.round(sourceProbe.video.duration! * 24) + 24;
  if (
    joined.video?.frames !== expectedFrames ||
    joined.video.fps !== 24 ||
    Math.abs(joined.audio!.duration! - expectedFrames / 24) > 0.05
  )
    throw new Error(`Unexpected assembled streams: ${JSON.stringify(joined)}`);
  await fs.writeFile(
    path.join(root, 'evidence.json'),
    JSON.stringify({ sourceProbe, beatProbe, joined, carryVolume, mutedVolume }, null, 2),
  );
  console.log(
    JSON.stringify({
      sourceFps: sourceProbe.video.fps,
      sourceDuration: sourceProbe.video.duration,
      beatAudioDuration: beatProbe.audio.duration,
      joinedFrames: joined.video.frames,
      joinedDuration: joined.duration,
      carryVolume,
      mutedVolume,
    }),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
