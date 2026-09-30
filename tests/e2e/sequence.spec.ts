import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';

test('Continue sequence renders selected ancestry, survives restart and reuses completed branch', async () => {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_MOCK: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/e2e', `sequence-${Date.now()}`),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    await page
      .getByRole('textbox', { name: 'Prompt', exact: true })
      .fill('A blue glass cube rotates.');
    await page.getByRole('button', { name: 'GENERATE', exact: true }).click();
    await expect(page.locator('.job-state.complete')).toBeVisible({ timeout: 15000 });
    const data = await page.evaluate(async () => {
      const state = await window.oyama.load();
      const source = state.assets.find((asset) => asset.kind === 'video')!;
      const projectId = state.projects[0].id;
      const beatIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
      const characterId = crypto.randomUUID();
      const locationId = crypto.randomUUID();
      await window.oyama.saveRecord({
        id: characterId,
        kind: 'character',
        name: 'Mara',
        description: 'Copper hair',
        assetIds: [],
      });
      await window.oyama.saveRecord({
        id: locationId,
        kind: 'location',
        name: 'Atrium',
        description: 'Stone arches',
        assetIds: [],
      });
      const script = await window.oyama.saveContinuationScript({
        id: crypto.randomUUID(),
        projectId,
        revision: 0,
        name: 'Branch test',
        sourceVideo: source.id,
        settings: {
          width: 832,
          height: 480,
          quality: 'turbo8',
          duration: 1,
          prompt: '',
          sourceVideo: source.id,
        },
        beats: beatIds.map((id, index) => ({
          id,
          name: `Beat ${index + 1}`,
          prompt: `Action ${index + 1}`,
          duration: 1,
          method: 'last',
          selectedSeconds: 0,
          ...(index === 0 ? { replacements: { characterId, locationId } } : {}),
          source:
            index === 0
              ? { kind: 'original' }
              : index === 1
                ? { kind: 'previous' }
                : { kind: 'beat', beatId: beatIds[0] },
        })),
      });
      return { scriptId: script.id, projectId, beatIds, characterId, locationId };
    });
    const first = await page.evaluate(
      ({ scriptId, beatIds }) => window.oyama.runContinuationScript(scriptId, beatIds[1]),
      data,
    );
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.oyama.load())).jobs.find((job) => job.id === first.id)
            ?.status,
        { timeout: 30000 },
      )
      .toBe('complete');
    const afterFirst = await page.evaluate(async ({ projectId, scriptId }) => {
      const script = (await window.oyama.listContinuationScripts(projectId)).find(
        (item) => item.id === scriptId,
      )!;
      return script.beats.map((beat) => beat.result);
    }, data);
    expect(afterFirst[0]?.assetIds.length).toBeGreaterThan(0);
    expect(afterFirst[1]?.assetIds.length).toBeGreaterThan(0);
    expect(afterFirst[2]).toBeUndefined();
    const firstChildren = (await page.evaluate(() => window.oyama.load())).jobs.filter(
      (job) => job.snapshot.sequenceParentId === first.id,
    );
    const firstBeatJob = firstChildren.find(
      (job) => job.snapshot.sequenceBeatId === data.beatIds[0],
    )!;
    const secondBeatJob = firstChildren.find(
      (job) => job.snapshot.sequenceBeatId === data.beatIds[1],
    )!;
    expect(firstBeatJob.snapshot.effectiveCharacterIds).toEqual([data.characterId]);
    expect(firstBeatJob.snapshot.effectiveLocationIds).toEqual([data.locationId]);
    expect(secondBeatJob.snapshot.sourceCharacterIds).toEqual([data.characterId]);
    await page.locator('.navitem').filter({ hasText: 'Continue / Extend' }).first().click();
    await page.locator('.composer-tab').filter({ hasText: 'Script' }).click();
    await expect(page.getByRole('combobox', { name: 'Beat 1 character change' })).toHaveValue(
      data.characterId,
    );
    await expect(page.getByRole('combobox', { name: 'Beat 1 location change' })).toHaveValue(
      data.locationId,
    );
    await page.getByRole('button', { name: 'Close window' }).click();
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    const second = await page.evaluate(
      ({ scriptId, beatIds }) => window.oyama.runContinuationScript(scriptId, beatIds[2]),
      data,
    );
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.oyama.load())).jobs.find((job) => job.id === second.id)
            ?.status,
        { timeout: 30000 },
      )
      .toBe('complete');
    const final = await page.evaluate(async ({ projectId, scriptId }) => {
      const state = await window.oyama.load();
      const script = (await window.oyama.listContinuationScripts(projectId)).find(
        (item) => item.id === scriptId,
      )!;
      return { script, jobs: state.jobs };
    }, data);
    expect(final.script.beats[0].result?.jobId).toBe(afterFirst[0]?.jobId);
    expect(final.script.beats[2].result?.assetIds.length).toBeGreaterThan(0);
    expect(final.jobs.filter((job) => job.snapshot.sequenceParentId === second.id)).toHaveLength(1);
    const retry = await page.evaluate(async ({ projectId, scriptId, beatIds }) => {
      const script = (await window.oyama.listContinuationScripts(projectId)).find(
        (item) => item.id === scriptId,
      )!;
      await window.oyama.saveContinuationScript({
        ...script,
        beats: script.beats.map((beat) =>
          beat.id === beatIds[2] ? { ...beat, prompt: 'A changed alternate action.' } : beat,
        ),
      });
      return window.oyama.runContinuationScript(scriptId, beatIds[2]);
    }, data);
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.oyama.load())).jobs.find(
            (job) => job.snapshot.sequenceParentId === retry.id,
          )?.status,
        { timeout: 15000 },
      )
      .toBe('running');
    await page.evaluate((id) => window.oyama.cancelJob(id), retry.id);
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.oyama.load())).jobs.find(
            (job) => job.snapshot.sequenceParentId === retry.id,
          )?.status,
        { timeout: 15000 },
      )
      .toBe('cancelled');
    await page.evaluate((id) => window.oyama.resumeContinuationScript(id), retry.id);
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.oyama.load())).jobs.find((job) => job.id === retry.id)
            ?.status,
        { timeout: 30000 },
      )
      .toBe('complete');
    const recovered = await page.evaluate(() => window.oyama.load());
    expect(recovered.jobs.filter((job) => job.snapshot.sequenceParentId === retry.id)).toHaveLength(
      2,
    );
    expect(
      recovered.jobs.filter(
        (job) => job.snapshot.sequenceParentId === retry.id && job.status === 'complete',
      ),
    ).toHaveLength(1);
    const current = (
      await page.evaluate((id) => window.oyama.listContinuationScripts(id), data.projectId)
    ).find((item) => item.id === data.scriptId)!;
    expect(current.beats[0].result?.jobId).toBe(afterFirst[0]?.jobId);
    const absentAsset = '11111111-1111-4111-8111-111111111111';
    await app.evaluate(
      ({ app }, { scriptId, beatId, absentAsset }) => {
        const requireMain = process
          .getBuiltinModule('module')
          .createRequire(`${app.getAppPath()}/package.json`);
        const db = new (requireMain('better-sqlite3'))(
          requireMain('node:path').join(app.getPath('userData'), 'createspace.sqlite'),
        );
        try {
          const row = db.prepare('SELECT data FROM continuation_scripts WHERE id=?').get(scriptId);
          const script = JSON.parse(row.data);
          const beat = script.beats.find((item: { id: string }) => item.id === beatId);
          beat.result.assetIds = [absentAsset];
          db.prepare('UPDATE continuation_scripts SET data=? WHERE id=?').run(
            JSON.stringify(script),
            scriptId,
          );
          db.prepare('UPDATE continuation_beats SET data=? WHERE script_id=? AND id=?').run(
            JSON.stringify(beat),
            scriptId,
            beatId,
          );
        } finally {
          db.close();
        }
      },
      { scriptId: data.scriptId, beatId: data.beatIds[0], absentAsset },
    );
    const missingCache = await page.evaluate(
      ({ scriptId, beatIds }) => window.oyama.runContinuationScript(scriptId, beatIds[0]),
      data,
    );
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.oyama.load())).jobs.find(
            (job) => job.id === missingCache.id,
          )?.status,
        { timeout: 30000 },
      )
      .toBe('complete');
    const cacheRecovered = (
      await page.evaluate((id) => window.oyama.listContinuationScripts(id), data.projectId)
    ).find((item) => item.id === data.scriptId)!;
    expect(cacheRecovered.beats[0].result?.assetIds[0]).not.toBe(absentAsset);
    expect(
      (await page.evaluate(() => window.oyama.load())).jobs.filter(
        (job) => job.snapshot.sequenceParentId === missingCache.id,
      ),
    ).toHaveLength(1);
    await page.getByRole('button', { name: 'Close window' }).click();
  } finally {
    await app.close();
  }
});
