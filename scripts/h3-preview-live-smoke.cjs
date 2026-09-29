// App-driven checks. Reuses saved prompt IDs after interruption; never retries an uncertain render.
const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const route = process.argv.find((arg) => arg.startsWith('--route='))?.split('=')[1] || 'h3-text';
  if (
    ![
      'h3-text',
      'h3-image',
      'h3-reference',
      'continue-last',
      'continue-selected',
      'continue-motion',
    ].includes(route)
  )
    throw new Error('Unknown smoke route.');
  const native = process.argv.includes('--native');
  const customSteps = Number(
    process.argv.find((arg) => arg.startsWith('--steps='))?.split('=')[1] || 0,
  );
  const routed = process.argv.includes('--routed');
  const previewFrames = Number(
    process.argv.find((arg) => arg.startsWith('--preview-frames='))?.split('=')[1] || 0,
  );
  const previewFps = Number(
    process.argv.find((arg) => arg.startsWith('--preview-fps='))?.split('=')[1] || 0,
  );
  const customPreview = previewFrames > 0 || previewFps > 0;
  if (
    customPreview &&
    (!Number.isInteger(previewFrames) ||
      previewFrames < 1 ||
      previewFrames > 32 ||
      !Number.isInteger(previewFps) ||
      previewFps < 1 ||
      previewFps > 60)
  )
    throw new Error('Both preview frames (1–32) and FPS (1–60) are required.');
  if (customSteps && (!Number.isInteger(customSteps) || customSteps < 1 || customSteps > 100))
    throw new Error('Invalid custom steps');
  const maximum = process.argv.includes('--maximum-identity');
  const explicitText = process.argv.includes('--explicit-text-with-references');
  const checkpoint = process.argv.includes('--save-checkpoint');
  const latent = process.argv.includes('--latent-context');
  const jobScopedContext = process.argv.includes('--job-scoped-context');
  if (jobScopedContext && !latent)
    throw new Error('Job-scoped context verification needs latent continuation.');
  const autoLatent = process.argv.includes('--auto-latent');
  if (autoLatent && !latent) throw new Error('Auto latent check requires latent context.');
  const chain = process.argv.includes('--chain');
  if (latent && route !== 'continue-motion')
    throw new Error('Latent context requires motion continuation.');
  if (chain && !latent) throw new Error('Chain requires latent context.');
  if (explicitText && route !== 'h3-text')
    throw new Error('Explicit text check requires Text to Video.');
  if (maximum && route !== 'h3-reference') throw new Error('Maximum identity is a Ref2VA option.');
  const quality = native ? 'native' : 'turbo8';
  const seed = customPreview
    ? String(40000 + previewFrames * 100 + previewFps)
    : customSteps
      ? String(31000 + customSteps)
      : autoLatent
        ? '24689'
        : chain
          ? '24688'
          : latent
            ? native
              ? '24687'
              : '24686'
            : checkpoint
              ? '24685'
              : explicitText
                ? '24684'
                : native
                  ? '24682'
                  : '24681';
  const evidenceName =
    route +
    (native ? '-native' : '') +
    (maximum ? '-max' : '') +
    (explicitText ? '-explicit' : '') +
    (checkpoint ? '-checkpoint' : '') +
    (latent ? '-latent' : '') +
    (chain ? '-chain' : '') +
    (autoLatent ? '-auto' : '') +
    (jobScopedContext ? '-staged' : '') +
    (customSteps ? `-steps${customSteps}` : '') +
    (customPreview ? `-preview${previewFrames}x${previewFps}` : '') +
    (routed ? '-routed' : '');
  const reuse = process.argv.includes('--reuse-complete');
  const packaged = process.argv.includes('--packaged');
  const matches = (job) =>
    (!jobScopedContext ||
      job.snapshot.contextUploadPath === `CreateSpaceContext/${job.id}.safetensors`) &&
    job.snapshot.seed === seed &&
    (!customPreview ||
      (job.snapshot.previewFrames === previewFrames && job.snapshot.previewFps === previewFps)) &&
    job.snapshot.quality === quality &&
    job.snapshot.width === 512 &&
    job.snapshot.height === 288 &&
    (route.startsWith('continue')
      ? job.moduleId === 'continue' &&
        job.snapshot.method === route.split('-')[1] &&
        (route !== 'continue-motion' ||
          job.snapshot.contextMethod === (latent ? 'latent' : 'frames'))
      : job.moduleId === 'h3' &&
        job.snapshot.mode === route.split('-')[1] &&
        (job.snapshot.refImageSize || 'match') === (maximum ? 'max' : 'match'));
  const env = {
    ...process.env,
    OYAMA_MOCK: '0',
    OYAMA_TEST: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/live-zimage-app'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  if (packaged) env.PATH = process.env.SystemRoot + '\\System32';
  const app = await electron.launch({
    ...(packaged
      ? { executablePath: path.resolve('release/win-unpacked/OYAMA CreateSpace.exe'), args: [] }
      : { args: ['.'] }),
    env,
  });
  let page;
  try {
    page = await app.firstWindow();
    await page.getByText('ComfyUI Connected', { exact: true }).waitFor({ timeout: 30000 });
    if (customPreview)
      await page.evaluate(
        async ({ frames, fps }) => {
          const state = await window.oyama.load();
          await window.oyama.saveSettings({
            ...state.settings,
            livePreview: { frames, fps },
          });
        },
        { frames: previewFrames, fps: previewFps },
      );
    if (routed)
      await page.evaluate(async () => {
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
      });
    await page.evaluate(() => {
      window.previewEvidence = { count: 0, decoded: 0 };
      window.oyama.onEvent((event) => {
        if (event.type === 'job' && event.job.preview) {
          const ev = window.previewEvidence;
          ev.count++;
          ev.jobId = event.job.id;
          ev.mime = event.job.preview.slice(5, event.job.preview.indexOf(';'));
        }
      });
    });
    let state = await page.evaluate(() => window.oyama.load());
    let job = state.jobs.find(
      (job) =>
        matches(job) &&
        (reuse
          ? job.status === 'complete'
          : [
              'preparing',
              'submitting',
              'queued',
              'running',
              'recovering',
              'unknown',
              'complete',
            ].includes(job.status)),
    );
    let submittedHere = false;
    if (!job && reuse) throw new Error('No completed verified job.');
    if (!job) {
      const queueResponse = await fetch(`${state.settings.comfyUrl.replace(/\/$/, '')}/queue`, {
        signal: AbortSignal.timeout(20000),
      });
      if (!queueResponse.ok) throw new Error(`Queue inspection failed: ${queueResponse.status}`);
      const queue = await queueResponse.json();
      if (queue.queue_running.length || queue.queue_pending.length)
        throw new Error('The ComfyUI queue is busy; do not interrupt unrelated work.');
      if (
        state.jobs.some((job) =>
          ['preparing', 'submitting', 'queued', 'running', 'recovering', 'unknown'].includes(
            job.status,
          ),
        )
      )
        throw new Error('Resolve the existing live job before another submission.');
      const reference = state.assets.find((asset) => asset.kind === 'image' && !asset.missing);
      const source = latent
        ? state.jobs.find(
            (job) =>
              job.status === 'complete' &&
              (chain
                ? job.moduleId === 'continue' && job.snapshot.seed === '24686'
                : job.moduleId === 'h3' &&
                  job.snapshot.mode === 'text' &&
                  job.snapshot.seed === '24685') &&
              state.assets.find((asset) => asset.id === job.assetIds[0])?.generationContext
                ?.available,
          )?.assetIds[0]
        : state.jobs.find(
            (job) =>
              job.moduleId === 'ltx' && job.status === 'complete' && job.snapshot.duration === 2,
          )?.assetIds[0];
      const moduleId = route.startsWith('continue') ? 'continue' : 'h3';
      if ((route !== 'h3-text' && !reference) || (moduleId === 'continue' && !source))
        throw new Error('Need the existing managed image and two-second LTX source.');
      const draft = {
        projectId: state.projects[0].id,
        moduleId,
        values: {
          prompt:
            'The glass cube gently rotates on the dark studio plinth. Keep soft lighting, clean background and a quiet sustained ambient tone. No speech.',
          width: 512,
          height: 288,
          resolutionLock: { width: 16, height: 9 },
          duration: 1,
          quality,
          ...(customSteps ? { nativeDefaults: false, steps: customSteps } : {}),
          seed,
          livePreview: true,
          ...(moduleId === 'continue'
            ? {
                sourceVideo: source,
                method: route.split('-')[1],
                contextFrames: 22,
                contextMode: latent && !autoLatent ? 'latent' : 'auto',
                selectedSeconds: 0.5,
              }
            : {
                mode: route.split('-')[1],
                modeExplicit: true,
                refImageSize: maximum ? 'max' : 'match',
                firstFrame: route === 'h3-image' ? reference.id : null,
                references: route === 'h3-reference' || explicitText ? [reference.id] : [],
              }),
        },
      };
      await page.evaluate((draft) => window.oyama.saveDraft(draft), draft);
      await page.reload();
      await page.getByText('ComfyUI Connected', { exact: true }).waitFor({ timeout: 30000 });
      await page.evaluate(() => {
        window.previewEvidence = { count: 0 };
        window.oyama.onEvent((event) => {
          if (event.type === 'job' && event.job.preview) {
            window.previewEvidence.count++;
            window.previewEvidence.jobId = event.job.id;
            window.previewEvidence.mime = event.job.preview.slice(
              5,
              event.job.preview.indexOf(';'),
            );
          }
        });
      });
      const label =
        moduleId === 'continue'
          ? 'Continue / Extend'
          : route === 'h3-text'
            ? 'H3 · Text to Video'
            : route === 'h3-image'
              ? 'H3 · Image to Video'
              : 'H3 · Ref2VA';
      await page.getByLabel('Tool mode').selectOption({ label });
      await page
        .getByRole('button', {
          name: moduleId === 'continue' ? 'CONTINUE VIDEO' : 'GENERATE',
          exact: true,
        })
        .click();
      const prior = state.jobs.map((job) => job.id);
      job = await page.evaluate(async (prior) => {
        for (let i = 0; i < 100; i++) {
          const state = await window.oyama.load();
          const job = state.jobs.find((job) => !prior.includes(job.id));
          if (job) return job;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error('No job created');
      }, prior);
      submittedHere = true;
    }
    console.log(`APP_JOB ${route} ${job.id}`);
    let last = '';
    let captured = false;
    const deadline = Date.now() + 30 * 60 * 1000;
    while (Date.now() < deadline) {
      state = await page.evaluate(() => window.oyama.load());
      job = state.jobs.find((item) => item.id === job.id);
      if (!job) throw new Error('Saved job missing');
      const status = `${job.status}:${job.message}`;
      if (last !== status) {
        last = status;
        console.log(status);
      }
      if (!captured && (await page.locator('.live-preview').count())) {
        const decoded = await page
          .locator('.live-preview')
          .evaluate((media) =>
            media.tagName === 'VIDEO'
              ? media.readyState >= 2 && media.videoWidth > 0
              : media.complete && media.naturalWidth > 0,
          );
        if (decoded) {
          await page.screenshot({ path: `artifacts/${evidenceName}-preview-1440.png` });
          await app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].setSize(1100, 760),
          );
          await page.screenshot({ path: `artifacts/${evidenceName}-preview-1100.png` });
          await app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].setSize(1440, 900),
          );
          captured = true;
        }
      }
      if (job.status === 'complete') {
        let execution;
        if (customSteps || routed || customPreview) {
          const history = await fetch(job.endpoint + '/history/' + job.promptId).then((response) =>
            response.json(),
          );
          const graph = history[job.promptId]?.prompt?.[2];
          if (!graph || (customSteps && graph['14']?.inputs.steps !== customSteps))
            throw new Error('Server history did not use the requested custom steps.');
          if (
            customPreview &&
            (graph['7']?.inputs.preview_frames !== previewFrames ||
              graph['7']?.inputs.preview_fps !== previewFps)
          )
            throw new Error('Server history did not use the requested live preview settings.');
          if (
            jobScopedContext &&
            graph['205']?.inputs.latent_path !== `CreateSpaceContext/${job.id}.safetensors`
          )
            throw new Error('Server history did not retain the unique job checkpoint path.');
          const selectors = Object.values(graph).filter((node) =>
            /^Select(?:Model|CLIP|VAE)Device$/.test(node.class_type),
          );
          if (
            routed &&
            (selectors.length !== 4 ||
              selectors
                .filter((node) => node.class_type === 'SelectVAEDevice')
                .some((node) => node.inputs.device !== 'gpu:1'))
          )
            throw new Error('Server history did not retain the requested GPU routing.');
          execution = {
            steps: graph['14']?.inputs.steps,
            selectors,
            placements: job.snapshot.routingPlacements,
          };
        }
        const evidence = await page.evaluate(() => window.previewEvidence);
        if (submittedHere && (!evidence.count || !captured))
          throw new Error('No decoded live sampling preview was observed.');
        await page.getByRole('button', { name: 'Queue', exact: true }).click();
        await page
          .locator(`[data-job-id="${job.id}"]`)
          .getByRole('button', { name: 'View result' })
          .click();
        if (route.startsWith('continue'))
          await page.getByRole('button', { name: 'Result', exact: true }).click();
        const asset = state.assets.find((asset) => asset.id === job.assetIds[0]);
        const probe = await page.evaluate((id) => window.oyama.probeAsset(id), asset.id);
        const expected =
          route === 'continue-motion'
            ? Number(job.snapshot.retainedSourceFrames) + 17
            : route === 'continue-selected'
              ? 35
              : route === 'continue-last'
                ? 71
                : 39;
        if (
          probe.video?.frames !== expected ||
          probe.video?.width !== 512 ||
          probe.video?.height !== 288 ||
          !probe.audio
        )
          throw new Error(`Unexpected media: ${JSON.stringify(probe)}`);
        if (latent && job.snapshot.contextMethod !== 'latent')
          throw new Error('Expected actual trailing latent reuse.');
        if ((latent || checkpoint) && !asset.generationContext?.available)
          throw new Error('Managed latent checkpoint missing.');
        const seekTime = route.startsWith('continue')
          ? Number(job.snapshot.retainedSourceFrames) / 24 + 0.25
          : 0.8;
        const playback = await page.locator('.preview video').evaluate(async (video, seekTime) => {
          if (video.readyState < 2)
            await new Promise((resolve, reject) => {
              video.addEventListener('loadeddata', resolve, { once: true });
              video.addEventListener('error', () => reject(new Error('Decode failed')), {
                once: true,
              });
            });
          video.currentTime = Math.min(seekTime, video.duration - 0.1);
          await new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }));
          return {
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
            time: video.currentTime,
          };
        }, seekTime);
        await page.screenshot({ path: `artifacts/${evidenceName}-result.png` });
        if (route === 'continue-motion' || customSteps) {
          await page.getByRole('button', { name: 'Properties', exact: true }).click();
          if (customSteps && route.startsWith('h3'))
            await page.getByLabel('H3 sampling steps').scrollIntoViewIfNeeded();
          await page.screenshot({ path: `artifacts/${evidenceName}-controls-1440.png` });
          await app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].setSize(1100, 760),
          );
          await page.screenshot({ path: `artifacts/${evidenceName}-controls-1100.png` });
          await app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].setSize(1440, 900),
          );
        }
        await fs.writeFile(
          `artifacts/${evidenceName}-evidence${reuse ? '-reopened' : ''}.json`,
          JSON.stringify({ job, probe, playback, preview: evidence, execution }, null, 2),
        );
        console.log(
          JSON.stringify({ route, promptId: job.promptId, probe, playback, preview: evidence }),
        );
        return;
      }
      if (['error', 'unknown', 'cancelled'].includes(job.status)) throw new Error(job.message);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error('Timeout; reconcile the saved prompt ID before retrying.');
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
