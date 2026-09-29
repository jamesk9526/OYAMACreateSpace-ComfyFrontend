// Explicit live app integration check. Reuses an in-flight prompt after restart.
const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const imageMode = process.argv.includes('--image');
  const quality = process.argv.includes('--quality');
  const msr = process.argv.includes('--msr');
  const seconds = Number(
    process.argv.find((arg) => arg.startsWith('--seconds='))?.split('=')[1] || 1,
  );
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 15)
    throw new Error('Invalid test duration.');
  const resultName =
    seconds > 1
      ? 'live-ltx-source'
      : msr
        ? 'live-ltx-msr-quality'
        : imageMode
          ? 'live-ltx-image-quality'
          : 'live-ltx-app';
  const env = {
    ...process.env,
    OYAMA_MOCK: '0',
    OYAMA_TEST: '1',
    OYAMA_DATA_DIR: path.resolve(
      imageMode ? 'artifacts/live-zimage-app' : 'artifacts/live-ltx-app',
    ),
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
    await page
      .locator('.navitem')
      .filter({ hasText: /^LTX 2\.5 Video/ })
      .first()
      .click();
    const reuseComplete = process.argv.includes('--reuse-complete');
    const existing = await page.evaluate(
      async (includeComplete) =>
        (await window.oyama.load()).jobs.find(
          (job) =>
            job.moduleId === 'ltx' &&
            (includeComplete
              ? job.status === 'complete'
              : ['preparing', 'submitting', 'queued', 'running', 'recovering', 'unknown'].includes(
                  job.status,
                )),
        ),
      reuseComplete,
    );
    let jobId = existing?.id;
    if (!jobId) {
      if (imageMode) {
        await page
          .locator('.navitem')
          .filter({ hasText: /^Image/ })
          .click();
        await page.getByRole('button', { name: 'Properties' }).click();
        await page.getByRole('button', { name: 'Use as LTX first frame' }).click();
        await page.getByRole('button', { name: 'MSR', exact: true }).click();
        const msrSwitch = page.getByRole('switch', { name: 'Use Licon MSR references' });
        if (((await msrSwitch.getAttribute('data-state')) === 'checked') !== msr)
          await msrSwitch.click();
        if (msr) {
          const imageId = await page.evaluate(
            async () =>
              (await window.oyama.load()).jobs.find(
                (job) => job.moduleId === 'zimage' && job.status === 'complete',
              )?.assetIds[0],
          );
          if (!imageId) throw new Error('No saved ZImage result for LTX MSR reference.');
          await page.getByLabel('MSR pic1').selectOption(imageId);
        }
      } else await page.getByLabel('LTX mode').selectOption('text');
      await page.getByLabel('LTX profile').selectOption(quality ? 'quality' : 'turbo');
      await page.getByLabel('LTX width').fill('512');
      await page.getByLabel('LTX height').fill('320');
      if (imageMode) await page.getByRole('button', { name: 'Prompt', exact: true }).click();
      await page
        .getByRole('textbox', { name: 'LTX prompt' })
        .fill(
          imageMode
            ? 'The lime green glass cube gently rotates on its charcoal plinth. Quiet studio ambience.'
            : 'A single candle glows in a quiet stone room. The camera slowly moves closer. A soft wind can be heard.',
        );
      await page.locator('.rightpanel .range').focus();
      await page.locator('.rightpanel .range').press('Home');
      for (let i = 1; i < seconds; i++)
        await page.locator('.rightpanel .range').press('ArrowRight');
      await page.getByLabel('LTX seed').fill('314159');
      const priorIds = await page.evaluate(async () =>
        (await window.oyama.load()).jobs.map((job) => job.id),
      );
      await page.getByRole('button', { name: 'GENERATE VIDEO' }).click();
      jobId = await page.evaluate(async (priorIds) => {
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
          const job = (await window.oyama.load()).jobs.find(
            (item) => item.moduleId === 'ltx' && !priorIds.includes(item.id),
          );
          if (job) return job.id;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error('LTX job was not persisted after submission.');
      }, priorIds);
    }
    console.log(`APP_JOB ${jobId}`);
    const deadline = Date.now() + 30 * 60 * 1000;
    let last = '';
    while (Date.now() < deadline) {
      const state = await page.evaluate(() => window.oyama.load());
      const job = state.jobs.find((item) => item.id === jobId);
      if (job && `${job.status}:${job.message}` !== last) {
        last = `${job.status}:${job.message}`;
        console.log(last);
      }
      if (job?.status === 'complete') {
        await page.locator('.preview video').waitFor();
        const video = await page.locator('.preview video').evaluate(async (element) => {
          await new Promise((resolve, reject) => {
            if (element.readyState >= 1) resolve();
            else {
              element.addEventListener('loadedmetadata', resolve, { once: true });
              element.addEventListener('error', reject, { once: true });
            }
          });
          return {
            duration: element.duration,
            width: element.videoWidth,
            height: element.videoHeight,
            src: element.getAttribute('src'),
          };
        });
        if (!video.width || !video.height || !video.duration)
          throw new Error('Saved LTX video could not decode.');
        await page.screenshot({ path: `artifacts/${resultName}-result.png` });
        await fs.writeFile(
          `artifacts/${resultName}-result.json`,
          JSON.stringify({ job, video, assets: state.assets }, null, 2),
        );
        console.log(JSON.stringify(video));
        return;
      }
      if (job && ['error', 'unknown', 'cancelled'].includes(job.status))
        throw new Error(job.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
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
