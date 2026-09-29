const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { spawnSync } = require('node:child_process');
const manifest = require('../build/media-tools.json');
const root = path.resolve(__dirname, '..', '.generated', 'media-tools');
async function checksum(file) {
  const hash = createHash('sha256');
  for await (const bytes of fs.createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}
async function prepareMediaTools() {
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('The pinned media tools bundle supports Windows x64.');
  await fsp.mkdir(root, { recursive: true });
  const archive = path.join(root, `${manifest.sha256}.zip`);
  if (!fs.existsSync(archive) || (await checksum(archive)) !== manifest.sha256) {
    const response = await fetch(manifest.url, { signal: AbortSignal.timeout(300000) });
    if (!response.ok || !response.body)
      throw new Error(`Media tools download failed: ${response.status}`);
    const temporary = `${archive}.partial`;
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary));
    if ((await checksum(temporary)) !== manifest.sha256)
      throw new Error('Media tools checksum mismatch; packaging stopped.');
    await fsp.rename(temporary, archive);
  }
  const extracted = path.join(root, `distribution-${manifest.sha256}`);
  const extractedMarker = path.join(extracted, '.extraction-complete');
  if (!fs.existsSync(extractedMarker)) {
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Expand-Archive -LiteralPath $env:OYAMA_MEDIA_ARCHIVE -DestinationPath $env:OYAMA_MEDIA_EXTRACT -Force',
      ],
      {
        env: { ...process.env, OYAMA_MEDIA_ARCHIVE: archive, OYAMA_MEDIA_EXTRACT: extracted },
        windowsHide: true,
        stdio: 'inherit',
      },
    );
    if (result.status !== 0) throw new Error('Media tools archive extraction failed.');
    // Windows scanners can hold newly extracted DLLs and block directory renames.
    // Only a successful extraction gets a marker; interrupted copies are re-extracted.
    await fsp.writeFile(extractedMarker, manifest.sha256);
  }
  const folders = await fsp.readdir(extracted);
  const source = path.join(
    extracted,
    folders.find((name) => name.startsWith('ffmpeg-')) ?? 'missing',
  );
  const destination = path.join(root, 'win-x64');
  await fsp.mkdir(destination, { recursive: true });
  await fsp.cp(path.join(source, 'bin'), destination, { recursive: true });
  await fsp.copyFile(path.join(source, 'LICENSE.txt'), path.join(destination, 'LICENSE.txt'));
  await fsp.copyFile(
    path.resolve(__dirname, '..', 'build', 'THIRD-PARTY-NOTICES.md'),
    path.join(destination, 'THIRD-PARTY-NOTICES.md'),
  );
  for (const filename of ['ffmpeg.exe', 'ffprobe.exe']) {
    const result = spawnSync(path.join(destination, filename), ['-version'], {
      windowsHide: true,
      encoding: 'utf8',
    });
    const actualVersion = result.stdout?.split(/\s+/)[2]?.replace(/^n/, '').split('-')[0];
    if (
      result.status !== 0 ||
      !result.stdout.startsWith(`${filename.slice(0, -4)} version `) ||
      actualVersion !== manifest.version
    )
      throw new Error(`${filename} failed its packaged self-check.`);
  }
  await fsp.writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const buildInfo = spawnSync(path.join(destination, 'ffmpeg.exe'), ['-version'], {
    windowsHide: true,
    encoding: 'utf8',
  });
  await fsp.writeFile(path.join(destination, 'BUILD-CONFIGURATION.txt'), buildInfo.stdout);
  return { source, destination };
}
module.exports = { prepareMediaTools };
if (require.main === module)
  prepareMediaTools()
    .then((value) => console.log(JSON.stringify(value)))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
