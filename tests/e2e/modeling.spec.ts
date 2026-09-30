import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';
test('Modeling modes, ZImage input and canonical draft restart', async () => {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_MOCK: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/e2e', `modeling-${Date.now()}`),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    await page.locator('.navitem').filter({ hasText: 'Modeling' }).click();
    await page.getByLabel('Mode', { exact: true }).selectOption('character');
    await page.getByLabel('Look', { exact: true }).selectOption('animated');
    await page.getByLabel('Modeling description').fill('A forest explorer');
    await expect(page.getByRole('button', { name: 'GENERATE MODEL', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Create image · ZImage' }).click();
    await expect(page.getByRole('dialog')).toContainText('Create Modeling input');
    await expect(page.getByRole('dialog').locator('textarea').first()).toHaveValue(
      /A forest explorer[\s\S]*neutral A-pose/,
    );
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.getByRole('button', { name: 'Match Comfy settings' }).click();
    await expect(page.getByLabel('Shape resolution', { exact: true })).toHaveValue('1536');
    await expect(page.getByLabel('Target triangles', { exact: true })).toHaveValue('700000');
    await expect(page.getByLabel('Texture size', { exact: true })).toHaveValue('4096');
    await expect(page.getByLabel('Shape seed', { exact: true })).toHaveValue('42');
    await expect(page.getByLabel('Texture seed', { exact: true })).toHaveValue('43');
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, path.resolve('public/mock/reference.png'));
    await page.getByRole('button', { name: 'Import image', exact: true }).click();
    await expect(page.getByLabel('Source image', { exact: true })).not.toHaveValue('');
    for (const [width, height] of [
      [1440, 900],
      [1100, 760],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size[0], size[1]),
        [width, height],
      );
      await page.screenshot({ path: `artifacts/modeling-controls-${width}.png` });
    }
    await expect
      .poll(async () => {
        const s = await page.evaluate(() => window.oyama.load());
        return s.drafts.find((d) => d.moduleId === 'modeling')?.values.description;
      })
      .toBe('A forest explorer');
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    await page.locator('.navitem').filter({ hasText: 'Modeling' }).click();
    await expect(page.getByLabel('Mode', { exact: true })).toHaveValue('character');
    await expect(page.getByLabel('Look', { exact: true })).toHaveValue('animated');
    await expect(page.getByLabel('Modeling description')).toHaveValue('A forest explorer');
    await page.getByRole('button', { name: 'LTX turnaround', exact: true }).click();
    await expect(page.getByLabel('LTX mode')).toHaveValue('turnaround');
    await page.getByLabel('Camera orbit').selectOption('counterclockwise');
    await expect(page.getByLabel('LTX prompt')).toHaveValue('A forest explorer');
    await expect(page.getByRole('button', { name: 'GENERATE VIDEO', exact: true })).toBeEnabled();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.oyama.load())).drafts.find((d) => d.moduleId === 'ltx')
            ?.values.orbitDirection,
      )
      .toBe('counterclockwise');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760));
    await page.screenshot({ path: 'artifacts/turnaround-controls-1100.png' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
    await page.screenshot({ path: 'artifacts/turnaround-controls-1440.png' });
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    await page.locator('.navitem').filter({ hasText: 'LTX 2.5 Video' }).first().click();
    await expect(page.getByLabel('LTX mode')).toHaveValue('turnaround');
    await expect(page.getByLabel('Camera orbit')).toHaveValue('counterclockwise');
    await page.getByRole('button', { name: 'GENERATE VIDEO', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save 4 views', exact: true })).toBeEnabled({
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'Save 4 views', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Assets & References' })).toBeVisible();
    const frames = await page.evaluate(async () =>
      (await window.oyama.load()).assets.filter((a) => a.derivation?.operation === 'frame'),
    );
    expect(frames).toHaveLength(4);
    expect(new Set(frames.map((a) => a.parentAssetId)).size).toBe(1);
  } finally {
    await app.close();
  }
});
