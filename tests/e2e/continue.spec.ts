import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';

test('Continue preserves source context, joins a managed beat and reopens it', async () => {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_MOCK: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/e2e', `continue-${Date.now()}`),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill('Original quiet scene.');
    await page.getByRole('button', { name: 'GENERATE', exact: true }).click();
    await expect(page.locator('.job-state.complete')).toBeVisible({ timeout: 15000 });
    const source = await page.evaluate(async () =>
      (await window.oyama.load()).assets.find((asset) => asset.kind === 'video')!,
    );
    await page
      .locator('.navitem')
      .filter({ hasText: /^Assets/ })
      .first()
      .click();
    await page
      .getByRole('button', { name: new RegExp(source.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
      .click();
    await page.getByRole('button', { name: 'Continue this video' }).click();
    await expect(page.getByLabel('Continue width')).toHaveValue('832');
    await expect(page.getByLabel('Continue height')).toHaveValue('480');
    await page.getByLabel('Continue width').fill('512');
    await page.getByLabel('Continue height').fill('320');
    await page.getByLabel('Continue method').selectOption('motion');
    await page.getByRole('switch', { name: 'Advanced parameters' }).click();
    await page.getByLabel('Continue continuity source').selectOption('latent');
    await expect(page.getByRole('button', { name: 'CONTINUE VIDEO' })).toBeDisabled();
    await page.getByLabel('Continue continuity source').selectOption('auto');
    await page.getByLabel('Continue method').selectOption('last');
    await page.getByLabel('Continue duration').focus();
    await page.getByLabel('Continue duration').press('Home');
    await page.getByLabel('Continue dialogue guidance').selectOption('none');
    await page.getByRole('switch', { name: 'Carry source audio' }).click();
    for (const [width, height] of [
      [1440, 900],
      [1100, 760],
    ] as const) {
      await app.evaluate(
        ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size[0], size[1]),
        [width, height],
      );
      await page.getByLabel('Continue dialogue guidance').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `artifacts/continue-continuity-${width}.png` });
    }
    await page.getByRole('button', { name: 'Context', exact: true }).click();
    await expect(page.getByText('Original quiet scene.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Prompt', exact: true }).click();
    await page.getByLabel('Continue next action').fill('The subject turns left.');
    await page.getByRole('button', { name: 'CONTINUE VIDEO' }).click();
    await expect(page.locator('.job-state.complete')).toHaveCount(2, { timeout: 20000 });
    await page.getByRole('button', { name: 'Result', exact: true }).click();
    const result = await page.evaluate(async () => {
      const state = await window.oyama.load();
      const job = state.jobs.find((job) => job.moduleId === 'continue')!;
      return { job, asset: state.assets.find((asset) => asset.id === job.assetIds[0])! };
    });
    expect(result.job.assetIds).toHaveLength(2);
    expect(result.job.rawAssetIds).toEqual([result.job.assetIds[1]]);
    expect(result.job.snapshot.sourcePrompt).toBe('Original quiet scene.');
    expect(result.job.snapshot.dialoguePolicy).toBe('none');
    expect(result.job.snapshot.audioCarry).toBe(false);
    expect(result.asset.parentAssetId).toBe(source.id);
    expect(result.asset.derivation?.generatedAssetId).toBe(result.job.assetIds[1]);
    expect(result.asset.media?.video?.frames).toBe(144);
    expect(result.asset.media?.audio?.codec).toBe('aac');
    await expect(page.locator('.preview video')).toBeVisible();
    // Seed interrupted records using Electron's actual SQLite runtime; no generator is resubmitted.
    await app.evaluate(async ({ app }, completed) => {
      const { createRequire } = process.getBuiltinModule('module');
      const requireMain = createRequire(`${app.getAppPath()}/package.json`);
      const Database = requireMain('better-sqlite3');
      const database = new Database(
        requireMain('node:path').join(app.getPath('userData'), 'createspace.sqlite'),
      );
      try {
        for (const [id, status] of [
          ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'preparing'],
          ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'submitting'],
          ['cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'unknown'],
        ]) {
          const job = {
            ...completed,
            id,
            status,
            promptId: undefined,
            rawAssetIds: undefined,
            assetIds: [],
            progress: null,
          };
          database
            .prepare('INSERT INTO jobs VALUES(?,?,?)')
            .run(id, job.projectId, JSON.stringify(job));
        }
      } finally {
        database.close();
      }
    }, result.job);
    await page.getByRole('button', { name: 'Close window' }).click();
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    page.on('pageerror', (error) => errors.push(error.message));
    await page
      .locator('.navitem')
      .filter({ hasText: /^Continue \/ Extend/ })
      .first()
      .click();
    await expect(page.getByLabel('Continue next action')).toHaveValue('The subject turns left.');
    await expect(page.getByLabel('Continue dialogue guidance')).toHaveValue('none');
    await expect(page.getByRole('switch', { name: 'Carry source audio' })).toHaveAttribute(
      'data-state',
      'unchecked',
    );
    await expect(page.locator('.preview video')).toBeVisible();
    const playback = await page
      .locator('.preview video')
      .evaluate(async (video: HTMLVideoElement) => {
        if (!video.readyState)
          await new Promise<void>((resolve) =>
            video.addEventListener('loadedmetadata', () => resolve(), { once: true }),
          );
        video.currentTime = 4.5;
        await new Promise<void>((resolve) =>
          video.addEventListener('seeked', () => resolve(), { once: true }),
        );
        return { duration: video.duration, seekTime: video.currentTime };
      });
    expect(playback.duration).toBeCloseTo(6, 1);
    expect(playback.seekTime).toBeCloseTo(4.5, 1);
    const recovered = await page.evaluate(() => window.oyama.load());
    expect(
      recovered.jobs.find((job) => job.id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')?.status,
    ).toBe('cancelled');
    expect(
      recovered.jobs.find((job) => job.id === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')?.status,
    ).toBe('cancelled');
    expect(
      recovered.jobs.find((job) => job.id === 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')?.status,
    ).toBe('unknown');
    await page.getByRole('button', { name: 'Queue', exact: true }).click();
    await page.getByRole('button', { name: 'Dismiss unresolved' }).click();
    const dismissed = await page.evaluate(() => window.oyama.load());
    expect(
      dismissed.jobs.find((job) => job.id === 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')?.message,
    ).toContain('No server job was stopped or resubmitted');
    expect(errors).toEqual([]);
    await page.getByRole('button', { name: 'Close window' }).click();
  } finally {
    await app.close();
  }
});
