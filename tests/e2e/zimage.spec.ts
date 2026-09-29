import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';

test('ZImage mock generation, persistence, first-frame handoff and global promotion', async () => {
  const dataDir = path.resolve('artifacts/e2e', `zimage-${Date.now()}`);
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
  let app = await electron.launch({ args: ['.'], env });
  let page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
  await page
    .locator('.navitem')
    .filter({ hasText: /^Image/ })
    .click();
  await expect(page.getByRole('textbox', { name: 'Image prompt' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Image prompt' }).fill('A lime-lit modular film set.');
  await page.getByLabel('Profile').selectOption('base');
  await page.getByRole('button', { name: 'Negative' }).click();
  await expect(page.getByRole('textbox', { name: 'Negative prompt' })).toContainText('low quality');
  await page.getByLabel('Profile').selectOption('turbo');
  await page.getByRole('button', { name: 'GENERATE IMAGE' }).click();
  await expect(page.locator('.job-state.complete')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.preview img')).toBeVisible();
  await page.screenshot({ path: 'artifacts/zimage-shell-1440.png' });
  await page.getByRole('button', { name: 'Properties' }).click();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760));
  await page.screenshot({ path: 'artifacts/zimage-shell-1100.png' });
  await page.getByRole('button', { name: 'Use as H3 first frame' }).click();
  await expect(page.getByLabel('Mode', { exact: true })).toHaveValue('image');
  await expect(page.getByLabel('First frame', { exact: true })).not.toHaveValue('');
  const before = await page.evaluate(() => window.oyama.load());
  const image = before.assets.find((asset) => asset.kind === 'image');
  expect(image?.projectId).toBe(before.projects[0].id);
  const promoted = await page.evaluate((id) => window.oyama.promoteAsset(id), image!.id);
  expect(promoted.projectId).toBeNull();
  const promotedRecord = await page.evaluate(
    ({ assetId, projectId }) =>
      window.oyama.promoteAssetToRecord({ assetId, projectId, kind: 'character' }),
    { assetId: promoted.id, projectId: before.projects[0].id },
  );
  expect(promotedRecord.record.assetIds).toEqual([promoted.id]);
  await app.close();

  app = await electron.launch({ args: ['.'], env });
  page = await app.firstWindow();
  await page
    .locator('.navitem')
    .filter({ hasText: /^Image/ })
    .click();
  await expect(page.getByRole('textbox', { name: 'Image prompt' })).toHaveValue(
    'A lime-lit modular film set.',
  );
  await expect(page.locator('.preview img')).toBeVisible();
  const after = await page.evaluate(() => window.oyama.load());
  expect(after.assets.some((asset) => asset.id === promoted.id && asset.projectId === null)).toBe(
    true,
  );
  expect(
    after.records.some(
      (record) => record.id === promotedRecord.record.id && record.kind === 'character',
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await app.close();
});
