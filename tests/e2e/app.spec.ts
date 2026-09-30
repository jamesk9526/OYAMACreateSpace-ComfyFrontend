import { _electron as electron, expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
test('mock shell, canonical drafts, global records, generation and restart persistence', async () => {
  const dataDir = path.resolve('artifacts/e2e', `run-${Date.now()}`);
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
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Prompt', exact: true })
    .fill('A quiet coastal road at sunrise.');
  await page.locator('.navitem').filter({ hasText: 'Characters' }).click();
  await page.getByRole('button', { name: 'New character', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Mara');
  await page
    .getByLabel('Appearance and outfit', { exact: true })
    .fill('An explorer with red hair.');
  await page.getByRole('button', { name: 'Save character' }).click();
  await expect(page.locator('.record-row').filter({ hasText: 'Mara' })).toBeVisible();
  await page.locator('.navitem').filter({ hasText: 'Generate' }).click();
  await expect(page.getByRole('textbox', { name: 'Prompt', exact: true })).toHaveValue(
    'A quiet coastal road at sunrise.',
  );
  await page.screenshot({ path: 'artifacts/mock-shell-1440.png' });
  await page.getByRole('button', { name: 'GENERATE', exact: true }).click();
  await expect(page.locator('.job-state.complete')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.preview video')).toBeVisible();
  await page.locator('.preview video').evaluate(async (element: HTMLVideoElement) => {
    await element.play();
    element.currentTime = 1;
  });
  await expect
    .poll(() => page.locator('.preview video').evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.9);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760));
  await page.screenshot({ path: 'artifacts/mock-shell-1100.png' });
  expect(errors).toEqual([]);
  await app.close();
  app = await electron.launch({ args: ['.'], env });
  page = await app.firstWindow();
  await expect(page.getByRole('textbox', { name: 'Prompt', exact: true })).toHaveValue(
    'A quiet coastal road at sunrise.',
  );
  const state = await page.evaluate(() => window.oyama.load());
  expect(state.records.some((r) => r.name === 'Mara')).toBe(true);
  expect(state.jobs[0].status).toBe('complete');
  expect(state.assets).toHaveLength(1);
  await app.close();
  expect((await fs.stat(path.join(dataDir, 'createspace.sqlite'))).size).toBeGreaterThan(0);
});
