import { _electron as electron, expect, test } from '@playwright/test';

test.skip(!process.env.OYAMA_LIVE_RECOVER_DATA, 'Requires a previously rendered Continue fixture.');
test('reopens the real blended Continue output', async () => {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_DATA_DIR: process.env.OYAMA_LIVE_RECOVER_DATA!,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.OYAMA_MOCK;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('.app')).toBeVisible({ timeout: 30000 });
    const result = await page.evaluate(async () => {
      const snapshot = await window.oyama.load();
      return snapshot.assets.find((asset) => asset.name === 'source.mp4-continued.mp4');
    });
    expect(result?.media?.video?.frames).toBe(64);
    expect(result?.media?.audio?.codec).toBe('aac');
  } finally {
    await app.close();
  }
});
