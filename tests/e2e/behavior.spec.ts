import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';

test('project isolation, shared locations, managed imports, failed jobs and cancellation', async () => {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_MOCK: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/e2e', `behavior-${Date.now()}`),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    const result = await page.evaluate(async () => {
      const api = window.oyama;
      const state = await api.load();
      const first = state.projects[0];
      const second = await api.createProject('Second project');
      const location = {
        id: crypto.randomUUID(),
        kind: 'location' as const,
        name: 'Studio',
        description: 'Soft light',
        assetIds: [],
      };
      await api.saveRecord(location);
      await api.saveDraft({
        projectId: first.id,
        moduleId: 'h3',
        values: { prompt: 'First shot', locationIds: [location.id] },
      });
      await api.saveDraft({
        projectId: second.id,
        moduleId: 'h3',
        values: { prompt: 'Second shot', locationIds: [location.id] },
      });
      const updated = await api.load();
      let protectedRecord = false;
      try {
        await api.removeRecord(location.id);
      } catch {
        protectedRecord = true;
      }
      let invalidEndpoint = false;
      try {
        await api.saveSettings({ ...state.settings, comfyUrl: 'file:///C:/Windows' });
      } catch {
        invalidEndpoint = true;
      }
      await api.saveSettings({ ...state.settings, mockScenario: 'error' });
      const failure = await api.generate({
        projectId: first.id,
        moduleId: 'h3',
        values: { prompt: 'Failure scenario' },
      });
      return { first, second, updated, protectedRecord, invalidEndpoint, failure };
    });
    expect(result.updated.drafts.find((d) => d.projectId === result.first.id)?.values.prompt).toBe(
      'First shot',
    );
    expect(result.updated.drafts.find((d) => d.projectId === result.second.id)?.values.prompt).toBe(
      'Second shot',
    );
    expect(result.updated.records.filter((r) => r.kind === 'location')).toHaveLength(1);
    expect(result.protectedRecord).toBe(true);
    expect(result.invalidEndpoint).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          async (id) => (await window.oyama.load()).jobs.find((j) => j.id === id)?.status,
          result.failure.id,
        ),
      )
      .toBe('error');
    const cancelled = await page.evaluate(async (projectId) => {
      const state = await window.oyama.load();
      await window.oyama.saveSettings({ ...state.settings, mockScenario: 'success' });
      const job = await window.oyama.generate({
        projectId,
        moduleId: 'h3',
        values: { prompt: 'Cancel scenario' },
      });
      await window.oyama.cancelJob(job.id);
      return job.id;
    }, result.first.id);
    await expect
      .poll(() =>
        page.evaluate(
          async (id) => (await window.oyama.load()).jobs.find((j) => j.id === id)?.status,
          cancelled,
        ),
      )
      .toBe('cancelled');
    // Replace the OS dialog in the test main process, keeping the real import IPC and storage path.
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, path.resolve('public/mock/reference.png'));
    const asset = await page.evaluate(
      async (projectId) => (await window.oyama.importMedia({ projectId }))[0],
      result.first.id,
    );
    expect(asset.projectId).toBe(result.first.id);
    expect(asset.url).toMatch(/^oyama:\/\/media\//);
    const blocked = await page.evaluate(
      async ({ projectId, assetId }) => {
        try {
          await window.oyama.generate({
            projectId,
            moduleId: 'h3',
            values: { prompt: 'Wrong project', mode: 'image', firstFrame: assetId },
          });
          return false;
        } catch {
          return true;
        }
      },
      { projectId: result.second.id, assetId: asset.id },
    );
    expect(blocked).toBe(true);
    const state = await page.evaluate(() => window.oyama.load());
    expect(state.assets[0].missing).toBe(false);
    expect(
      await page.evaluate(() => ({
        require: typeof (window as unknown as { require?: unknown }).require,
      })),
    ).toEqual({ require: 'undefined' });
  } finally {
    await app.close();
  }
});
