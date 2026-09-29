const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const profile = process.argv.includes('--quality') ? 'quality' : 'turbo';
  const references = process.argv.includes('--references');
  const reuse = process.argv.includes('--reuse-complete');
  const packaged = process.argv.includes('--packaged');
  const resultName = `live-photo-edit-${profile}${references ? '-references' : ''}`;
  const env = {
    ...process.env,
    OYAMA_MOCK: '0',
    OYAMA_TEST: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/live-zimage-app'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    ...(packaged
      ? { executablePath: path.resolve('release/win-unpacked/OYAMA CreateSpace.exe'), args: [] }
      : { args: ['.'] }),
    env,
  });
  let page;
  const errors = [];
  try {
    page = await app.firstWindow();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.getByText('ComfyUI Connected', { exact: true }).waitFor({ timeout: 30000 });
    const existing = await page.evaluate(
      async ({ profile, references, reuse }) =>
        (await window.oyama.load()).jobs.find(
          (job) =>
            job.moduleId === 'photo-edit' &&
            job.snapshot.profile === profile &&
            Boolean(job.snapshot.references?.length) === references &&
            (reuse
              ? job.status === 'complete'
              : ['preparing', 'submitting', 'queued', 'running', 'recovering', 'unknown'].includes(
                  job.status,
                )),
        ),
      { profile, references, reuse },
    );
    let jobId = existing?.id;
    if (!jobId) {
      if (reuse) throw new Error('No completed Photo Edit job to reopen.');
      await page
        .locator('.navitem')
        .filter({ hasText: /^LTX Ripple/ })
        .first()
        .click();
      await page.getByRole('button', { name: 'References', exact: true }).last().click();
      await page.getByRole('button', { name: 'Edit first frame with FireRed' }).click();
      await page.getByLabel('Photo Edit profile').selectOption(profile);
      await page.getByLabel('Photo Edit width').fill('512');
      await page.getByLabel('Photo Edit height').fill('320');
      await page.getByLabel('Photo Edit seed').fill('12345');
      await page.getByRole('button', { name: 'Inputs', exact: true }).click();
      const referenceId = await page.evaluate(
        async () =>
          (await window.oyama.load()).jobs.find(
            (job) => job.moduleId === 'zimage' && job.status === 'complete',
          )?.assetIds[0],
      );
      await page.getByLabel('Photo Edit reference 1').selectOption(references ? referenceId : '');
      const secondReferenceId = await page.evaluate(
        async () =>
          (await window.oyama.load()).jobs.find(
            (job) => job.moduleId === 'photo-edit' && job.status === 'complete',
          )?.assetIds[0],
      );
      await page
        .getByLabel('Photo Edit reference 2')
        .selectOption(references ? secondReferenceId || referenceId : '');
      await page.getByRole('button', { name: 'Prompt', exact: true }).click();
      await page
        .getByRole('textbox', { name: 'Photo Edit prompt' })
        .fill(
          'Change only the lime green glass cube to cobalt blue glass. Preserve its shape, charcoal plinth, studio background and lighting.',
        );
      await page.screenshot({ path: 'artifacts/photo-edit-shell-1440.png' });
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(1100, 760),
      );
      await page.screenshot({ path: 'artifacts/photo-edit-shell-1100.png' });
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(1440, 900),
      );
      const priorIds = await page.evaluate(async () =>
        (await window.oyama.load()).jobs.map((job) => job.id),
      );
      await page.getByRole('button', { name: 'GENERATE IMAGE' }).click();
      jobId = await page.evaluate(async (priorIds) => {
        for (let i = 0; i < 50; i++) {
          const job = (await window.oyama.load()).jobs.find(
            (item) => item.moduleId === 'photo-edit' && !priorIds.includes(item.id),
          );
          if (job) return job.id;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error('No persisted Photo Edit job.');
      }, priorIds);
    } else
      await page
        .locator('.navitem')
        .filter({ hasText: /^Photo Edit/ })
        .first()
        .click();
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
        {
          await page.getByRole('button', { name: 'Queue', exact: true }).click();
          await page
            .locator(`[data-job-id="${job.id}"]`)
            .getByRole('button', { name: 'View result' })
            .click();
        }
        await page.locator('.preview img').waitFor();
        const image = await page.locator('.preview img').evaluate(async (element) => {
          await element.decode();
          return { width: element.naturalWidth, height: element.naturalHeight };
        });
        if (image.width !== 512 || image.height !== 320 || errors.length)
          throw new Error(`Image decode failed: ${JSON.stringify({ image, errors })}`);
        await page.screenshot({ path: `artifacts/${resultName}-result.png` });
        await page.getByRole('button', { name: 'Use as Ripple replacement' }).click();
        const after = await page.evaluate(() => window.oyama.load());
        const ripple = after.drafts.find(
          (draft) => draft.moduleId === 'ripple' && draft.projectId === job.projectId,
        );
        if (
          ripple?.values.replacementFrame !== job.assetIds[0] ||
          ripple.values.width !== 512 ||
          ripple.values.height !== 320 ||
          !ripple.values.sourceVideo
        )
          throw new Error('Photo Edit round trip lost source/canvas.');
        await fs.writeFile(
          `artifacts/${resultName}-result.json`,
          JSON.stringify({ job, image, ripple, assets: after.assets }, null, 2),
        );
        console.log(
          JSON.stringify({
            promptId: job.promptId,
            image,
            rippleSource: ripple.values.sourceVideo,
            replacement: ripple.values.replacementFrame,
          }),
        );
        return;
      }
      if (job && ['error', 'unknown', 'cancelled'].includes(job.status))
        throw new Error(job.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw new Error('Timed out. Inspect persisted prompt ID before retrying.');
  } catch (error) {
    if (page)
      await page.screenshot({ path: 'artifacts/photo-edit-live-failure.png' }).catch(() => {});
    console.error('RENDERER_ERRORS', errors);
    throw error;
  } finally {
    const page = await app.firstWindow().catch(() => null);
    if (page)
      await page
        .getByRole('button', { name: 'Close window' })
        .click()
        .catch(() => {});
    await app.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
