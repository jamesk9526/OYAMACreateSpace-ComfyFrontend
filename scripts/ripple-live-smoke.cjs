// Real ComfyUI app test; never resubmit an uncertain or existing in-flight prompt.
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
  const packaged = process.argv.includes('--packaged');
  const app = await electron.launch({
    ...(packaged
      ? { executablePath: path.resolve('release/win-unpacked/OYAMA CreateSpace.exe'), args: [] }
      : { args: ['.'] }),
    env,
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.getByText('ComfyUI Connected', { exact: true }).waitFor({ timeout: 30000 });
    await page
      .locator('.navitem')
      .filter({ hasText: /^LTX Ripple/ })
      .first()
      .click();
    const reuseComplete = process.argv.includes('--reuse-complete');
    const existing = await page.evaluate(
      async (complete) =>
        (await window.oyama.load()).jobs.find(
          (job) =>
            job.moduleId === 'ripple' &&
            (complete
              ? job.status === 'complete'
              : ['preparing', 'submitting', 'queued', 'running', 'recovering', 'unknown'].includes(
                  job.status,
                )),
        ),
      reuseComplete,
    );
    let jobId = existing?.id;
    if (!jobId) {
      if (reuseComplete) throw new Error('No completed Ripple job to reopen.');
      const inputs = await page.evaluate(async () => {
        const state = await window.oyama.load();
        const frame = state.assets.find(
          (asset) =>
            asset.id ===
            state.jobs.find((job) => job.moduleId === 'zimage' && job.status === 'complete')
              ?.assetIds[0],
        );
        if (!frame) throw new Error('No real ZImage replacement frame.');
        for (const asset of state.assets.filter(
          (asset) => asset.kind === 'video' && asset.projectId === frame.projectId,
        )) {
          const metadata = await window.oyama.probeAsset(asset.id);
          if (
            metadata.video &&
            (metadata.video.duration || metadata.duration) >= 2 &&
            (metadata.audio?.duration || 0) >= 2
          )
            return { source: asset.id, frame: frame.id };
        }
        throw new Error('Need a real generated source video with audio and at least 2 seconds.');
      });
      if (process.argv.includes('--from-draft')) {
        const draftInputs = await page.evaluate(async () => {
          const state = await window.oyama.load();
          const draft = state.drafts.find((item) => item.moduleId === 'ripple');
          return { source: draft?.values.sourceVideo, frame: draft?.values.replacementFrame };
        });
        if (!draftInputs.source || !draftInputs.frame)
          throw new Error('Ripple draft has no Photo Edit handoff.');
        inputs.source = draftInputs.source;
        inputs.frame = draftInputs.frame;
      }
      await page.getByRole('button', { name: 'References', exact: true }).last().click();
      await page.getByLabel('Ripple source video').selectOption(inputs.source);
      await page.getByLabel('Ripple replacement frame').selectOption(inputs.frame);
      await page.getByLabel('Ripple width').fill('512');
      await page.getByLabel('Ripple height').fill('320');
      await page.getByLabel('Ripple duration').focus();
      await page.getByLabel('Ripple duration').press('Home');
      await page.getByLabel('Ripple seed').fill('314159');
      await page.screenshot({ path: 'artifacts/ripple-shell-1440.png' });
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(1100, 760),
      );
      await page.screenshot({ path: 'artifacts/ripple-shell-1100.png' });
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(1440, 900),
      );
      await page.getByRole('button', { name: 'Prompt', exact: true }).click();
      await page
        .getByRole('textbox', { name: 'Ripple prompt' })
        .fill(
          process.argv.includes('--from-draft')
            ? 'Preserve source motion, timing and lighting while propagating the cobalt blue glass cube from the edited first frame.'
            : 'A lime green glass cube stays on its charcoal plinth. Preserve the source motion and lighting while keeping the cube lime green.',
        );
      const priorIds = await page.evaluate(async () =>
        (await window.oyama.load()).jobs.map((job) => job.id),
      );
      await page.getByRole('button', { name: 'GENERATE VIDEO' }).click();
      jobId = await page.evaluate(async (priorIds) => {
        for (let i = 0; i < 50; i++) {
          const job = (await window.oyama.load()).jobs.find(
            (item) => item.moduleId === 'ripple' && !priorIds.includes(item.id),
          );
          if (job) return job.id;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error('No persisted Ripple job.');
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
        const media = await page.evaluate((id) => window.oyama.probeAsset(id), job.assetIds[0]);
        if (
          media.video?.frames !== 49 ||
          media.audio?.codec !== 'aac' ||
          Math.abs(media.duration - 49 / 24) > 0.1
        )
          throw new Error(`Unexpected Ripple streams: ${JSON.stringify(media)}`);
        await page.locator('.preview video').waitFor();
        const video = await page.locator('.preview video').evaluate(async (element) => {
          if (element.readyState < 1)
            await new Promise((resolve, reject) => {
              element.addEventListener('loadedmetadata', resolve, { once: true });
              element.addEventListener('error', reject, { once: true });
            });
          return {
            width: element.videoWidth,
            height: element.videoHeight,
            duration: element.duration,
          };
        });
        if (video.width !== 512 || video.height !== 320 || errors.length)
          throw new Error(`Playback failed: ${JSON.stringify({ video, errors })}`);
        await page.screenshot({ path: 'artifacts/live-ripple-result.png' });
        await fs.writeFile(
          'artifacts/live-ripple-result.json',
          JSON.stringify({ job, media, video, assets: state.assets }, null, 2),
        );
        console.log(JSON.stringify({ promptId: job.promptId, media, video }));
        return;
      }
      if (job && ['error', 'unknown', 'cancelled'].includes(job.status))
        throw new Error(job.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw new Error('Test timed out. Inspect the saved prompt ID before retrying.');
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
