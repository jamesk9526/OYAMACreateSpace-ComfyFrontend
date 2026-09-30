const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const env = {
  ...process.env,
  OYAMA_MOCK: '0',
  OYAMA_TEST: '1',
  OYAMA_DATA_DIR: path.resolve('artifacts/live-modeling'),
};
delete env.ELECTRON_RUN_AS_NODE;
async function wait(page, id) {
  let previous = '';
  const deadline = Date.now() + 25 * 60 * 1000;
  while (Date.now() < deadline) {
    const j = (await page.evaluate(() => window.oyama.load())).jobs.find((j) => j.id === id);
    if (j.status + ':' + j.message !== previous) {
      previous = j.status + ':' + j.message;
      console.log(j.id, previous, 'prompt=' + j.promptId);
    }
    if (j.status === 'complete') return j;
    if (['error', 'cancelled', 'unknown'].includes(j.status)) throw new Error(j.message);
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error('Render still running; inspect persisted job before retrying.');
}
(async () => {
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await page.getByText('ComfyUI Connected', { exact: true }).waitFor({ timeout: 30000 });
    let state = await page.evaluate(() => window.oyama.load());
    const projectId = state.projects[0].id;
    const queue = await fetch(state.settings.comfyUrl + '/queue').then((r) => r.json());
    const owned = new Set(state.jobs.map((job) => job.promptId).filter(Boolean));
    if ([...queue.queue_running, ...queue.queue_pending].some((job) => !owned.has(job[1])))
      throw new Error('Server has unrelated queued work.');
    let imageJob = state.jobs.find((j) => j.moduleId === 'zimage');
    if (!imageJob)
      imageJob = await page.evaluate(
        (projectId) =>
          window.oyama.generate({
            projectId,
            moduleId: 'zimage',
            values: {
              prompt:
                'One stylized animated wooden treasure chest game prop, centered, complete silhouette, closed lid, brass fittings, clear front three-quarter view, isolated plain white background, studio lighting, no text.',
              width: 512,
              height: 512,
              seed: '33030',
              variant: 'turbo',
            },
          }),
        projectId,
      );
    imageJob = await wait(page, imageJob.id);
    await page.locator('.navitem').filter({ hasText: 'Modeling' }).click();
    await page.getByLabel('Mode', { exact: true }).selectOption('asset');
    await page.getByLabel('Look', { exact: true }).selectOption('animated');
    await page.getByLabel('Source image', { exact: true }).selectOption(imageJob.assetIds[0]);
    await page.getByLabel('Seed', { exact: true }).fill('33031');
    state = await page.evaluate(() => window.oyama.load());
    let modelJob = state.jobs.find((j) => j.moduleId === 'modeling');
    if (!modelJob) {
      await page.getByRole('button', { name: 'GENERATE MODEL', exact: true }).click();
      await page.waitForFunction(() =>
        window.oyama.load().then((s) => s.jobs.some((j) => j.moduleId === 'modeling')),
      );
      modelJob = (await page.evaluate(() => window.oyama.load())).jobs.find(
        (j) => j.moduleId === 'modeling',
      );
    }
    modelJob = await wait(page, modelJob.id);
    await page.getByText(/triangles · Drag/).waitFor({ timeout: 30000 });
    for (const [width, height] of [
      [1440, 900],
      [1100, 760],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size),
        [width, height],
      );
      await page.screenshot({ path: `artifacts/modeling-live-${width}.png` });
    }
    const result = await page.evaluate(async (id) => {
      const s = await window.oyama.load(),
        job = s.jobs.find((j) => j.id === id),
        asset = s.assets.find((a) => a.id === job.assetIds[0]);
      const bytes = await (await fetch(asset.url)).arrayBuffer();
      const v = new DataView(bytes);
      const metadata = JSON.parse(
        new TextDecoder().decode(new Uint8Array(bytes, 20, v.getUint32(12, true))),
      );
      return {
        job,
        asset,
        bytes: bytes.byteLength,
        meshes: metadata.meshes?.length,
        materials: metadata.materials,
        images: metadata.images,
        accessors: metadata.accessors,
      };
    }, modelJob.id);
    await fs.writeFile('artifacts/modeling-live-evidence.json', JSON.stringify(result, null, 2));
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.getByText('ComfyUI Connected', { exact: true }).waitFor();
    await page.locator('.navitem').filter({ hasText: 'Modeling' }).click();
    await page.getByText(/triangles · Drag/).waitFor({ timeout: 30000 });
    console.log(
      'Managed GLB reopened after restart.',
      JSON.stringify({
        job: modelJob.id,
        prompt: modelJob.promptId,
        bytes: result.bytes,
        meshes: result.meshes,
        textures: result.images?.length,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
