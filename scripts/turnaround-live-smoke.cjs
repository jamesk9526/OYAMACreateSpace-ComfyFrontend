const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const env = {
  ...process.env,
  OYAMA_MOCK: '0',
  OYAMA_TEST: '1',
  OYAMA_DATA_DIR: path.resolve('artifacts/live-turnaround'),
};
delete env.ELECTRON_RUN_AS_NODE;
const packaged = process.argv.includes('--packaged');
const launchOptions = packaged
  ? { executablePath: path.resolve('release/win-unpacked/OYAMA CreateSpace.exe'), args: [], env }
  : { args: ['.'], env };
(async () => {
  let app = await electron.launch(launchOptions);
  try {
    let page = await app.firstWindow();
    await page.getByText('ComfyUI Connected', { exact: true }).waitFor({ timeout: 30000 });
    let state = await page.evaluate(() => window.oyama.load());
    let job = state.jobs.find((j) => j.moduleId === 'ltx');
    if (!job) {
      if (packaged) throw Error('No completed turnaround to reopen; no submission.');
      const q = await fetch(state.settings.comfyUrl + '/queue').then((r) => r.json());
      if (q.queue_running.length || q.queue_pending.length)
        throw Error('Unrelated server work; no submission.');
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      }, path.resolve('artifacts/live-modeling/media/75069861-0c31-4505-b28a-d5ef72e8ef58/6dbe0521-431e-48d8-b857-834a76a085a2.png'));
      await page
        .locator('.navitem')
        .filter({ hasText: /^Assets$/ })
        .click();
      await page.getByRole('button', { name: 'Import media', exact: true }).click();
      await page.waitForFunction(() =>
        window.oyama.load().then((s) => s.assets.some((a) => a.kind === 'image')),
      );
      state = await page.evaluate(() => window.oyama.load());
      const source = state.assets.find((a) => a.kind === 'image');
      await page.evaluate(
        async ({ projectId, sourceId }) =>
          window.oyama.saveDraft({
            projectId,
            moduleId: 'ltx',
            values: {
              mode: 'turnaround',
              firstFrame: sourceId,
              prompt:
                'A stylized wooden treasure chest with brass fittings, closed lid, centered on a plain white studio background.',
              duration: 6,
              width: 512,
              height: 512,
              seed: '34030',
              profile: 'turbo',
            },
          }),
        { projectId: state.projects[0].id, sourceId: source.id },
      );
      // Reload the saved canonical draft before pressing the app's Generate control.
      await page.reload();
      await page.getByText('ComfyUI Connected', { exact: true }).waitFor({ timeout: 30000 });
      await page.locator('.navitem').filter({ hasText: 'LTX 2.5 Video' }).first().click();
      await page.getByRole('button', { name: 'GENERATE VIDEO', exact: true }).click();
      await page.waitForFunction(() =>
        window.oyama.load().then((s) => s.jobs.some((j) => j.moduleId === 'ltx')),
      );
      job = (await page.evaluate(() => window.oyama.load())).jobs.find((j) => j.moduleId === 'ltx');
    }
    let prior = '';
    const deadline = Date.now() + 20 * 60 * 1000;
    while (Date.now() < deadline) {
      job = (await page.evaluate(() => window.oyama.load())).jobs.find((j) => j.id === job.id);
      if (job.status + job.message !== prior) {
        prior = job.status + job.message;
        console.log(job.id, job.promptId, job.status, job.message);
      }
      if (job.status === 'complete') break;
      if (['error', 'cancelled', 'unknown'].includes(job.status))
        throw Error(job.message + '; do not resubmit.');
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (job.status !== 'complete') throw Error('Still running; inspect existing job.');
    const result = await page.evaluate(async (id) => {
      const metadata = await window.oyama.probeAsset(id);
      const frames = [];
      for (const seconds of [0, 1.5, 3, 4.5, 6])
        frames.push(await window.oyama.extractFrame({ assetId: id, seconds }));
      return { metadata, frames };
    }, job.assetIds[0]);
    console.log(JSON.stringify(result.metadata));
    await fs.writeFile(
      'artifacts/turnaround-result.json',
      JSON.stringify({ job, ...result }, null, 2),
    );
    await page.locator('.navitem').filter({ hasText: 'LTX 2.5 Video' }).first().click();
    if (packaged) {
      await page.getByRole('button', { name: 'Save 4 views', exact: true }).click();
      await page.getByRole('heading', { name: 'Assets & References' }).waitFor();
      console.log('Packaged Save 4 views completed.');
      await page.locator('.navitem').filter({ hasText: 'LTX 2.5 Video' }).first().click();
    }
    for (const size of [
      [1440, 900],
      [1100, 760],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0].setSize(...s),
        size,
      );
      await page.screenshot({ path: `artifacts/turnaround-live-${size[0]}.png` });
    }
    await app.close();
    app = await electron.launch(launchOptions);
    page = await app.firstWindow();
    await page.getByText('ComfyUI Connected', { exact: true }).waitFor({ timeout: 30000 });
    await page.locator('.navitem').filter({ hasText: 'LTX 2.5 Video' }).first().click();
    await page.locator('video').first().waitFor();
    await page.waitForFunction(() => {
      const v = document.querySelector('video');
      return v && v.readyState >= 2;
    });
    console.log('Restart decoded managed turnaround.');
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
