import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';

test('Ripple inputs, length validation, generation and persisted draft', async () => {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_MOCK: '1',
    OYAMA_TEST: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/e2e', `ripple-${Date.now()}`),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  let page = await app.firstWindow();
  const closeWindow = async () => {
    await expect(page.getByRole('button', { name: 'Close window' })).toBeVisible();
    await Promise.all([
      page.waitForEvent('close'),
      page
        .getByRole('button', { name: 'Close window' })
        .click()
        .catch((error: Error) => {
          // Electron may finish the requested close before Playwright receives the click reply.
          if (
            !page.isClosed() ||
            !error.message.includes('Target page, context or browser has been closed')
          )
            throw error;
        }),
    ]);
  };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill('A quiet studio.');
  await page.getByRole('button', { name: 'GENERATE', exact: true }).click();
  await expect(page.locator('.job-state.complete')).toBeVisible({ timeout: 15000 });
  const inputs = await page.evaluate(async () => {
    const state = await window.oyama.load();
    const source = state.assets.find((asset) => asset.kind === 'video')!;
    const frame = await window.oyama.extractFrame({ assetId: source.id, seconds: 0 });
    return { source: source.id, frame: frame.id };
  });
  await page
    .locator('.navitem')
    .filter({ hasText: /^LTX Ripple/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Properties' }).click();
  await expect(page.getByRole('button', { name: 'GENERATE VIDEO' })).toBeDisabled();
  await page.getByRole('button', { name: 'Inputs', exact: true }).click();
  await page.getByLabel('Ripple source video').selectOption(inputs.source);
  await page.getByLabel('Ripple replacement frame').selectOption(inputs.frame);
  await expect(page.getByText(/Source needs at least/)).toBeVisible();
  await page.getByLabel('Ripple duration').focus();
  await page.getByLabel('Ripple duration').press('Home');
  await expect(page.getByRole('button', { name: 'GENERATE VIDEO' })).toBeEnabled();
  await page.getByLabel('Ripple width').fill('512');
  await page.getByLabel('Ripple height').fill('320');
  await page.getByRole('button', { name: 'GENERATE VIDEO' }).click();
  await expect(page.locator('.job-state.complete')).toHaveCount(2, { timeout: 15000 });
  await expect(page.locator('.preview video')).toBeVisible();
  await closeWindow();
  await app.close();
  app = await electron.launch({ args: ['.'], env });
  page = await app.firstWindow();
  await page
    .locator('.navitem')
    .filter({ hasText: /^LTX Ripple/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Inputs', exact: true }).click();
  await expect(page.getByLabel('Ripple source video')).toHaveValue(inputs.source);
  await expect(page.getByLabel('Ripple replacement frame')).toHaveValue(inputs.frame);
  await expect(page.getByLabel('Ripple duration')).toHaveValue('2');
  expect(errors).toEqual([]);
  await closeWindow();
  await app.close();
});
