import { _electron as electron, expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

test('Movie fits a portrait video to the preview height at both viewport sizes', async () => {
  const dataDir = path.resolve('artifacts/e2e', `movie-portrait-${Date.now()}`);
  const videoPath = path.join(dataDir, 'portrait.mp4');
  await fs.mkdir(dataDir, { recursive: true });
  execFileSync(
    path.resolve('.generated/media-tools/win-x64/ffmpeg.exe'),
    [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=180x320:rate=24:duration=1',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      videoPath,
    ],
    { windowsHide: true },
  );
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_MOCK: '1',
    OYAMA_DATA_DIR: dataDir,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    await page.locator('.navitem').filter({ hasText: 'Movie' }).click();
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, videoPath);
    await page.getByRole('button', { name: 'Import files' }).click();
    await page.locator('.movie-media-item').click();
    const video = page.locator('.movie-preview-frame video');
    await expect(video).toBeVisible();
    await expect(page.locator('.movie-transport .movie-timecode').last()).toHaveText('00:00:01:00');
    for (const [width, height] of [
      [1440, 900],
      [1100, 760],
    ] as const) {
      await app.evaluate(
        ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size[0], size[1]),
        [width, height],
      );
      await expect
        .poll(() =>
          video.evaluate((element: HTMLVideoElement) => {
            const box = element.getBoundingClientRect();
            const frame = element.parentElement!.getBoundingClientRect();
            return {
              source: [element.videoWidth, element.videoHeight],
              ratioError: Math.abs(
                box.width / box.height - element.videoWidth / element.videoHeight,
              ),
              heightError: Math.abs(box.height - frame.height),
              fitsWidth: box.width <= frame.width + 1,
            };
          }),
        )
        .toMatchObject({ source: [180, 320], fitsWidth: true });
      const fit = await video.evaluate((element: HTMLVideoElement) => {
        const box = element.getBoundingClientRect();
        const frame = element.parentElement!.getBoundingClientRect();
        return {
          ratioError: Math.abs(box.width / box.height - 180 / 320),
          heightError: Math.abs(box.height - frame.height),
        };
      });
      expect(fit.ratioError).toBeLessThan(0.02);
      expect(fit.heightError).toBeLessThan(2);
      await page.screenshot({ path: `artifacts/movie-portrait-${width}.png` });
    }
  } finally {
    await app.close();
  }
});
