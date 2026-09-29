import { _electron as electron, expect, test } from '@playwright/test';

test.skip(!process.env.OYAMA_LIVE_RIPPLE_DATA, 'Requires a previously rendered Ripple fixture.');
test('reopens the real nonzero-In Ripple output', async () => {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_DATA_DIR: process.env.OYAMA_LIVE_RIPPLE_DATA!,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.OYAMA_MOCK;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('.app')).toBeVisible({ timeout: 30000 });
    const output = await page.evaluate(async () => {
      const snapshot = await window.oyama.load();
      const job = snapshot.jobs.find(
        (item) => item.moduleId === 'ripple' && item.status === 'complete',
      );
      return job?.assetIds[0] ? window.oyama.probeAsset(job.assetIds[0]) : undefined;
    });
    expect(output?.video?.frames).toBe(49);
    expect(output?.audio?.codec).toBe('aac');
  } finally {
    await app.close();
  }
});
