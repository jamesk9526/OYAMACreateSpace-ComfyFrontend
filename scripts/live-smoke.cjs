// Explicit live integration check: queues one small local H3 render per run.
const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
async function main() {
  const env = {
    ...process.env,
    OYAMA_MOCK: '0',
    OYAMA_TEST: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/live-app'),
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
    await page.getByRole('textbox', { name: 'Prompt', exact: true }).waitFor();
    const result = await page.evaluate(async () => {
      const api = window.oyama;
      const ready = await api.checkConnection();
      if (!ready.connected) throw new Error(ready.message);
      const state = await api.load();
      // Resume an unfinished test after interruption; do not queue another render.
      const existing = state.jobs.find((j) =>
        ['preparing', 'submitting', 'queued', 'running', 'recovering', 'unknown'].includes(
          j.status,
        ),
      );
      if (existing) return existing;
      return api.generate({
        projectId: state.projects[0].id,
        moduleId: 'h3',
        values: {
          prompt:
            'A lime green cube on a dark studio table slowly rotates. Soft light. Quiet room ambience.',
          width: 256,
          height: 256,
          duration: 1,
          quality: 'turbo8',
          seed: '314159',
        },
      });
    });
    console.log(`APP_JOB ${result.id}`);
    const deadline = Date.now() + 20 * 60 * 1000;
    let last = '';
    while (Date.now() < deadline) {
      const state = await page.evaluate(() => window.oyama.load());
      const job = state.jobs.find((j) => j.id === result.id);
      if (job && `${job.status}:${job.message}` !== last) {
        last = `${job.status}:${job.message}`;
        console.log(last);
      }
      if (job?.status === 'complete') {
        await page.locator('.preview video').waitFor();
        const playback = await page.locator('.preview video').evaluate(async (video) => {
          await video.play();
          video.currentTime = 0.5;
          return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
        });
        await page.screenshot({ path: 'artifacts/live-app-result.png' });
        await fs.writeFile(
          'artifacts/live-app-result.json',
          JSON.stringify({ job, playback, assets: state.assets }, null, 2),
        );
        console.log(JSON.stringify(playback));
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
