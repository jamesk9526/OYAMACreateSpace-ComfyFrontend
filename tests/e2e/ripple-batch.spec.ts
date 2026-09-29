import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';

test('long Ripple resumes a known failed chunk and reopens its managed assembly', async () => {
  const env = {
    ...process.env,
    OYAMA_MOCK: '1',
    OYAMA_TEST: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/e2e', `ripple-batch-${Date.now()}`),
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
    await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill('A quiet studio.');
    await page.getByRole('button', { name: 'GENERATE', exact: true }).click();
    await expect(page.locator('.job-state.complete')).toBeVisible({ timeout: 15000 });
    const sourceId = await page.evaluate(async () => {
      const state = await window.oyama.load();
      const source = state.assets.find((asset) => asset.kind === 'video')!;
      const frame = await window.oyama.extractFrame({ assetId: source.id, seconds: 0 });
      await window.oyama.saveSettings({ ...state.settings, mockScenario: 'error' });
      await window.oyama.saveDraft({
        projectId: source.projectId!,
        moduleId: 'ripple',
        values: {
          mode: 'long',
          sourceVideo: source.id,
          replacementFrame: frame.id,
          prompt: 'Preserve the scene.',
          width: 512,
          height: 320,
          longDuration: 2,
          chunkSeconds: 2,
          overlapSeconds: 0.5,
          seed: '45000',
        },
      });
      return source.id;
    });
    await page.reload();
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    await page.getByLabel('Tool mode').selectOption('5');
    await expect(page.getByLabel('Ripple edit mode')).toHaveValue('long');
    await page.getByRole('button', { name: 'GENERATE VIDEO', exact: true }).click();
    await expect
      .poll(
        async () =>
          page.evaluate(async () =>
            (await window.oyama.load()).jobs.some((job) => job.batch && job.status === 'error'),
          ),
        { timeout: 20000 },
      )
      .toBe(true);
    const failed = await page.evaluate(async () => {
      const state = await window.oyama.load();
      const parent = state.jobs.find((job) => job.batch)!;
      const child = state.jobs.find((job) => job.snapshot.batchParentId === parent.id)!;
      await window.oyama.saveSettings({ ...state.settings, mockScenario: 'success' });
      return { parentId: parent.id, childId: child.id };
    });
    await page.getByRole('button', { name: 'Queue', exact: true }).click();
    const row = page.locator(`[data-job-id="${failed.parentId}"]`);
    await row.getByRole('button', { name: 'Resume batch' }).click();
    await expect(row.locator('.job-state')).toHaveText('complete', { timeout: 20000 });
    const result = await page.evaluate(async ({ parentId, childId }) => {
      const state = await window.oyama.load();
      const parent = state.jobs.find((job) => job.id === parentId)!;
      return {
        asset: state.assets.find((asset) => asset.id === parent.assetIds[0])!,
        superseded: state.jobs.find((job) => job.id === childId)!.snapshot.batchSuperseded,
        children: state.jobs
          .filter((job) => job.snapshot.batchParentId === parentId)
          .map((job) => job.id),
      };
    }, failed);
    expect(result.superseded).toBe(true);
    expect(result.children).toHaveLength(2);
    expect(result.asset.derivation?.operation).toBe('ripple');
    expect(result.asset.parentAssetId).toBe(sourceId);
    const probe = await page.evaluate((id) => window.oyama.probeAsset(id), result.asset.id);
    expect(probe.video?.frames).toBe(48);
    expect(probe.audio).not.toBeNull();
    await close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    const reopened = await page.evaluate(
      async (id) => (await window.oyama.load()).assets.find((asset) => asset.id === id),
      result.asset.id,
    );
    expect(reopened?.derivation).toEqual(result.asset.derivation);
    expect(reopened?.missing).toBe(false);
  } finally {
    await close();
  }
});
