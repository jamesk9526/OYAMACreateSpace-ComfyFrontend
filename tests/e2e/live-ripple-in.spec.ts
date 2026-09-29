import { _electron as electron, expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

test.skip(!process.env.OYAMA_LIVE, 'Runs only for an explicitly requested live workflow check.');
test.setTimeout(15 * 60 * 1000);
test('real Ripple uses a nonzero source In frame', async () => {
  const dataDir = path.resolve('artifacts/e2e', `live-ripple-in-${Date.now()}`);
  await fs.mkdir(dataDir, { recursive: true });
  const video = path.join(dataDir, 'ripple-source.mp4');
  const image = path.join(dataDir, 'ripple-replacement.png');
  const ffmpeg = path.resolve('.generated/media-tools/win-x64/ffmpeg.exe');
  execFileSync(
    ffmpeg,
    [
      '-nostdin',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=256x256:r=24:d=4',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000:duration=4',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      '-y',
      video,
    ],
    { windowsHide: true },
  );
  execFileSync(
    ffmpeg,
    [
      '-nostdin',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=256x256',
      '-frames:v',
      '1',
      '-y',
      image,
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
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByText('ComfyUI Connected', { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await app.evaluate(
      ({ dialog }, files) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
      },
      [video, image],
    );
    const imported = await page.evaluate(async () => {
      const snapshot = await window.oyama.load();
      const readiness = await window.oyama.checkConnection();
      if (
        !readiness.connected ||
        (readiness.queue && readiness.queue.running + readiness.queue.pending > 0)
      )
        throw new Error('ComfyUI is unavailable or busy.');
      return window.oyama.importMedia({ projectId: snapshot.projects[0].id });
    });
    await page.reload();
    await expect(page.getByText('ComfyUI Connected', { exact: true })).toBeVisible();
    await page.getByLabel('Tool mode').selectOption({ label: 'LTX Ripple · Video Edit' });
    await page.getByLabel('Ripple width').fill('256');
    await page.getByLabel('Ripple height').fill('256');
    await page.getByLabel('Ripple duration').focus();
    await page.getByLabel('Ripple duration').press('Home');
    await page.getByLabel('Ripple source In frame').fill('24');
    await page.getByRole('button', { name: 'Inputs', exact: true }).click();
    await page
      .getByLabel('Ripple source video')
      .selectOption(imported.find((asset) => asset.kind === 'video')!.id);
    await page
      .getByLabel('Ripple replacement frame')
      .selectOption(imported.find((asset) => asset.kind === 'image')!.id);
    await expect(page.getByRole('button', { name: 'GENERATE VIDEO' })).toBeEnabled({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'GENERATE VIDEO' }).click();
    await expect
      .poll(
        async () =>
          page.evaluate(
            async () =>
              (await window.oyama.load()).jobs.find((job) => job.moduleId === 'ripple')?.status,
          ),
        { timeout: 12 * 60 * 1000, intervals: [3000] },
      )
      .toBe('complete');
    const output = await page.evaluate(async () => {
      const snapshot = await window.oyama.load();
      const job = snapshot.jobs.find(
        (item) => item.moduleId === 'ripple' && item.status === 'complete',
      );
      return {
        job,
        asset: job?.assetIds[0] ? await window.oyama.probeAsset(job.assetIds[0]) : undefined,
      };
    });
    expect(output.job?.snapshot.sourceInFrame).toBe(24);
    expect(output.asset?.video?.frames).toBe(49);
    expect(output.asset?.audio).not.toBeNull();
  } finally {
    await app.close();
  }
});
