import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';

test('Continue plans persist beats, reject invalid branches and retain server-owned results', async () => {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_MOCK: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/e2e', `scripts-${Date.now()}`),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill('Original scene.');
    await page.getByRole('button', { name: 'GENERATE', exact: true }).click();
    await expect(page.locator('.job-state.complete')).toBeVisible({ timeout: 15000 });
    const source = await page.evaluate(async () =>
      (await window.oyama.load()).assets.find((asset) => asset.kind === 'video')!,
    );
    await page.getByLabel('Tool mode').selectOption({ label: 'Continue / Extend' });
    await page.getByRole('button', { name: 'Choose source', exact: true }).click();
    await page.getByLabel('Continue source video').selectOption(source.id);
    await page.getByRole('button', { name: 'Script', exact: true }).click();
    await page.getByRole('button', { name: 'New script', exact: true }).click();
    await page.getByLabel('Script name').fill('Glass cube branches');
    await page.getByLabel('Script dialogue guidance').selectOption('none');
    await page.getByLabel('Script previous audio').selectOption('mute');
    await page.getByLabel('Script context frames').selectOption('5');
    await page.getByLabel('Beat 1 camera direction').fill('Slow orbit left');
    await page.getByLabel('Beat 1 action').fill('//orbit');
    await expect(page.getByRole('listbox', { name: 'Prompt parts' })).toBeVisible();
    await page.getByLabel('Beat 1 action').press('Enter');
    await expect(page.getByLabel('Beat 1 action')).toHaveValue(/orbit/i);
    await page.getByLabel('Beat 1 action').fill('The cube rotates left.');
    await page.getByRole('button', { name: 'Add beat', exact: true }).click();
    await page.getByLabel('Beat 2 action').fill('The camera rises.');
    await page.getByRole('button', { name: 'Add beat', exact: true }).click();
    const firstId = await page
      .getByLabel('Beat 3 source')
      .locator('option')
      .nth(2)
      .getAttribute('value');
    await page.getByLabel('Beat 3 source').selectOption(firstId!);
    await page.getByLabel('Beat 3 action').fill('An alternate camera orbit.');
    await page.getByRole('button', { name: 'Save script', exact: true }).click();
    await expect(page.getByText('Saved · revision 1', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'artifacts/scripts-1440.png' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760));
    await page.screenshot({ path: 'artifacts/scripts-1100.png' });
    const saved = await page.evaluate(async () => {
      const state = await window.oyama.load();
      return (await window.oyama.listContinuationScripts(state.projects[0].id))[0];
    });
    expect(saved.continuity).toEqual({ dialoguePolicy: 'none', audioCarry: false, blendFrames: 0 });
    expect(saved.settings.contextFrames).toBe(5);
    expect(saved.beats[0].camera).toBe('Slow orbit left');
    const validation = await page.evaluate(async (script) => {
      const wrongProject = await window.oyama.createProject('Other project');
      let crossProject = false;
      let forward = false;
      let stale = false;
      try {
        await window.oyama.saveContinuationScript({
          ...script,
          id: crypto.randomUUID(),
          revision: 0,
          projectId: wrongProject.id,
        });
      } catch {
        crossProject = true;
      }
      try {
        await window.oyama.saveContinuationScript({
          ...script,
          beats: script.beats.map((beat, index) =>
            index === 0 ? { ...beat, source: { kind: 'beat', beatId: script.beats[2].id } } : beat,
          ),
        });
      } catch {
        forward = true;
      }
      try {
        await window.oyama.saveContinuationScript({ ...script, revision: 0 });
      } catch {
        stale = true;
      }
      return { crossProject, forward, stale };
    }, saved);
    expect(validation).toEqual({ crossProject: true, forward: true, stale: true });
    // Seed a completed lineage as server-owned data to exercise stale-result persistence through IPC.
    await app.evaluate(({ app }, script) => {
      const requireMain = process
        .getBuiltinModule('module')
        .createRequire(`${app.getAppPath()}/package.json`);
      const db = new (requireMain('better-sqlite3'))(
        requireMain('node:path').join(app.getPath('userData'), 'createspace.sqlite'),
      );
      try {
        for (const beat of script.beats) {
          beat.result = { jobId: script.id, assetIds: [script.sourceVideo], deliveredDuration: 1 };
        }
        db.prepare('UPDATE continuation_scripts SET data=? WHERE id=?').run(
          JSON.stringify(script),
          script.id,
        );
      } finally {
        db.close();
      }
    }, saved);
    await page.getByLabel('Beat 1 action').fill('Changed rotation.');
    await page.getByRole('button', { name: 'Save script', exact: true }).click();
    await expect(page.getByText('Saved · revision 2', { exact: true })).toBeVisible();
    const staleScript = await page.evaluate(
      async (projectId) => (await window.oyama.listContinuationScripts(projectId))[0],
      saved.projectId,
    );
    expect(staleScript.beats.map((beat) => beat.stale)).toEqual([true, true, true]);
    expect(staleScript.beats.every((beat) => beat.result?.assetIds[0] === source.id)).toBe(true);
    await page.getByRole('button', { name: 'Remove Beat 1', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'source beat was removed' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save script', exact: true })).toBeDisabled();
    await page.getByLabel('Beat 2 source').selectOption('original');
    await page.getByRole('button', { name: 'Save script', exact: true }).click();
    await expect(page.getByText('Saved · revision 3', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close window' }).click();
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.locator('.navitem').filter({ hasText: 'Project Files' }).click();
    await page.getByRole('button').filter({ hasText: 'Untitled Project' }).click();
    await page.getByLabel('Tool mode').selectOption({ label: 'Continue / Extend' });
    await page.getByRole('button', { name: 'Script', exact: true }).click();
    await expect(page.getByLabel('Script name')).toHaveValue('Glass cube branches');
    await expect(page.getByText('Saved · revision 3', { exact: true })).toBeVisible();
    const data = await page.evaluate(
      (projectId) => window.oyama.listContinuationScripts(projectId),
      saved.projectId,
    );
    expect(data[0].revision).toBe(3);
    expect(data[0].beats).toHaveLength(2);
    expect(data[0].beats[1].source).toEqual({ kind: 'original' });
    expect(data[0].beats[0].result?.assetIds[0]).toBe(source.id);
    await page.getByRole('button', { name: 'Close window' }).click();
  } finally {
    await app.close();
  }
});
