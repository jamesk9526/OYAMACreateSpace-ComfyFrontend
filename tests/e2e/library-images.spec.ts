import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';

test('location and Assets generate in place with managed image and video previews', async () => {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_MOCK: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/e2e', `library-images-${Date.now()}`),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByText('Mock ComfyUI', { exact: true }).waitFor();
    await page.locator('.navitem').filter({ hasText: 'Locations' }).click();
    await page.getByRole('button', { name: 'New location' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Glass atrium');
    await page.getByLabel('Environment').fill('Stone arches and glass ceiling');
    await page.getByRole('button', { name: 'Generate location image' }).click();
    await expect(page.getByLabel('Image prompt')).toContainText('Stone arches');
    await page.getByRole('button', { name: 'Generate image', exact: true }).click();
    await expect(page.getByText('Image ready for review')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Use image' }).click();
    await page.getByRole('button', { name: 'Save location' }).click();
    const state = await page.evaluate(() => window.oyama.load());
    const location = state.records.find((record) => record.name === 'Glass atrium')!;
    const imageJob = state.jobs.find(
      (job) =>
        job.libraryImageTarget?.kind === 'record' &&
        job.libraryImageTarget.recordId === location.id,
    )!;
    const otherProject = await page.evaluate(() => window.oyama.createProject('Other project'));
    await expect(
      page.evaluate(
        ({ projectId, recordId, assetId }) =>
          window.oyama.attachRecordImage({ projectId, recordId, assetId, purpose: 'reference' }),
        { projectId: otherProject.id, recordId: location.id, assetId: imageJob.assetIds[0] },
      ),
    ).rejects.toThrow('another project');
    await expect(
      page.evaluate(
        ({ record, assetId }) => window.oyama.saveRecord({ ...record, coverAssetId: assetId }),
        { record: location, assetId: imageJob.assetIds[0] },
      ),
    ).rejects.toThrow('Cover image must belong');
    await expect
      .poll(() =>
        page
          .locator('.record-row')
          .filter({ hasText: 'Glass atrium' })
          .locator('img')
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);

    await page.locator('.navitem').filter({ hasText: 'Assets' }).click();
    await page.getByRole('button', { name: 'Generate image here' }).click();
    await page.getByLabel('Image prompt').fill('A clear glass cube on charcoal');
    await page.getByRole('button', { name: 'Generate image', exact: true }).click();
    await expect(page.getByText('Image ready for review')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Use image' }).click();
    await expect(page.locator('.asset-detail img')).toBeVisible();
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, path.resolve('public/mock/sample.mp4'));
    await page.getByRole('button', { name: 'Import media' }).click();
    await expect
      .poll(() =>
        page
          .locator('.asset-card')
          .filter({ hasText: 'sample.mp4' })
          .locator('img')
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    for (const [width, height] of [
      [1440, 900],
      [1100, 760],
    ] as const) {
      await app.evaluate(
        ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size[0], size[1]),
        [width, height],
      );
      await page.screenshot({ path: `artifacts/library-assets-${width}.png` });
      await expect(page.locator('.asset-card').filter({ hasText: 'sample.mp4' })).toBeVisible();
    }
  } finally {
    await app.close();
  }
});

test('failed in-place image remains reviewable and never attaches itself', async () => {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_MOCK: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/e2e', `library-image-error-${Date.now()}`),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.getByText('Mock ComfyUI', { exact: true }).waitFor();
    await page.evaluate(async () => {
      const state = await window.oyama.load();
      await window.oyama.saveSettings({ ...state.settings, mockScenario: 'error' });
    });
    await page.locator('.navitem').filter({ hasText: 'Wardrobe' }).click();
    await page.getByRole('button', { name: 'New outfit' }).click();
    await page.getByLabel('Outfit name').fill('Failed sample coat');
    await page.getByRole('button', { name: 'Generate sheet here' }).click();
    await page.getByRole('button', { name: 'Generate image', exact: true }).click();
    await expect(page.locator('.generator-result')).toContainText('error', { timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Use image' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.locator('.record-row').filter({ hasText: 'Failed sample coat' }).click();
    await page.getByRole('button', { name: /Review generated images/ }).click();
    await expect(page.locator('.generator-result')).toContainText('error');
    const state = await page.evaluate(() => window.oyama.load());
    expect(state.records.find((record) => record.name === 'Failed sample coat')?.assetIds).toEqual(
      [],
    );
  } finally {
    await app.close();
  }
});
