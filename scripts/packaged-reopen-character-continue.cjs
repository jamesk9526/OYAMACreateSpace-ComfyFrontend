const { _electron: electron } = require('@playwright/test');
const path = require('node:path');

const executablePath = path.resolve('release/win-unpacked/OYAMA CreateSpace.exe');
async function inspect(dataDir, kind) {
  const env = { ...process.env, OYAMA_MOCK: '0', OYAMA_TEST: '1', OYAMA_DATA_DIR: path.resolve(dataDir), PATH: `${process.env.SystemRoot}\\System32` };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath, args: [], env });
  try {
    const page = await app.firstWindow();
    await page.getByText('ComfyUI Connected', { exact: true }).waitFor({ timeout: 30000 });
    if (kind === 'character') {
      const result = await page.evaluate(async () => {
        const state = await window.oyama.load();
        const record = state.records.find((item) => item.name === 'Live Character Studio Mara');
        if (record?.angleSamples?.length !== 5) throw new Error('Character angles did not reopen.');
        const media = await window.oyama.probeAsset(record.turntableAssetId);
        const frame = await window.oyama.extractFrame({ assetId: record.turntableAssetId, seconds: 0, frame: 0 });
        return { master: record.masterAssetId, frames: media.video?.frames, angleFrames: record.angleSamples.map((item) => item.frame), extracted: frame.id };
      });
      console.log(`PACKAGED_CHARACTER ${JSON.stringify(result)}`);
    } else {
      const result = await page.evaluate(async () => {
        const state = await window.oyama.load();
        const parent = state.jobs.find((job) => job.sequence?.script.name === 'Live owned replacement and blend 20260929');
        if (!parent || parent.status !== 'complete') throw new Error('Continue sequence did not reopen.');
        const media = await window.oyama.probeAsset(parent.assetIds[0]);
        return { asset: parent.assetIds[0], frames: media.video?.frames, duration: media.duration, audio: media.audio?.codec };
      });
      console.log(`PACKAGED_CONTINUE ${JSON.stringify(result)}`);
    }
  } finally {
    await app.close();
  }
}
async function main() {
  await inspect('artifacts/live-character-studio', 'character');
  await inspect('artifacts/live-zimage-app', 'continue');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
