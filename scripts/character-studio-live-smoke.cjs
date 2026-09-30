// App-owned ZImage master -> H3 turntable -> five exact global frames. Reuses persisted jobs on rerun.
const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const env = { ...process.env, OYAMA_MOCK: '0', OYAMA_TEST: '1', OYAMA_DATA_DIR: path.resolve('artifacts/live-character-studio') };
delete env.ELECTRON_RUN_AS_NODE;

async function awaitJob(page, id) {
  const deadline = Date.now() + 25 * 60 * 1000;
  let prior = '';
  while (Date.now() < deadline) {
    const job = (await page.evaluate(() => window.oyama.load())).jobs.find((item) => item.id === id);
    if (!job) throw new Error(`Job ${id} disappeared.`);
    if (`${job.status}:${job.message}` !== prior) {
      prior = `${job.status}:${job.message}`;
      console.log(`${id} ${prior} prompt=${job.promptId || 'pending'}`);
    }
    if (job.status === 'complete') return job;
    if (['error', 'unknown', 'cancelled'].includes(job.status)) throw new Error(`${job.id}: ${job.message}`);
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error(`Job ${id} still running. Inspect its persisted prompt before retrying.`);
}

async function main() {
  const launch = () => electron.launch({ args: ['.'], env });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByText('ComfyUI Connected', { exact: true }).waitFor({ timeout: 30000 });
    const state = await page.evaluate(() => window.oyama.load());
    const queue = await fetch(state.settings.comfyUrl + '/queue').then((response) => response.json());
    if (queue.queue_running.length || queue.queue_pending.length) throw new Error('ComfyUI queue is busy.');
    const projectId = state.projects[0].id;
    let record = state.records.find((item) => item.kind === 'character' && item.name === 'Live Character Studio Mara');
    if (!record) record = await page.evaluate((id) => window.oyama.saveRecord({ id, kind: 'character', name: 'Live Character Studio Mara', description: 'Copper hair, green jacket, dark boots', identityNotes: 'Freckled face, square jaw, athletic build', assetIds: [] }), randomUUID());
    let masterJob = state.jobs.find((job) => job.moduleId === 'zimage' && job.snapshot.prompt?.includes('Live Character Studio Mara'));
    if (!masterJob) masterJob = await page.evaluate((projectId) => window.oyama.generate({ projectId, moduleId: 'zimage', values: { prompt: 'Full-body master reference of Live Character Studio Mara. Copper hair, green jacket, dark boots, freckled face, square jaw, athletic build. One person, centered, neutral stance, studio light, seamless backdrop.', variant: 'turbo', width: 256, height: 384, steps: 8, cfg: 1, seed: '32032' } }), projectId);
    masterJob = await awaitJob(page, masterJob.id);
    if (!record.masterAssetId) {
      const master = await page.evaluate(async ({ jobId, recordId }) => {
        const state = await window.oyama.load();
        const job = state.jobs.find((item) => item.id === jobId);
        const global = await window.oyama.promoteAsset(job.assetIds[0]);
        const record = state.records.find((item) => item.id === recordId);
        await window.oyama.saveRecord({ ...record, assetIds: [...new Set([...record.assetIds, global.id])], masterAssetId: global.id, approvedAssetIds: [global.id] });
        return global;
      }, { jobId: masterJob.id, recordId: record.id });
      record.masterAssetId = master.id;
    }
    let turntableJob = (await page.evaluate(() => window.oyama.load())).jobs.find((job) => job.moduleId === 'h3' && job.snapshot.prompt?.includes('Live Character Studio Mara'));
    if (!turntableJob) turntableJob = await page.evaluate(({ projectId, masterId }) => window.oyama.generate({ projectId, moduleId: 'h3', values: { prompt: 'Live Character Studio Mara rotates slowly in place, full body, green jacket and dark boots, locked studio camera, consistent face and outfit, quiet room ambience.', mode: 'image', modeExplicit: true, firstFrame: masterId, width: 256, height: 256, duration: 1, quality: 'turbo8', seed: '32033' } }), { projectId, masterId: record.masterAssetId });
    turntableJob = await awaitJob(page, turntableJob.id);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByText('ComfyUI Connected', { exact: true }).waitFor({ timeout: 30000 });
    const result = await page.evaluate(async ({ recordId, jobId }) => {
      const state = await window.oyama.load();
      const job = state.jobs.find((item) => item.id === jobId);
      const video = await window.oyama.promoteAsset(job.assetIds[0]);
      const media = await window.oyama.probeAsset(video.id);
      const frames = media.video?.frames;
      const fps = media.video?.fps;
      if (!frames || frames < 5 || !fps) throw new Error('Turntable output has no reliable frame grid.');
      const samples = ['Front', 'Front three-quarter', 'Profile', 'Back three-quarter', 'Back'].map((label, index) => {
        const frame = Math.round(index * (frames - 1) / 4);
        return { label, frame, seconds: frame / fps };
      });
      const angles = [];
      for (const sample of samples) angles.push(await window.oyama.extractFrame({ assetId: video.id, seconds: sample.seconds, frame: sample.frame }));
      const record = state.records.find((item) => item.id === recordId);
      const updated = await window.oyama.saveRecord({ ...record, assetIds: [...new Set([...record.assetIds, video.id, ...angles.map((item) => item.id)])], turntableAssetId: video.id, angleSamples: samples.map((sample, index) => ({ ...sample, assetId: angles[index].id })), approvedAssetIds: [record.masterAssetId] });
      return { record: updated, video, media, angles, job };
    }, { recordId: record.id, jobId: turntableJob.id });
    await fs.writeFile('artifacts/character-studio-live-evidence.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ master: result.record.masterAssetId, turntable: result.video.id, duration: result.media.duration, frames: result.media.video.frames, angles: result.record.angleSamples.map((item) => item.frame) }));
  } finally {
    await app.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
