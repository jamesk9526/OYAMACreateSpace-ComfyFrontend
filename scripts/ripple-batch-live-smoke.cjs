const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
async function main() {
  const packaged = process.argv.includes('--packaged'),
    reuse = process.argv.includes('--reuse-complete'),
    restart = process.argv.includes('--restart-after-first');
  const env = {
    ...process.env,
    OYAMA_MOCK: '0',
    OYAMA_TEST: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/live-zimage-app'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  if (packaged) env.PATH = process.env.SystemRoot + '\\System32';
  const launch = () =>
    electron.launch({
      ...(packaged
        ? { executablePath: path.resolve('release/win-unpacked/OYAMA CreateSpace.exe'), args: [] }
        : { args: ['.'] }),
      env,
    });
  let app = await launch(),
    page;
  async function close() {
    if (page)
      await page
        .getByRole('button', { name: 'Close window' })
        .click()
        .catch(() => {});
    await app.close();
  }
  let restarted = false,
    originalPrompts = [];
  try {
    page = await app.firstWindow();
    await page.getByText('ComfyUI Connected', { exact: true }).waitFor({ timeout: 30000 });
    let state = await page.evaluate(() => window.oyama.load());
    let parent = state.jobs.find((job) => job.batch && job.snapshot.seed === '32007');
    if (!parent) {
      if (reuse) throw new Error('No complete long Ripple batch to reopen.');
      const queue = await fetch(state.settings.comfyUrl + '/queue').then((response) =>
        response.json(),
      );
      if (queue.queue_running.length || queue.queue_pending.length)
        throw new Error('ComfyUI has unrelated work; no batch submitted.');
      if (
        state.jobs.some((job) =>
          ['preparing', 'submitting', 'queued', 'running', 'recovering', 'unknown'].includes(
            job.status,
          ),
        )
      )
        throw new Error('Reconcile existing app jobs before a new batch.');
      const frame = state.assets.find(
        (asset) =>
          asset.id ===
          state.jobs.find((job) => job.moduleId === 'zimage' && job.status === 'complete')
            ?.assetIds[0],
      );
      const sourceId = state.jobs.find(
        (job) =>
          job.moduleId === 'continue' &&
          job.status === 'complete' &&
          Number(job.snapshot.retainedSourceFrames) >= 49,
      )?.assetIds[0];
      if (!frame || !sourceId)
        throw new Error('Need managed real image and generated source video.');
      const probe = await page.evaluate((id) => window.oyama.probeAsset(id), sourceId);
      if ((probe.video?.duration ?? 0) < 2.5) throw new Error('Source needs 2.5 seconds.');
      await page.evaluate(
        async ({ frame, sourceId }) => {
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
            projectId: frame.projectId,
            moduleId: 'ripple',
            values: {
              mode: 'long',
              sourceVideo: sourceId,
              replacementFrame: frame.id,
              prompt:
                'Maintain the glass cube, locked camera and studio composition. Propagate the edited first frame consistently.',
              width: 512,
              height: 288,
              resolutionLock: { width: 16, height: 9 },
              longDuration: 2.5,
              chunkSeconds: 2,
              overlapSeconds: 0.5,
              blendOverlap: true,
              seed: '32007',
            },
          });
        },
        { frame, sourceId },
      );
      await page.reload();
      await page.getByText('ComfyUI Connected', { exact: true }).waitFor();
      await page.getByLabel('Tool mode').selectOption({ label: 'LTX Ripple \u00b7 Video Edit' });
      await page.screenshot({ path: 'artifacts/ripple-long-controls-1440.png' });
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(1100, 760),
      );
      await page.screenshot({ path: 'artifacts/ripple-long-controls-1100.png' });
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(1440, 900),
      );
      await page.getByRole('button', { name: 'GENERATE VIDEO', exact: true }).click();
      await page.waitForFunction(async () =>
        (await window.oyama.load()).jobs.some((job) => job.batch && job.snapshot.seed === '32007'),
      );
      state = await page.evaluate(() => window.oyama.load());
      parent = state.jobs.find((job) => job.batch && job.snapshot.seed === '32007');
    }
    if (
      process.argv.includes('--resume-stopped') &&
      ['error', 'cancelled'].includes(parent.status)
    ) {
      originalPrompts = state.jobs
        .filter(
          (job) =>
            job.snapshot.batchParentId === parent.id && job.snapshot.batchSuperseded !== true,
        )
        .sort((a, b) => a.snapshot.batchChunkIndex - b.snapshot.batchChunkIndex)
        .map((job) => {
          if (job.status !== 'complete' || !job.promptId)
            throw new Error('Assembly recovery requires all original chunks completed.');
          return job.promptId;
        });
      await page.evaluate((id) => window.oyama.resumeBatchJob(id), parent.id);
    }
    if (reuse && parent.status !== 'complete')
      throw new Error('Expected an already completed batch; inspect existing jobs first.');
    let last = '';
    for (const deadline = Date.now() + 30 * 60 * 1000; Date.now() < deadline;) {
      state = await page.evaluate(() => window.oyama.load());
      parent = state.jobs.find((job) => job.id === parent.id);
      const children = state.jobs
        .filter(
          (job) =>
            job.snapshot.batchParentId === parent.id && job.snapshot.batchSuperseded !== true,
        )
        .sort((a, b) => a.snapshot.batchChunkIndex - b.snapshot.batchChunkIndex);
      const status = `${parent.status}:${parent.message}`;
      if (status !== last) {
        console.log(status);
        last = status;
      }
      if (
        restart &&
        !restarted &&
        children[0]?.status === 'complete' &&
        children[1]?.promptId &&
        ['queued', 'running'].includes(children[1].status)
      ) {
        originalPrompts = children.map((job) => job.promptId);
        console.log('RESTART_WITH_KNOWN_PROMPTS ' + JSON.stringify(originalPrompts));
        await close();
        app = await launch();
        page = await app.firstWindow();
        await page.getByText('ComfyUI Connected', { exact: true }).waitFor({ timeout: 30000 });
        restarted = true;
        continue;
      }
      if (parent.status === 'complete') {
        if (
          children.length !== 2 ||
          children.some((job) => job.status !== 'complete' || !job.promptId)
        )
          throw new Error('Unexpected completed batch lineage.');
        if (
          restart &&
          (!restarted ||
            JSON.stringify(originalPrompts) !== JSON.stringify(children.map((job) => job.promptId)))
        )
          throw new Error('Restart did not retain the original chunk prompts.');
        if (
          originalPrompts.length &&
          JSON.stringify(originalPrompts) !== JSON.stringify(children.map((job) => job.promptId))
        )
          throw new Error('Recovery replaced original chunk prompts.');
        const asset = state.assets.find((asset) => asset.id === parent.assetIds[0]);
        const probe = await page.evaluate((id) => window.oyama.probeAsset(id), asset.id);
        if (
          probe.video?.frames !== 60 ||
          probe.video.width !== 512 ||
          probe.video.height !== 288 ||
          !probe.audio ||
          asset.derivation?.jobId !== parent.id
        )
          throw new Error('Unexpected assembled output or lineage.');
        await page.getByLabel('Tool mode').selectOption({ label: 'LTX Ripple \u00b7 Video Edit' });
        await page.getByRole('button', { name: 'Queue', exact: true }).click();
        await page
          .locator(`[data-job-id="${parent.id}"]`)
          .getByRole('button', { name: 'View result' })
          .click();
        const playback = await page.locator('.preview video').evaluate(async (video) => {
          if (video.readyState < 2)
            await new Promise((resolve) =>
              video.addEventListener('loadeddata', resolve, { once: true }),
            );
          video.currentTime = 2.1;
          await new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }));
          return {
            time: video.currentTime,
            width: video.videoWidth,
            height: video.videoHeight,
            duration: video.duration,
          };
        });
        const diagnostics = await page.evaluate(() => window.oyama.diagnostics());
        if (packaged && !diagnostics.info['Media tools'].startsWith('Bundled'))
          throw new Error('Packaged media tools did not work without FFmpeg on PATH.');
        let bundledOperations;
        if (packaged) {
          bundledOperations = await page.evaluate(async (id) => {
            const frame = await window.oyama.extractFrame({ assetId: id, seconds: 2.1 });
            const clip = await window.oyama.clipVideo({ assetId: id, start: 0.5, end: 2 });
            return { frame, clip, probe: await window.oyama.probeAsset(clip.id) };
          }, asset.id);
          if (
            bundledOperations.frame.derivation?.operation !== 'frame' ||
            bundledOperations.clip.derivation?.operation !== 'clip' ||
            Math.abs(bundledOperations.probe.video.duration - 1.5) > 0.05 ||
            !bundledOperations.probe.audio
          )
            throw new Error('Bundled extraction/clipping failed without FFmpeg on PATH.');
        }
        await page.screenshot({ path: 'artifacts/ripple-long-result.png' });
        await fs.writeFile(
          `artifacts/ripple-long-evidence${reuse ? '-reopened' : ''}.json`,
          JSON.stringify(
            {
              parent,
              children,
              probe,
              playback,
              restarted,
              mediaTools: diagnostics.info['Media tools'],
              bundledOperations,
            },
            null,
            2,
          ),
        );
        console.log(
          JSON.stringify({
            parentId: parent.id,
            prompts: children.map((job) => job.promptId),
            probe,
            playback,
            restarted,
            mediaTools: diagnostics.info['Media tools'],
          }),
        );
        return;
      }
      if (['error', 'unknown', 'cancelled'].includes(parent.status))
        throw new Error(parent.message);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error('Timed out; reconcile the existing chunk prompts before retrying.');
  } finally {
    await close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
