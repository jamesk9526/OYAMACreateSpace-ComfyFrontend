import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';

test('managed probing, frame extraction and clipping persist without changing the source', async () => {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_MOCK: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/e2e', `media-${Date.now()}`),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill('A quiet sample scene.');
    await page.getByRole('button', { name: 'GENERATE', exact: true }).click();
    await expect(page.locator('.job-state.complete')).toBeVisible({ timeout: 15000 });
    const result = await page.evaluate(async () => {
      const before = await window.oyama.load();
      const video = before.assets.find((asset) => asset.kind === 'video')!;
      const metadata = await window.oyama.probeAsset(video.id);
      const frame = await window.oyama.extractFrame({ assetId: video.id, seconds: 1 });
      const clip = await window.oyama.clipVideo({ assetId: video.id, start: 0.5, end: 1.5 });
      const after = await window.oyama.load();
      let rejected = false;
      try {
        await window.oyama.extractFrame({ assetId: video.id, seconds: 100 });
      } catch {
        rejected = true;
      }
      return { video, metadata, frame, clip, after, rejected };
    });
    expect(result.metadata.video).toMatchObject({
      codec: 'h264',
      width: 832,
      height: 480,
      fps: 24,
    });
    expect(result.metadata.audio?.codec).toBe('aac');
    expect(result.frame).toMatchObject({ kind: 'image', projectId: result.video.projectId });
    expect(result.frame.parentAssetId).toBe(result.video.id);
    expect(result.clip).toMatchObject({
      kind: 'video',
      projectId: result.video.projectId,
      parentAssetId: result.video.id,
      derivation: { operation: 'clip', start: 0.5, end: 1.5 },
    });
    expect(result.clip.media?.audio?.codec).toBe('aac');
    expect(result.clip.media?.duration).toBeGreaterThan(0.9);
    expect(result.clip.media?.duration).toBeLessThan(1.1);
    expect(result.after.assets.some((asset) => asset.id === result.video.id)).toBe(true);
    expect(result.after.assets.some((asset) => asset.id === result.frame.id)).toBe(true);
    expect(result.after.assets.some((asset) => asset.id === result.clip.id)).toBe(true);
    expect(result.rejected).toBe(true);
    await page
      .locator('.navitem')
      .filter({ hasText: /^Assets$/ })
      .click();
    await page
      .locator('.asset-card')
      .filter({ has: page.locator('strong').filter({ hasText: /^Mock-H3-preview\.mp4$/ }) })
      .click();
    await expect(page.getByRole('button', { name: 'Save current frame' })).toBeVisible();
    await page.screenshot({ path: 'artifacts/media-tools-1440.png' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760));
    await page.screenshot({ path: 'artifacts/media-tools-1100.png' });
    await page.getByLabel('Clip start').fill('0.25');
    await page.getByLabel('Clip end').fill('0.75');
    await page.getByRole('button', { name: 'Create clip' }).click();
    await expect(page.locator('.asset-detail strong')).toContainText('clip-0.250-0.750');
    await page.getByRole('button', { name: 'Close window' }).click();
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    const restarted = await (await app.firstWindow()).evaluate(() => window.oyama.load());
    expect(restarted.assets.find((asset) => asset.id === result.frame.id)?.parentAssetId).toBe(
      result.video.id,
    );
    expect(
      restarted.assets.find((asset) => asset.id === result.clip.id)?.media?.duration,
    ).toBeGreaterThan(0.9);
    expect(restarted.assets.find((asset) => asset.id === result.video.id)?.media?.duration).toBe(3);
    await (await app.firstWindow()).getByRole('button', { name: 'Close window' }).click();
  } finally {
    await app.close();
  }
});
