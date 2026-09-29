const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const env = {
    ...process.env,
    OYAMA_MOCK: '0',
    OYAMA_TEST: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/live-zimage-app'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.argv.includes('--packaged')
    ? path.resolve('release/win-unpacked/OYAMA CreateSpace.exe')
    : undefined;
  const app = await electron.launch({
    ...(executablePath ? { executablePath, args: [] } : { args: ['.'] }),
    env,
  });
  try {
    const page = await app.firstWindow();
    await page.getByText('ComfyUI Connected', { exact: true }).waitFor({ timeout: 30000 });
    const result = await page.evaluate(async () => {
      const before = await window.oyama.load();
      const job = before.jobs.find(
        (item) =>
          item.moduleId === 'ltx' &&
          item.status === 'complete' &&
          item.snapshot.msr &&
          item.snapshot.msr.enabled,
      );
      if (!job) throw new Error('No completed LTX MSR result to inspect.');
      const sourceId = job.assetIds[0];
      const metadata = await window.oyama.probeAsset(sourceId);
      const frame = await window.oyama.extractFrame({ assetId: sourceId, seconds: 0.5 });
      const clip = await window.oyama.clipVideo({ assetId: sourceId, start: 0.2, end: 0.8 });
      return { sourceId, metadata, frame, clip };
    });
    if (result.metadata.video?.frames !== 25 || result.metadata.audio?.codec !== 'aac')
      throw new Error('Live LTX source streams do not match the completed render.');
    if (
      result.frame.parentAssetId !== result.sourceId ||
      result.clip.parentAssetId !== result.sourceId
    )
      throw new Error('Derived media lost its source ID.');
    if (!result.clip.media?.video || !result.clip.media.audio)
      throw new Error('Clipped video lost a stream.');
    await fs.writeFile('artifacts/live-media-app-result.json', JSON.stringify(result, null, 2));
    console.log(
      JSON.stringify({
        source: result.sourceId,
        frame: result.frame.id,
        clip: result.clip.id,
        clipDuration: result.clip.media.duration,
      }),
    );
    await page.getByRole('button', { name: 'Close window' }).click();
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
