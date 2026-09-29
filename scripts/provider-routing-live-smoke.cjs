const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const cases = [
  ['zimage-turbo', 'zimage', '7', { variant: 'turbo', width: 256, height: 256 }],
  ['ltx-turbo-text', 'ltx', '3', { profile: 'turbo', mode: 'text' }],
  ['ltx-turbo-image', 'ltx', '4', { profile: 'turbo', mode: 'image' }],
  ['ltx-quality-text', 'ltx', '3', { profile: 'quality', mode: 'text' }],
  ['ltx-quality-image', 'ltx', '4', { profile: 'quality', mode: 'image' }],
  ['ltx-quality-msr', 'ltx', '4', { profile: 'quality', mode: 'image', msr: { enabled: true } }],
  ['photo-edit-turbo', 'photo-edit', '8', { profile: 'turbo' }],
  ['photo-edit-quality', 'photo-edit', '8', { profile: 'quality' }],
];
async function main() {
  const reopen = process.argv.includes('--reopen');
  const env = {
    ...process.env,
    OYAMA_MOCK: '0',
    OYAMA_TEST: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/live-zimage-app'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  if (reopen) env.PATH = process.env.SystemRoot + '\\System32';
  const app = await electron.launch({
    ...(reopen
      ? { executablePath: path.resolve('release/win-unpacked/OYAMA CreateSpace.exe'), args: [] }
      : { args: ['.'] }),
    env,
  });
  const page = await app.firstWindow();
  try {
    await page.getByText('ComfyUI Connected', { exact: true }).waitFor({ timeout: 30000 });
    for (const [index, [name, moduleId, tool, overrides]] of cases.entries()) {
      let state = await page.evaluate(() => window.oyama.load());
      const seed = String(33000 + index);
      let job = state.jobs.find((job) => job.moduleId === moduleId && job.snapshot.seed === seed);
      console.log(`VERIFY ${name} ${reopen ? 'packaged restart' : 'live'}`);
      if (!job) {
        if (reopen) throw new Error('No completed provider output for restart.');
        const queue = await fetch(state.settings.comfyUrl + '/queue').then((response) =>
          response.json(),
        );
        if (
          queue.queue_running.length ||
          queue.queue_pending.length ||
          state.jobs.some((job) =>
            ['preparing', 'submitting', 'queued', 'running', 'recovering', 'unknown'].includes(
              job.status,
            ),
          )
        )
          throw new Error('Resolve existing jobs before provider routing test.');
        const frame = state.assets.find(
          (asset) =>
            asset.id ===
            state.jobs.find((job) => job.moduleId === 'zimage' && job.status === 'complete')
              ?.assetIds[0],
        );
        if (!frame) throw new Error('Need managed real image.');
        await page.evaluate(
          async ({ projectId, moduleId, frameId, seed, overrides }) => {
            const state = await window.oyama.load();
            await window.oyama.saveSettings({
              ...state.settings,
              gpuRouting: {
                preset: 'custom',
                diffusion: 'gpu:0',
                textEncoder: 'gpu:0',
                videoVae: 'gpu:1',
                audioVae: 'gpu:1',
              },
            });
            await window.oyama.saveDraft({
              projectId,
              moduleId,
              values: {
                prompt:
                  'A green glass cube rotates slowly on a studio plinth. Quiet room ambience.',
                width: 512,
                height: 320,
                duration: 1,
                seed,
                ...overrides,
                ...(moduleId === 'ltx' && overrides.mode === 'image'
                  ? { firstFrame: frameId }
                  : {}),
                ...(overrides.msr ? { msr: { ...overrides.msr, pic1: frameId } } : {}),
                ...(moduleId === 'photo-edit'
                  ? {
                      sourceImage: frameId,
                      references: [frameId],
                      prompt: 'Change the green glass cube to blue. Preserve the background.',
                    }
                  : {}),
              },
            });
          },
          { projectId: frame.projectId, moduleId, frameId: frame.id, seed, overrides },
        );
        await page.reload();
        await page.getByText('ComfyUI Connected', { exact: true }).waitFor();
        await page.getByLabel('Tool mode').selectOption(tool);
        await page
          .getByRole('button', {
            name: moduleId === 'ltx' ? 'GENERATE VIDEO' : 'GENERATE IMAGE',
            exact: true,
          })
          .click();
        await page.waitForFunction(
          async (seed) =>
            (await window.oyama.load()).jobs.some((job) => job.snapshot.seed === seed),
          seed,
        );
        job = (await page.evaluate(() => window.oyama.load())).jobs.find(
          (job) => job.moduleId === moduleId && job.snapshot.seed === seed,
        );
      }
      let last = '';
      for (const deadline = Date.now() + 20 * 60 * 1000; Date.now() < deadline;) {
        state = await page.evaluate(() => window.oyama.load());
        job = state.jobs.find((current) => current.id === job.id);
        if (job.status + job.message !== last) {
          last = job.status + job.message;
          console.log(`${job.status}:${job.message}`);
        }
        if (['error', 'unknown', 'cancelled'].includes(job.status)) throw new Error(job.message);
        if (job.status === 'complete') break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (job.status !== 'complete')
        throw new Error('Timed out; inspect the original prompt before retrying.');
      const history = await fetch(job.endpoint + '/history/' + job.promptId).then((response) =>
        response.json(),
      );
      const selectors = Object.values(history[job.promptId]?.prompt?.[2] ?? {}).filter((node) =>
        /^Select(?:Model|CLIP|VAE)Device$/.test(node.class_type),
      );
      if (
        selectors.length !== (moduleId === 'ltx' ? 4 : 3) ||
        selectors
          .filter((node) => node.class_type === 'SelectVAEDevice')
          .some((node) => node.inputs.device !== 'gpu:1')
      )
        throw new Error('Unexpected server routing graph.');
      await page.getByLabel('Tool mode').selectOption(tool);
      await page.getByRole('button', { name: 'Queue', exact: true }).click();
      await page
        .locator(`[data-job-id="${job.id}"]`)
        .getByRole('button', { name: 'View result' })
        .click();
      let probe, playback;
      if (moduleId === 'ltx') {
        probe = await page.evaluate((id) => window.oyama.probeAsset(id), job.assetIds[0]);
        if (
          probe.video?.frames !== 25 ||
          probe.video.width !== 512 ||
          probe.video.height !== 320 ||
          !probe.audio
        )
          throw new Error('Unexpected routed video streams.');
        playback = await page.locator('.preview video').evaluate(async (video) => {
          if (video.readyState < 2)
            await new Promise((resolve) =>
              video.addEventListener('loadeddata', resolve, { once: true }),
            );
          video.currentTime = 0.6;
          await new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }));
          return {
            time: video.currentTime,
            width: video.videoWidth,
            height: video.videoHeight,
            duration: video.duration,
          };
        });
      } else {
        await page.waitForFunction(() => {
          const image = document.querySelector('.preview img');
          return image?.complete && image.naturalWidth > 0;
        });
        playback = await page
          .locator('.preview img')
          .evaluate((image) => ({ width: image.naturalWidth, height: image.naturalHeight }));
        if (
          playback.width !== (overrides.width ?? 512) ||
          playback.height !== (overrides.height ?? 320)
        )
          throw new Error('Unexpected routed image dimensions.');
      }
      await fs.writeFile(
        `artifacts/${name}-routed${reopen ? '-reopened' : ''}.json`,
        JSON.stringify({ job, selectors, probe, playback }, null, 2),
      );
      console.log(JSON.stringify({ name, promptId: job.promptId, probe, playback }));
    }
    if (reopen) {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'Save & test connection' }).click();
      await page.getByRole('status').filter({ hasText: 'Settings saved' }).waitFor();
      if ((await page.getByLabel('Video / image VAE device').inputValue()) !== 'gpu:1')
        throw new Error('Live settings lost VAE routing.');
      await page.screenshot({ path: 'artifacts/settings-live-packaged-1440.png' });
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(1100, 760),
      );
      await page.screenshot({ path: 'artifacts/settings-live-packaged-1100.png' });
      await page.getByRole('button', { name: 'Close dialog' }).click();
    }
  } finally {
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
