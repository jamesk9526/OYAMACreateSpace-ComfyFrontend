// One app-driven local Wardrobe -> H3 reference render. Reuses an existing job on rerun.
const { _electron: electron } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');

async function main() {
  const dataDir = path.resolve('artifacts/live-wardrobe-app');
  const env = { ...process.env, OYAMA_MOCK: '0', OYAMA_TEST: '1', OYAMA_DATA_DIR: dataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole('textbox', { name: 'Prompt', exact: true }).waitFor();
    const referencePath = path.resolve('public/mock/reference.png');
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, referencePath);
    const job = await page.evaluate(async ({ characterId, wardrobeId }) => {
      const api = window.oyama;
      const ready = await api.checkConnection();
      if (!ready.connected) throw new Error(ready.message);
      const state = await api.load();
      const existing = state.jobs.find((item) => item.moduleId === 'h3' && item.snapshot.wardrobeIds?.length);
      if (existing) return existing;
      const projectId = state.projects[0].id;
      const [reference] = await api.importMedia({ projectId: null });
      if (!reference || reference.kind !== 'image') throw new Error('Wardrobe test image did not import.');
      await api.saveRecord({ id: characterId, kind: 'character', name: 'Wardrobe test character', description: 'Studio subject', assetIds: [] });
      await api.saveRecord({ id: wardrobeId, kind: 'wardrobe', name: 'Wardrobe test coat', description: 'Dark fitted coat and boots', colors: 'olive and black', materials: 'waxed cotton', visualStyle: 'cinematic photorealism', characterId, assetIds: [reference.id] });
      return api.generate({ projectId, moduleId: 'h3', values: { prompt: 'A studio subject wearing the wardrobe test coat turns slowly. Soft light, locked camera, quiet room ambience.', mode: 'reference', modeExplicit: true, width: 256, height: 256, duration: 1, quality: 'turbo8', seed: '314159', characterIds: [characterId], wardrobeIds: [wardrobeId] } });
    }, { characterId: randomUUID(), wardrobeId: randomUUID() });
    console.log(`APP_JOB ${job.id} PROMPT ${job.promptId || 'pending'}`);
    const deadline = Date.now() + 20 * 60 * 1000;
    let previous = '';
    while (Date.now() < deadline) {
      const state = await page.evaluate(() => window.oyama.load());
      const current = state.jobs.find((item) => item.id === job.id);
      if (current && `${current.status}:${current.message}` !== previous) {
        previous = `${current.status}:${current.message}`;
        console.log(previous);
      }
      if (current?.status === 'complete') {
        const output = state.assets.find((item) => item.id === current.assetIds[0]);
        if (!output) throw new Error('Completed Wardrobe job has no managed output.');
        const media = await page.evaluate((id) => window.oyama.probeAsset(id), output.id);
        const playback = await page.locator('.preview video').evaluate(async (video) => {
          await video.play();
          video.currentTime = 0.75;
          return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
        });
        await fs.writeFile('artifacts/wardrobe-live-evidence.json', JSON.stringify({ job: current, output, media, playback }, null, 2));
        console.log(JSON.stringify({ output: output.id, duration: media.duration, video: media.video, audio: media.audio }));
        return;
      }
      if (current && ['error', 'unknown', 'cancelled'].includes(current.status)) throw new Error(current.message);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error('Timed out; inspect the persisted prompt ID before retrying.');
  } finally {
    await app.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
