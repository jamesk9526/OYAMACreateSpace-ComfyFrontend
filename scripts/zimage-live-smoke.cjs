// Explicit live integration check: queue one small local ZImage Turbo render through the app UI.
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
    const reuseComplete = process.argv.includes('--reuse-complete');
    const existing = await page.evaluate(async (includeComplete) => {
      const state = await window.oyama.load();
      return state.jobs.find(
        (job) =>
          job.moduleId === 'zimage' &&
          (includeComplete
            ? job.status === 'complete'
            : ['preparing', 'submitting', 'queued', 'running', 'recovering', 'unknown'].includes(
                job.status,
              )),
      );
    }, reuseComplete);
    let jobId = existing?.id;
    if (jobId)
      await page
        .locator('.navitem')
        .filter({ hasText: /^Image/ })
        .click();
    if (!jobId) {
      await page
        .locator('.navitem')
        .filter({ hasText: /^Image/ })
        .click();
      await page
        .getByRole('textbox', { name: 'Image prompt' })
        .fill(
          'A precise lime green glass cube on a matte charcoal plinth, soft studio light, centered composition.',
        );
      await page.getByLabel('Profile', { exact: true }).selectOption('turbo');
      await page.getByLabel('Image width').fill('256');
      await page.getByLabel('Image height').fill('256');
      await page.getByLabel('Image seed').fill('314159');
      const priorIds = await page.evaluate(async () =>
        (await window.oyama.load()).jobs.map((job) => job.id),
      );
      await page.getByRole('button', { name: 'GENERATE IMAGE' }).click();
      jobId = await page.evaluate(async (priorIds) => {
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
          const job = (await window.oyama.load()).jobs.find(
            (item) => item.moduleId === 'zimage' && !priorIds.includes(item.id),
          );
          if (job) return job.id;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error('ZImage job was not persisted after submission.');
      }, priorIds);
    }
    console.log(`APP_JOB ${jobId}`);
    const deadline = Date.now() + 20 * 60 * 1000;
    let last = '';
    while (Date.now() < deadline) {
      const state = await page.evaluate(() => window.oyama.load());
      const job = state.jobs.find((item) => item.id === jobId);
      if (job && `${job.status}:${job.message}` !== last) {
        last = `${job.status}:${job.message}`;
        console.log(last);
      }
      if (job?.status === 'complete') {
        await page.locator('.preview img').waitFor();
        const image = await page.locator('.preview img').evaluate((element) => ({
          width: element.naturalWidth,
          height: element.naturalHeight,
          src: element.getAttribute('src'),
        }));
        if (!image.width || !image.height) throw new Error('Saved ZImage output could not decode.');
        await page.screenshot({ path: 'artifacts/live-zimage-app-result.png' });
        await fs.writeFile(
          'artifacts/live-zimage-app-result.json',
          JSON.stringify({ job, image, assets: state.assets }, null, 2),
        );
        console.log(JSON.stringify(image));
        return;
      }
      if (job && ['error', 'unknown', 'cancelled'].includes(job.status))
        throw new Error(job.message);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error('Test timed out; inspect the persisted prompt ID before retrying.');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
