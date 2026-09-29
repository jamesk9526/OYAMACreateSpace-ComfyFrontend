import { _electron as electron, expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

test.skip(!process.env.OYAMA_LIVE, 'Runs only for an explicitly requested live workflow check.');
test.setTimeout(15 * 60 * 1000);
test('real Continue blend renders managed media and reopens after restart', async () => {
  const dataDir = path.resolve('artifacts/e2e', `live-continue-blend-${Date.now()}`);
  const sourcePath = path.join(dataDir, 'source.mp4');
  await fs.mkdir(dataDir, { recursive: true });
  execFileSync(
    path.resolve('.generated/media-tools/win-x64/ffmpeg.exe'),
    [
      '-nostdin',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=256x256:r=24:d=2',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000:duration=2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      '-y',
      sourcePath,
    ],
    { windowsHide: true },
  );
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_DATA_DIR: dataDir,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.OYAMA_MOCK;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await expect(page.getByText('ComfyUI Connected', { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, sourcePath);
    await page.evaluate(async () => {
      const bootstrap = await window.oyama.load();
      const readiness = await window.oyama.checkConnection();
      const queue = readiness.queue;
      if (!readiness.connected || (queue && queue.running + queue.pending > 0))
        throw new Error('ComfyUI is unavailable or busy.');
      const [asset] = await window.oyama.importMedia({ projectId: bootstrap.projects[0].id });
      if (!asset) throw new Error('Source import failed.');
      await window.oyama.handoffAsset({
        assetId: asset.id,
        projectId: bootstrap.projects[0].id,
        targetModuleId: 'continue',
        targetField: 'sourceVideo',
      });
    });
    await page.reload();
    await expect(page.getByText('ComfyUI Connected', { exact: true })).toBeVisible();
    await page.getByLabel('Tool mode').selectOption({ label: 'Continue / Extend' });
    await page.getByLabel('Continue width').fill('256');
    await page.getByLabel('Continue height').fill('256');
    await page.getByLabel('Continue duration').focus();
    await page.getByLabel('Continue duration').press('Home');
    await page.getByLabel('Continue blend frames').fill('6');
    await page
      .getByRole('textbox', { name: /next action/i })
      .fill('A still blue square slowly changes into a textured blue wall. No dialogue.');
    await page.getByRole('button', { name: 'CONTINUE VIDEO' }).click();
    await expect
      .poll(
        async () =>
          page.evaluate(
            async () =>
              (await window.oyama.load()).jobs.find((job) => job.moduleId === 'continue')?.status,
          ),
        { timeout: 12 * 60 * 1000, intervals: [3000] },
      )
      .toBe('complete');
    const result = await page.evaluate(async () => {
      const snapshot = await window.oyama.load();
      const job = snapshot.jobs.find(
        (item) => item.moduleId === 'continue' && item.status === 'complete',
      );
      const joined = snapshot.assets.find((asset) => asset.id === job?.assetIds[0]);
      return { job, joined };
    });
    expect(result.job?.snapshot.blendFrames).toBe(6);
    expect(result.joined?.media?.video?.frames).toBe(64);
    expect(result.joined?.media?.audio).not.toBeNull();
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    const reopened = await page.evaluate(
      async (id) => (await window.oyama.load()).assets.find((asset) => asset.id === id),
      result.joined!.id,
    );
    expect(reopened?.media?.video?.frames).toBe(64);
    expect(reopened?.media?.audio).not.toBeNull();
  } finally {
    await app.close();
  }
});
