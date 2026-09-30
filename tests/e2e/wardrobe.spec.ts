import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';

test('wardrobe creator saves, drafts a ZImage sheet, and survives restart', async () => {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_MOCK: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/e2e', `wardrobe-${Date.now()}`),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    await page.locator('.navitem').filter({ hasText: 'Characters' }).click();
    await page.getByRole('button', { name: 'New character' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Mara');
    await page.getByRole('button', { name: 'Save character' }).click();
    await page.locator('.navitem').filter({ hasText: 'Wardrobe' }).click();
    await page.getByRole('button', { name: 'New outfit' }).click();
    await page.getByLabel('Outfit name').fill('Travel coat');
    await page.getByLabel('Character binding').selectOption({ label: 'Mara' });
    await page.getByLabel('Garments and footwear').fill('Long fitted coat and boots');
    await page.getByLabel('Colors and pattern').fill('Olive and black');
    await page.getByRole('button', { name: 'Generate sheet here' }).click();
    await expect(page.getByLabel('Image prompt')).toContainText('Travel coat');
    await page.screenshot({ path: 'artifacts/wardrobe-generator-1440.png' });
    await page.getByRole('button', { name: 'Generate image', exact: true }).click();
    await expect(page.getByText('Image ready for review')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Back to details' }).click();
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.locator('.navitem').filter({ hasText: 'Wardrobe' }).click();
    await expect(page.locator('.record-row').filter({ hasText: 'Travel coat' })).toBeVisible();
    await page.locator('.record-row').filter({ hasText: 'Travel coat' }).click();
    await expect(page.getByRole('button', { name: /Review generated images/ })).toBeVisible();
    await page.getByRole('button', { name: /Review generated images/ }).click();
    await expect(page.getByText('Image ready for review')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Use image' }).click();
    await expect(page.getByText('Approved reference images')).toBeVisible();
    await page.getByRole('button', { name: 'Save outfit' }).click();
    const state = await page.evaluate(() => window.oyama.load());
    expect(
      state.records.find((record) => record.kind === 'wardrobe' && record.name === 'Travel coat')
        ?.assetIds,
    ).toHaveLength(1);
    expect(state.drafts.some((draft) => draft.moduleId === 'zimage')).toBe(false);
    await expect
      .poll(() =>
        page
          .locator('.record-row')
          .filter({ hasText: 'Travel coat' })
          .locator('img')
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.locator('.navitem').filter({ hasText: 'Wardrobe' }).click();
    for (const [width, height] of [
      [1440, 900],
      [1100, 760],
    ] as const) {
      await app.evaluate(
        ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size[0], size[1]),
        [width, height],
      );
      await page.screenshot({ path: `artifacts/wardrobe-${width}.png` });
      await expect(page.getByText('Travel coat', { exact: true })).toBeVisible();
      await page.locator('.record-row').filter({ hasText: 'Travel coat' }).click();
      await page.screenshot({ path: `artifacts/wardrobe-editor-${width}.png` });
      await page.getByRole('button', { name: 'Generate sheet here' }).click();
      await page.screenshot({ path: `artifacts/wardrobe-generator-${width}.png` });
      await page.getByRole('button', { name: 'Back to details' }).click();
      await page.getByRole('button', { name: 'Close dialog' }).click();
    }
    await page.locator('.navitem').filter({ hasText: 'Wardrobe' }).click();
    await expect(page.locator('.record-row').filter({ hasText: 'Travel coat' })).toContainText(
      '1 REFERENCES',
    );
    await page.locator('.navitem').filter({ hasText: 'Generate' }).click();
    await page.locator('.panel-tabs').getByRole('button', { name: 'Properties' }).click();
    await page.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('reference');
    await page
      .getByRole('textbox', { name: 'Prompt', exact: true })
      .fill('A subject wearing the coat turns slowly.');
    await page.locator('.composer-tab').filter({ hasText: 'Character' }).click();
    await page.locator('.chip').filter({ hasText: 'Travel coat' }).locator('input').check();
    await expect(page.locator('.chip').filter({ hasText: 'Mara' }).locator('input')).toBeChecked();
    await expect(page.getByRole('button', { name: 'GENERATE', exact: true })).toBeEnabled();
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.locator('.navitem').filter({ hasText: 'Wardrobe' }).click();
    await expect(page.getByText('Travel coat', { exact: true })).toBeVisible();
  } finally {
    await app.close();
  }
});
