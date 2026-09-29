import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';

test('Ripple extracts a source frame, Photo Edit inherits canvas and returns actual result', async () => {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_MOCK: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/e2e', `photo-${Date.now()}`),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill('A quiet sample scene.');
    await page.getByRole('button', { name: 'GENERATE', exact: true }).click();
    await expect(page.locator('.job-state.complete')).toBeVisible({ timeout: 15000 });
    const source = await page.evaluate(
      async () => (await window.oyama.load()).assets.find((asset) => asset.kind === 'video')!.id,
    );
    await page
      .locator('.navitem')
      .filter({ hasText: /^LTX Ripple/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Properties' }).click();
    await page.getByLabel('Ripple width').fill('512');
    await page.getByLabel('Ripple height').fill('320');
    await page.getByLabel('Ripple duration').focus();
    await page.getByLabel('Ripple duration').press('Home');
    await page.getByLabel('Ripple source In frame').fill('24');
    await page.getByRole('button', { name: 'Inputs', exact: true }).click();
    await page.getByLabel('Ripple source video').selectOption(source);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await expect.poll(() => page.locator('.preview video').evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0.9);
    await page.getByRole('button', { name: 'Edit first frame with FireRed' }).click();
    await expect(page.getByLabel('Photo Edit width')).toHaveValue('512');
    const extracted = await page.evaluate(async () => {
      const assets = (await window.oyama.load()).assets;
      const video = assets.find((item) => item.kind === 'video');
      return assets.find(
        (asset) => asset.derivation?.operation === 'frame' && asset.parentAssetId === video?.id,
      );
    });
    expect(extracted?.derivation?.start).toBe(1);
    await expect(page.getByLabel('Photo Edit height')).toHaveValue('320');
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await expect(page.locator('.preview img')).toBeVisible();
    await page.getByRole('textbox', { name: 'Photo Edit prompt' }).fill('Change the cube to blue.');
    await page.getByLabel('Photo Edit profile').selectOption('quality');
    await page.getByRole('button', { name: 'Inputs', exact: true }).click();
    await expect(page.getByLabel('Photo Edit source')).not.toHaveValue('');
    await page.getByRole('button', { name: 'GENERATE IMAGE' }).click();
    await expect(page.locator('.job-state.complete')).toHaveCount(2, { timeout: 15000 });
    const dimensions = await page
      .locator('.preview img')
      .evaluate(async (element: HTMLImageElement) => {
        await element.decode();
        return { width: element.naturalWidth, height: element.naturalHeight };
      });
    await page.getByRole('button', { name: 'Use as Ripple replacement' }).click();
    await expect(page.getByLabel('Ripple source video')).toHaveValue(source);
    await expect(page.getByLabel('Ripple replacement frame')).not.toHaveValue('');
    await expect(page.getByLabel('Ripple width')).toHaveValue(String(dimensions.width));
    await expect(page.getByLabel('Ripple height')).toHaveValue(String(dimensions.height));
    await expect(page.getByLabel('Ripple duration')).toHaveValue('2');
    const state = await page.evaluate(() => window.oyama.load());
    const photo = state.jobs.find((job) => job.moduleId === 'photo-edit')!;
    const replacement = state.assets.find((asset) => asset.id === photo.assetIds[0])!;
    expect(replacement.dimensions).toEqual(dimensions);
    await page.getByRole('button', { name: 'Close window' }).click();
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page
      .locator('.navitem')
      .filter({ hasText: /^Photo Edit/ })
      .first()
      .click();
    await expect(page.getByLabel('Photo Edit profile')).toHaveValue('quality');
    await expect(page.getByRole('textbox', { name: 'Photo Edit prompt' })).toHaveValue(
      'Change the cube to blue.',
    );
    await expect(page.locator('.preview img')).toBeVisible();
    expect(errors).toEqual([]);
    await page.getByRole('button', { name: 'Close window' }).click();
  } finally {
    await app.close();
  }
});
