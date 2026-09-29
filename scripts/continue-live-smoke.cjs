const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const quality = process.argv.includes('--native') ? 'native' : 'turbo8';
  const reuse = process.argv.includes('--reuse-complete');
  const packaged = process.argv.includes('--packaged');
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
    const state = await page.evaluate(() => window.oyama.load());
    let existing = state.jobs.find(
      (job) =>
        job.moduleId === 'continue' &&
        job.snapshot.quality === quality &&
        (reuse
          ? job.status === 'complete'
          : ['preparing', 'submitting', 'queued', 'running', 'recovering', 'unknown'].includes(
              job.status,
            )),
    );
    if (existing?.status === 'unknown' && process.argv.includes('--dismiss-unsubmitted')) {
      if (existing.promptId)
        throw new Error(
          'Reconcile the existing prompt ID; dismissal is only for the interrupted pre-submission test.',
        );
      const [history, queue] = await Promise.all([
        fetch(`${existing.endpoint}/history`).then((response) => response.json()),
        fetch(`${existing.endpoint}/queue`).then((response) => response.json()),
      ]);
      if (JSON.stringify({ history, queue }).includes(existing.id))
        throw new Error('Server knows this job; do not dismiss or resubmit it.');
      console.log(`HISTORY_CHECK_NO_SUBMISSION ${existing.id}`);
      await page.getByRole('button', { name: 'Queue', exact: true }).click();
      await page
        .locator(`[data-job-id="${existing.id}"]`)
        .getByRole('button', { name: 'Dismiss unresolved' })
        .click();
      existing = undefined;
      await page.getByRole('button', { name: 'Properties', exact: true }).click();
    }
    let jobId = existing?.id;
    await page
      .locator('.navitem')
      .filter({ hasText: /^Continue \/ Extend/ })
      .first()
      .click();
    if (!jobId) {
      if (reuse) throw new Error('No completed Continue job.');
      const sourceId = state.jobs.find(
        (job) => job.moduleId === 'ltx' && job.status === 'complete' && job.snapshot.duration === 2,
      )?.assetIds[0];
      if (!sourceId) throw new Error('Need the live two-second LTX source.');
      await page.getByRole('button', { name: 'Choose source' }).click();
      await page.getByLabel('Continue source video').selectOption(sourceId);
      await page.getByLabel('Continue quality').selectOption(quality);
      await page.getByLabel('Continue width').fill('512');
      await page.getByLabel('Continue height').fill('320');
      await page.getByLabel('Continue seed').fill('12345');
      await page.getByLabel('Continue duration').focus();
      await page.getByLabel('Continue duration').press('Home');
      await page.getByRole('button', { name: 'Prompt', exact: true }).click();
      await page
        .getByLabel('Continue next action')
        .fill(
          'The glass cube gently rotates on the charcoal plinth. Keep the studio background and soft lighting. No speech. A quiet sustained ambient tone.',
        );
      await page.screenshot({ path: 'artifacts/continue-shell-1440.png' });
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(1100, 760),
      );
      await page.screenshot({ path: 'artifacts/continue-shell-1100.png' });
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(1440, 900),
      );
      await page.getByRole('button', { name: 'CONTINUE VIDEO' }).click();
      jobId = await page.evaluate(
        async (priorIds) => {
          for (let index = 0; index < 100; index++) {
            const job = (await window.oyama.load()).jobs.find(
              (job) => job.moduleId === 'continue' && !priorIds.includes(job.id),
            );
            if (job) return job.id;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          throw new Error('No Continue job persisted.');
        },
        state.jobs.map((job) => job.id),
      );
    }
    console.log(`APP_JOB ${jobId}`);
    let last = '';
    const deadline = Date.now() + 30 * 60 * 1000;
    while (Date.now() < deadline) {
      const state = await page.evaluate(() => window.oyama.load());
      const job = state.jobs.find((job) => job.id === jobId);
      if (job && `${job.status}:${job.message}` !== last) {
        last = `${job.status}:${job.message}`;
        console.log(last);
      }
      if (job?.status === 'complete') {
        await page.getByRole('button', { name: 'Queue', exact: true }).click();
        await page
          .locator(`[data-job-id="${jobId}"]`)
          .getByRole('button', { name: 'View result' })
          .click();
        await page.getByRole('button', { name: 'Result', exact: true }).click();
        const asset = state.assets.find((asset) => asset.id === job.assetIds[0]);
        const beat = state.assets.find((asset) => asset.id === job.assetIds[1]);
        if (
          asset?.media?.video?.frames !== 71 ||
          beat?.media?.video?.frames !== 22 ||
          !asset?.media?.audio ||
          errors.length
        )
          throw new Error(`Invalid joined output: ${JSON.stringify({ asset, beat, errors })}`);
        await page.waitForFunction(
          (url) => document.querySelector('.preview video')?.getAttribute('src') === url,
          asset.url,
        );
        const playback = await page.locator('.preview video').evaluate(async (video) => {
          if (video.readyState < 2)
            await new Promise((resolve, reject) => {
              video.addEventListener('loadeddata', resolve, { once: true });
              video.addEventListener('error', () => reject(new Error('Video decoding failed')), {
                once: true,
              });
            });
          video.pause();
          video.currentTime = 2.3;
          await new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }));
          const seekTime = video.currentTime;
          if (Math.abs(seekTime - 2.3) > 0.1)
            throw new Error(`Continuation seek failed: ${seekTime}`);
          await video.play();
          await new Promise((resolve) => setTimeout(resolve, 250));
          video.pause();
          return {
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
            currentTime: video.currentTime,
            seekTime,
          };
        });
        if (
          playback.width !== 512 ||
          playback.height !== 320 ||
          Math.abs(playback.duration - 71 / 24) > 0.1
        )
          throw new Error('Joined playback metadata mismatch.');
        await page.screenshot({ path: `artifacts/live-continue-${quality}-result.png` });
        await fs.writeFile(
          `artifacts/live-continue-${quality}-result.json`,
          JSON.stringify({ job, asset, beat, playback }, null, 2),
        );
        console.log(JSON.stringify({ promptId: job.promptId, playback, streams: asset.media }));
        return;
      }
      if (job && ['error', 'unknown', 'cancelled'].includes(job.status))
        throw new Error(job.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw new Error('Timeout. Reconcile the saved prompt ID before retrying.');
  } catch (error) {
    if (page) {
      await page.screenshot({ path: 'artifacts/continue-live-failure.png' }).catch(() => {});
      console.error('RENDERER_ERRORS', errors);
      console.error(
        'UI_STATE',
        await page
          .locator('.error-toast, .preview, .composer')
          .allTextContents()
          .catch(() => []),
      );
    }
    throw error;
  } finally {
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
