import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';

test('Character Studio approves a master, extracts exact turntable frames, and reuses rich global records', async () => {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_MOCK: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/e2e', `character-studio-${Date.now()}`),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    await page.locator('.navitem').filter({ hasText: 'Characters' }).click();
    await page.getByRole('button', { name: 'New character' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Mara');
    await page.getByLabel('Appearance and outfit').fill('Copper hair, green coat, black boots.');
    await page.getByLabel('Identity details').fill('Freckles and a square jaw.');
    await page.getByLabel('Voice and manner').fill('Quiet, measured voice.');
    await page.getByRole('button', { name: 'Create master in ZImage' }).click();
    await expect(page.getByLabel('Image prompt')).toContainText('Mara');
    await page.getByRole('button', { name: 'Generate image', exact: true }).click();
    await expect(page.getByText('Image ready for review')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Use image' }).click();
    await expect(page.getByRole('button', { name: 'Create H3 turntable' })).toBeEnabled();
    await page.getByRole('button', { name: 'Create H3 turntable' }).click();
    await expect(page.getByRole('textbox', { name: 'Prompt', exact: true })).toContainText('Mara');
    await page.getByRole('button', { name: 'GENERATE', exact: true }).click();
    await expect(page.locator('.job-state.complete')).toBeVisible({ timeout: 15000 });
    await page.locator('.navitem').filter({ hasText: 'Characters' }).click();
    await page.locator('.record-row').filter({ hasText: 'Mara' }).click();
    await page.locator('[aria-label="Existing H3 turntables"] button').first().click();
    await page.getByRole('button', { name: 'Extract five angles' }).click();
    await expect(page.getByText('Five exact frames sampled from the turntable:')).toBeVisible({
      timeout: 30000,
    });
    const record = await page.evaluate(async () =>
      (await window.oyama.load()).records.find((item) => item.name === 'Mara')!,
    );
    expect(record.angleSamples).toHaveLength(5);
    expect(record.approvedAssetIds).toHaveLength(1);
    expect(new Set(record.angleSamples?.map((sample) => sample.frame)).size).toBe(5);
    await page.locator('.record-reference').nth(2).locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Save character' }).click();
    expect(
      (await page.evaluate(() => window.oyama.load())).records.find((item) => item.name === 'Mara')
        ?.approvedAssetIds,
    ).toHaveLength(2);
    await page.locator('.navitem').filter({ hasText: 'Locations' }).click();
    await page.getByRole('button', { name: 'New location' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Atrium');
    await page.getByLabel('Environment').fill('Stone arches and a tiled floor.');
    await page.getByLabel('Time of day').fill('Dawn');
    await page.getByLabel('Lighting').fill('Warm side light');
    await page.getByLabel('Atmosphere').fill('Misty');
    await page.getByLabel('Accuracy and continuity').fill('Keep the central arch aligned.');
    await page.getByRole('button', { name: 'Save location' }).click();
    for (const [width, height] of [
      [1440, 900],
      [1100, 760],
    ] as const) {
      await app.evaluate(
        ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size[0], size[1]),
        [width, height],
      );
      await page.locator('.navitem').filter({ hasText: 'Characters' }).click();
      await page.locator('.record-row').filter({ hasText: 'Mara' }).click();
      await page.screenshot({ path: `artifacts/character-studio-${width}.png` });
      await page.getByRole('button', { name: 'Close dialog' }).click();
      await page.locator('.navitem').filter({ hasText: 'Locations' }).click();
      await page.locator('.record-row').filter({ hasText: 'Atrium' }).click();
      await page.screenshot({ path: `artifacts/location-editor-${width}.png` });
      await page.getByRole('button', { name: 'Close dialog' }).click();
    }
    await app.close();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    const persisted = await page.evaluate(() => window.oyama.load());
    expect(persisted.records.find((item) => item.name === 'Mara')?.angleSamples).toHaveLength(5);
    expect(persisted.records.find((item) => item.name === 'Atrium')?.accuracyNotes).toBe(
      'Keep the central arch aligned.',
    );
  } finally {
    await app.close();
  }
});
