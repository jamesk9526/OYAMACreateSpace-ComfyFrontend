const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const quality = process.argv.includes('--native') ? 'native' : 'turbo8';
const selected = process.argv.includes('--selected');
const motion = process.argv.includes('--motion');
const latent = process.argv.includes('--latent-context');
const chain = process.argv.includes('--chain');
const fixture = JSON.parse(
  fs.readFileSync(
    selected || motion
      ? `artifacts/continue-${motion ? 'motion' : 'selected'}${quality === 'native' ? '-native' : ''}${latent ? '-latent' : ''}${chain ? '-chain' : ''}-evidence.json`
      : `artifacts/live-continue-${quality}-result.json`,
    'utf8',
  ),
);
const result =
  selected || motion
    ? {
        job: fixture.job,
        asset: { id: fixture.job.assetIds[0] },
        beat: { id: fixture.job.rawAssetIds[0] },
      }
    : fixture;
const mediaRoot = path.resolve('artifacts/live-zimage-app/media', result.job.projectId);
function decode(id, start, seconds) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid fixture asset ID.');
  const buffer = execFileSync(
    'ffmpeg',
    [
      '-nostdin',
      '-v',
      'error',
      '-i',
      path.join(mediaRoot, `${id}.mp4`),
      '-ss',
      String(start),
      '-t',
      String(seconds),
      '-vn',
      '-ac',
      '1',
      '-ar',
      '8000',
      '-f',
      'f32le',
      'pipe:1',
    ],
    { windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
  );
  return Array.from({ length: buffer.length / 4 }, (_, index) => buffer.readFloatLE(index * 4));
}
function compare(originalId, offset, seconds) {
  const original = decode(originalId, 0, seconds);
  const joined = decode(result.asset.id, offset, seconds);
  const count = Math.min(original.length, joined.length);
  let dot = 0,
    a = 0,
    b = 0;
  for (let index = 0; index < count; index++) {
    dot += original[index] * joined[index];
    a += original[index] ** 2;
    b += joined[index] ** 2;
  }
  const correlation = dot / Math.sqrt(a * b);
  if (count < seconds * 7900 || !Number.isFinite(correlation) || correlation < 0.95)
    throw new Error(`Joined audio differs: ${JSON.stringify({ correlation, count })}`);
  return { correlation, samples: count };
}
const evidence = {
  source: compare(result.job.snapshot.sourceVideo, 0, selected ? 0.4 : latent ? 1.4 : 1.8),
  beat: compare(
    result.beat.id,
    selected || motion ? result.job.snapshot.retainedSourceFrames / 24 : 49 / 24,
    motion ? 0.6 : 0.8,
  ),
};
fs.writeFileSync(
  `artifacts/continue-${motion ? 'motion-' : selected ? 'selected-' : ''}${quality}${latent ? '-latent' : ''}${chain ? '-chain' : ''}-audio-comparison.json`,
  JSON.stringify(evidence, null, 2),
);
console.log(JSON.stringify(evidence));
