import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';

test('settings routing and custom Native/Turbo steps persist across restart', async () => {
  const env = {
    ...process.env,
    OYAMA_MOCK: '1',
    OYAMA_TEST: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/e2e', `settings-${Date.now()}`),
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  let page = await app.firstWindow();
  const close = async () => {
    await page
      .getByRole('button', { name: 'Close window' })
      .click()
      .catch(() => {});
    await app.close();
  };
  try {
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    await page.keyboard.press('Alt+f');
    await page.getByRole('menuitem', { name: /^Settings/ }).click();
    await page.getByLabel('Live preview frames').fill('6');
    await page.getByLabel('Live preview FPS').fill('48');
    await page.getByLabel('GPU routing preset').selectOption('custom');
    await page.getByLabel('Diffusion model device').selectOption('gpu:0');
    await page.getByLabel('Text encoder device').selectOption('cpu');
    await page.getByLabel('Video / image VAE device').selectOption('gpu:0');
    await expect(
      page.getByLabel('Video / image VAE device').locator('option[value="cpu"]'),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Save & test connection' }).click();
    await expect(page.getByRole('status')).toContainText('Settings saved');
    await page.screenshot({ path: 'artifacts/settings-1440.png' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760));
    await page.screenshot({ path: 'artifacts/settings-1100.png' });
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.getByRole('switch', { name: 'Use profile step defaults' }).click();
    await page.getByLabel('H3 sampling steps').fill('12');
    await page.getByLabel('Model', { exact: true }).selectOption('turbo8');
    await expect(page.getByLabel('H3 sampling steps')).toBeEnabled();
    await page.getByLabel('H3 sampling steps').fill('7');
    await page.getByRole('switch', { name: 'Use profile step defaults' }).click();
    await expect(page.getByLabel('H3 sampling steps')).toHaveValue('8');
    await page.getByRole('switch', { name: 'Use profile step defaults' }).click();
    await expect(page.getByLabel('H3 sampling steps')).toHaveValue('7');
    await page.getByLabel('Tool mode').selectOption({ label: 'Continue / Extend' });
    await page.getByRole('switch', { name: 'Advanced parameters' }).click();
    await page.getByRole('switch', { name: 'Use profile step defaults' }).click();
    await page.getByLabel('Continue sampling steps').fill('11');
    await page.getByLabel('Continue quality').selectOption('native');
    await expect(page.getByLabel('Continue sampling steps')).toHaveValue('11');
    await page.getByLabel('Tool mode').selectOption({ label: 'LTX Ripple \u00b7 Video Edit' });
    await page.getByLabel('Ripple edit mode').selectOption('long');
    await page.getByLabel('Ripple long duration').fill('4');
    await page.getByLabel('Ripple chunk duration').fill('2');
    await page.getByLabel('Ripple overlap').fill('0.5');
    await expect(page.getByText(/3 sequential chunks/)).toBeVisible();
    await close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    await page.keyboard.press('Alt+f');
    await page.getByRole('menuitem', { name: /^Settings/ }).click();
    await expect(page.getByLabel('Live preview frames')).toHaveValue('6');
    await expect(page.getByLabel('Live preview FPS')).toHaveValue('48');
    await expect(page.getByLabel('GPU routing preset')).toHaveValue('custom');
    await expect(page.getByLabel('Text encoder device')).toHaveValue('cpu');
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.getByLabel('Tool mode').selectOption({ label: 'H3 · Text to Video' });
    await expect(page.getByLabel('H3 sampling steps')).toHaveValue('7');
    await page.getByLabel('Tool mode').selectOption({ label: 'Continue / Extend' });
    await page.getByRole('switch', { name: 'Advanced parameters' }).click();
    await expect(page.getByLabel('Continue sampling steps')).toHaveValue('11');
    await page.getByLabel('Tool mode').selectOption({ label: 'LTX Ripple \u00b7 Video Edit' });
    await expect(page.getByLabel('Ripple edit mode')).toHaveValue('long');
    await expect(page.getByLabel('Ripple overlap')).toHaveValue('0.5');
  } finally {
    await close();
  }
});
