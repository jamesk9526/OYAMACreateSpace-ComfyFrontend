import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';

test('tool switcher, locked canvas, diagnostics and restart preserve canonical drafts', async () => {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_MOCK: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/e2e', `controls-${Date.now()}`),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    await expect(
      page.locator('.composer-tabs').getByRole('button', { name: 'References', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator('.composer-actions').getByRole('button', { name: 'Reference', exact: true }),
    ).toHaveCount(0);
    await page.getByLabel('H3 orientation').selectOption('square');
    await page.getByLabel('H3 orientation').selectOption('landscape');
    await expect(page.getByLabel('H3 aspect ratio')).toHaveValue('16:9');
    await page.getByLabel('H3 aspect ratio').selectOption('16:9');
    await page.getByLabel('H3 width').fill('1024');
    await expect(page.getByLabel('H3 height')).toHaveValue('576');
    await page.getByLabel('H3 orientation').selectOption('portrait');
    await expect(page.getByLabel('H3 width')).toHaveValue('576');
    await expect(page.getByLabel('H3 height')).toHaveValue('1024');
    await page.screenshot({ path: 'artifacts/controls-1440.png' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760));
    await page.screenshot({ path: 'artifacts/controls-1100.png' });
    await page.getByLabel('Tool mode').selectOption({ label: 'H3 · Image to Video' });
    await expect(page.getByLabel('Mode', { exact: true })).toHaveValue('image');
    await expect(
      page.locator('.composer-tabs').getByRole('button', { name: 'Frames', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Mode', { exact: true }).selectOption('reference');
    await expect(
      page.locator('.composer-tabs').getByRole('button', { name: 'References', exact: true }),
    ).toBeVisible();
    await page
      .locator('.composer-tabs')
      .getByRole('button', { name: 'References', exact: true })
      .click();
    await page.getByLabel('Mode', { exact: true }).selectOption('text');
    await expect(page.getByLabel('Prompt', { exact: true })).toBeVisible();
    await expect(page.locator('.reference-editor')).toHaveCount(0);
    await page.getByLabel('Mode', { exact: true }).selectOption('reference');
    await page.getByLabel('Ref2VA identity detail').selectOption('max');
    await page.screenshot({ path: 'artifacts/ref2va-identity-1100.png' });
    await expect(page.getByLabel('Tool mode')).toHaveValue('2');
    await page.getByLabel('Tool category').selectOption('image');
    await expect(page.getByLabel('Image aspect ratio')).toBeVisible();
    await page.getByLabel('Image aspect ratio').selectOption('4:5');
    await page.getByLabel('Tool mode').selectOption({ label: 'Photo Edit · FireRed' });
    await expect(page.getByLabel('Photo Edit aspect ratio')).toBeVisible();
    await page.getByLabel('Tool mode').selectOption({ label: 'LTX 2.5 · Text to Video' });
    await expect(
      page.locator('.composer-tabs').getByRole('button', { name: 'References', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator('.composer-actions').getByRole('button', { name: 'First frame', exact: true }),
    ).toHaveCount(0);
    await page.getByLabel('LTX aspect ratio').selectOption('16:9');
    await expect(page.getByLabel('LTX width')).toHaveValue('1024');
    await expect(page.getByLabel('LTX height')).toHaveValue('576');
    await page.getByLabel('Tool mode').selectOption({ label: 'LTX Ripple · Video Edit' });
    await expect(page.getByLabel('Ripple aspect ratio')).toBeVisible();
    await page.getByLabel('Tool mode').selectOption({ label: 'Continue / Extend' });
    await expect(page.getByLabel('Continue aspect ratio')).toBeVisible();
    await page.evaluate(async () => {
      await window.oyama.reportRendererLog({
        level: 'warn',
        message: 'diagnostic verification marker',
      });
      const state = await window.oyama.load();
      try {
        await window.oyama.generate({
          projectId: state.projects[0].id,
          moduleId: 'continue',
          values: { prompt: 'Missing source' },
        });
      } catch {
        /* Deliberately verify pre-job error logging. */
      }
    });
    await page.locator('.navitem').filter({ hasText: 'Application log' }).click();
    await expect(page.getByText('diagnostic verification marker', { exact: true })).toBeVisible();
    await page.getByLabel('Log level').selectOption('error');
    await expect(page.locator('.log-entry').filter({ hasText: 'Choose a source' })).toBeVisible();
    await page.screenshot({ path: 'artifacts/logs-1100.png' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
    await page.screenshot({ path: 'artifacts/logs-1440.png' });
    // Reproduce the installed app's legacy Text to Video + character-image draft in isolation.
    await app.evaluate(async ({ dialog }, filename) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
    }, path.resolve('public/mock/reference.png'));
    await page.evaluate(async () => {
      const state = await window.oyama.load();
      const projectId = state.projects[0].id;
      const [asset] = await window.oyama.importMedia({ projectId });
      const promoted = await window.oyama.promoteAssetToRecord({
        assetId: asset.id,
        projectId,
        kind: 'character',
      });
      const draft = state.drafts.find(
        (draft) => draft.projectId === projectId && draft.moduleId === 'h3',
      )!;
      await window.oyama.saveDraft({
        ...draft,
        values: {
          ...draft.values,
          mode: 'text',
          modeExplicit: false,
          characterIds: [promoted.record.id],
        },
      });
    });
    await page.getByRole('button', { name: 'Close window' }).click();
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await expect(page.getByLabel('H3 width')).toHaveValue('576');
    await expect(page.getByLabel('H3 height')).toHaveValue('1024');
    await expect(page.getByLabel('Mode', { exact: true })).toHaveValue('reference');
    await expect(page.getByLabel('Ref2VA identity detail')).toHaveValue('max');
    await page.screenshot({ path: 'artifacts/ref2va-identity-1440.png' });
    await expect(page.getByRole('switch', { name: 'Lock aspect ratio' })).toBeChecked();
    await page.locator('.navitem').filter({ hasText: 'Application log' }).click();
    await expect(page.getByText('diagnostic verification marker', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close window' }).click();
  } finally {
    await app.close();
  }
});
