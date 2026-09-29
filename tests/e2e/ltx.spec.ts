import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';

test('LTX drafts, ZImage first-frame handoff, mock video and restart', async () => {
  const dataDir = path.resolve('artifacts/e2e', `ltx-${Date.now()}`);
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
    .filter({ hasText: /^LTX 2\.5 Video/ })
    .first()
    .click();
  await page.getByRole('textbox', { name: 'LTX prompt' }).fill('A lighthouse window opens slowly.');
  await page.getByLabel('LTX profile').selectOption('quality');
  await expect(page.getByText(/half-size first stage/)).toBeVisible();
  await page.screenshot({ path: 'artifacts/ltx-shell-1440.png' });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760));
  await page.screenshot({ path: 'artifacts/ltx-shell-1100.png' });
  await page
    .locator('.navitem')
    .filter({ hasText: /^Image/ })
    .click();
  await page.getByRole('textbox', { name: 'Image prompt' }).fill('A painted lighthouse at dawn.');
  await page.getByRole('button', { name: 'GENERATE IMAGE' }).click();
  await expect(page.locator('.job-state.complete')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Properties' }).click();
  await page.getByRole('button', { name: 'Use as LTX first frame' }).click();
  await expect(page.getByLabel('LTX mode')).toHaveValue('image');
  await expect(page.getByLabel('LTX first frame')).not.toHaveValue('');
  await page.getByRole('button', { name: 'MSR', exact: true }).click();
  await page.getByText('Use Licon MSR references').click();
  await expect(page.getByRole('button', { name: 'GENERATE VIDEO' })).toBeDisabled();
  const firstFrameId = await page.evaluate(
    async () => (await window.oyama.load()).assets.find((asset) => asset.kind === 'image')!.id,
  );
  await page.getByLabel('MSR pic1').selectOption(firstFrameId);
  await page.getByRole('button', { name: 'Prompt', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'LTX prompt' })).toHaveValue(
    'A lighthouse window opens slowly.',
  );
  await page.getByRole('button', { name: 'GENERATE VIDEO' }).click();
  await expect(page.locator('.job-state.complete').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.preview video')).toBeVisible();
  await app.close();
  app = await electron.launch({ args: ['.'], env });
  page = await app.firstWindow();
  await page
    .locator('.navitem')
    .filter({ hasText: /^LTX 2\.5 Video/ })
    .first()
    .click();
  await expect(page.getByLabel('LTX profile')).toHaveValue('quality');
  await page.getByRole('button', { name: 'References', exact: true }).last().click();
  await expect(page.getByLabel('LTX first frame')).not.toHaveValue('');
  await page.getByRole('button', { name: 'MSR', exact: true }).click();
  await expect(page.getByLabel('MSR pic1')).toHaveValue(firstFrameId);
  const state = await page.evaluate(() => window.oyama.load());
  expect(state.jobs.some((job) => job.moduleId === 'ltx' && job.status === 'complete')).toBe(true);
  expect(state.assets.some((asset) => asset.kind === 'video')).toBe(true);
  expect(errors).toEqual([]);
  await app.close();
});
