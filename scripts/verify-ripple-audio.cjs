const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const long = process.argv.includes('--long');
const result = JSON.parse(
  fs.readFileSync(
    long ? 'artifacts/ripple-long-evidence.json' : 'artifacts/live-ripple-result.json',
    'utf8',
  ),
);
if (long) result.job = result.parent;
const mediaRoot = path.resolve('artifacts/live-zimage-app/media', result.job.projectId);
const decode = (id) => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid fixture asset ID.');
  const buffer = execFileSync(
    path.resolve('.generated/media-tools/win-x64/ffmpeg.exe'),
    [
      '-nostdin',
      '-v',
      'error',
      '-i',
      path.join(mediaRoot, `${id}.mp4`),
      '-t',
      long ? '2.4' : '1.8',
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
};
const source = decode(result.job.snapshot.sourceVideo);
const output = decode(result.job.assetIds[0]);
const count = Math.min(source.length, output.length);
let dot = 0,
  sourcePower = 0,
  outputPower = 0;
for (let index = 0; index < count; index++) {
  dot += source[index] * output[index];
  sourcePower += source[index] ** 2;
  outputPower += output[index] ** 2;
}
const correlation = dot / Math.sqrt(sourcePower * outputPower);
const evidence = {
  samples: count,
  correlation,
  sourceRms: Math.sqrt(sourcePower / count),
  outputRms: Math.sqrt(outputPower / count),
};
if (count < 14000 || !Number.isFinite(correlation) || correlation < 0.98)
  throw new Error(`Source audio differs from Ripple output: ${JSON.stringify(evidence)}`);
fs.writeFileSync(
  long ? 'artifacts/ripple-long-audio-comparison.json' : 'artifacts/ripple-audio-comparison.json',
  JSON.stringify(evidence, null, 2),
);
console.log(JSON.stringify(evidence));
