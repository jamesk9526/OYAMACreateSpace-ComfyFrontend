import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';

test('workspace docks resize, collapse, swap and reset at both supported sizes', async () => {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_MOCK: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/e2e', `layout-${Date.now()}`),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Tools' })).toHaveCount(0);
    await page.keyboard.press('Alt');
    await expect(page.getByRole('button', { name: 'File', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Collapse left panel' }).click();
    await expect(page.getByRole('button', { name: 'Restore left panel' })).toBeVisible();
    await page.getByRole('button', { name: 'Restore left panel' }).click();
    await page.getByRole('button', { name: 'Move navigation to opposite side' }).click();
    await expect(page.locator('.right-dock .leftpanel')).toBeVisible();
    await page
      .getByRole('button', { name: 'Move navigation to opposite side' })
      .dragTo(page.locator('.left-dock'));
    await expect(page.locator('.left-dock .leftpanel')).toBeVisible();
    await page.getByRole('button', { name: 'Move navigation to opposite side' }).click();
    await page.getByRole('separator', { name: 'Resize right panel' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem('createspace.workspace-layouts.v1') || '{}').h3
              ?.rightWidth,
        ),
      )
      .toBe(302);
    await page.reload();
    await expect(page.locator('.right-dock .leftpanel')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem('createspace.workspace-layouts.v1') || '{}').h3
              ?.rightWidth,
        ),
      )
      .toBe(302);
    for (const [width, height] of [
      [1440, 900],
      [1100, 760],
    ] as const) {
      await app.evaluate(
        ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size[0], size[1]),
        [width, height],
      );
      await page.screenshot({ path: `artifacts/layout-${width}.png` });
      await expect(page.locator('.center')).toBeVisible();
    }
    await page.evaluate(() => {
      const layouts = JSON.parse(localStorage.getItem('createspace.workspace-layouts.v1') || '{}');
      layouts.h3 = { ...layouts.h3, leftWidth: 600, rightWidth: 600 };
      localStorage.setItem('createspace.workspace-layouts.v1', JSON.stringify(layouts));
    });
    await page.reload();
    await expect
      .poll(() =>
        page.locator('.center').evaluate((element) => element.getBoundingClientRect().width),
      )
      .toBeGreaterThanOrEqual(360);
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('createspace.workspace-layouts.v1') || '{}').h3,
      ),
    ).toMatchObject({ leftWidth: 600, rightWidth: 600 });
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Reset workspace layout' }).click();
    await expect(page.locator('.left-dock .leftpanel')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});
