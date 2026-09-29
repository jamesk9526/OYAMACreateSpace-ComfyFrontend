import { _electron as electron, expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

test('Movie imports and hovers media, drops clips onto tracks, scrubs, and restores its timeline', async () => {
  const dataDir = path.resolve('artifacts/e2e', `movie-${Date.now()}`);
  const folder = path.join(dataDir, 'source');
  await fs.mkdir(path.join(folder, 'nested'), { recursive: true });
  await fs.copyFile('public/mock/reference.png', path.join(folder, 'first.png'));
  await fs.copyFile('public/mock/reference.png', path.join(folder, 'nested', 'second.png'));
  await fs.copyFile('public/mock/sample.mp4', path.join(folder, 'sample.mp4'));
  await fs.writeFile(path.join(folder, 'ignore.txt'), 'not media');
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_MOCK: '1',
    OYAMA_DATA_DIR: dataDir,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    await page.locator('.navitem').filter({ hasText: 'Movie' }).click();
    await app.evaluate(
      ({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      },
      path.join(folder, 'first.png'),
    );
    await page.getByRole('button', { name: 'Import files' }).click();
    await expect(page.locator('.movie-media-item')).toHaveCount(1);
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, folder);
    await page.getByRole('button', { name: 'Choose folder' }).click();
    await expect(page.locator('.movie-media-item')).toHaveCount(4);
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.id = 'movie-drop-fixture';
      document.body.append(input);
    });
    await page.locator('#movie-drop-fixture').setInputFiles(path.join(folder, 'first.png'));
    await page.evaluate(() => {
      const file = (document.querySelector('#movie-drop-fixture') as HTMLInputElement).files![0];
      const transfer = new DataTransfer();
      transfer.items.add(file);
      document
        .querySelector('.movie-bin-body')!
        .dispatchEvent(
          new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }),
        );
    });
    await expect(page.locator('.movie-media-item')).toHaveCount(5);
    const videoItem = page.locator('.movie-media-item').filter({ hasText: 'sample.mp4' });
    await videoItem.hover();
    await expect
      .poll(() => videoItem.locator('video').evaluate((video: HTMLVideoElement) => !video.paused))
      .toBe(true);
    const selectedName = await page
      .locator('.movie-media-item')
      .filter({ hasText: 'first.png' })
      .first()
      .locator('.movie-media-name')
      .innerText();
    await page.locator('.movie-media-item').filter({ hasText: 'first.png' }).first().click();
    await expect(page.locator('.movie-preview-frame img')).toBeVisible();
    await page.getByRole('button', { name: 'Properties', exact: true }).click();
    await expect(page.locator('.movie-sidebar-content')).toContainText(selectedName);
    await page.getByRole('button', { name: 'Media', exact: true }).click();
    await videoItem.dragTo(page.locator('.movie-track').first(), {
      targetPosition: { x: 3, y: 12 },
    });
    await expect(page.locator('.movie-timeline-clip')).toHaveCount(1);
    await page.locator('.movie-timeline-clip').click();
    await page.getByRole('button', { name: 'Properties', exact: true }).click();
    await expect(page.locator('.movie-sidebar-content')).toContainText('Video clip');
    await page.getByLabel('Duration', { exact: true }).fill('2');
    await page.getByLabel('Duration', { exact: true }).blur();
    await page.getByLabel('Source in').fill('0.5');
    await page.getByLabel('Source in').blur();
    await page.getByLabel('Lock clip').check();
    await expect(page.getByRole('button', { name: 'Delete selected clip' })).toBeDisabled();
    await page.getByLabel('Lock clip').uncheck();
    await page.getByRole('button', { name: 'Media', exact: true }).click();
    await page.locator('.movie-scrubber').fill('0.5');
    await expect(page.getByRole('textbox', { name: 'Current movie timecode' })).toHaveValue(
      '00:00:00:12',
    );
    const sourceTimeBeforeStep = await page
      .locator('.movie-preview-frame video')
      .evaluate((video: HTMLVideoElement) => video.currentTime);
    await page.getByRole('button', { name: 'Next frame' }).click();
    await expect(page.getByRole('textbox', { name: 'Current movie timecode' })).toHaveValue(
      '00:00:00:13',
    );
    await expect
      .poll(() =>
        page
          .locator('.movie-preview-frame video')
          .evaluate((video: HTMLVideoElement) => video.currentTime),
      )
      .toBeGreaterThan(sourceTimeBeforeStep + 0.03);
    await expect
      .poll(() =>
        page
          .locator('.movie-preview-frame video')
          .evaluate((video: HTMLVideoElement) => video.currentTime),
      )
      .toBeGreaterThan(1);
    await page.getByRole('button', { name: 'Previous frame' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const clipWidthBeforeZoom = await page
      .locator('.movie-timeline-clip')
      .evaluate((element) => element.getBoundingClientRect().width);
    await page.getByRole('button', { name: 'Zoom in timeline' }).click();
    await expect
      .poll(() =>
        page
          .locator('.movie-timeline-clip')
          .evaluate((element) => element.getBoundingClientRect().width),
      )
      .toBeGreaterThan(clipWidthBeforeZoom);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
    await expect
      .poll(() =>
        page.locator('.movie-preview-frame video').evaluate((video: HTMLVideoElement) => {
          const box = video.getBoundingClientRect();
          return Math.abs(box.width / box.height - video.videoWidth / video.videoHeight);
        }),
      )
      .toBeLessThan(0.02);
    await page.screenshot({ path: 'artifacts/movie-import-1440.png' });
    expect(
      await page
        .locator('.movie-media-grid')
        .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length),
    ).toBe(2);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760));
    const separator = await page
      .getByRole('separator', { name: 'Resize preview and timeline' })
      .boundingBox();
    if (!separator) throw new Error('Movie timeline resize separator is missing');
    await page.mouse.move(separator.x + separator.width / 2, separator.y + separator.height / 2);
    await page.mouse.down();
    await page.mouse.move(separator.x + separator.width / 2, 520, { steps: 6 });
    await page.mouse.up();
    await expect
      .poll(() =>
        page.locator('.movie-preview-frame video').evaluate((video: HTMLVideoElement) => {
          const box = video.getBoundingClientRect();
          return Math.abs(box.width / box.height - video.videoWidth / video.videoHeight);
        }),
      )
      .toBeLessThan(0.02);
    await page.screenshot({ path: 'artifacts/movie-import-1100.png' });
    await page.getByRole('button', { name: 'Collapse right panel' }).click();
    await expect(page.locator('.right-dock .rightpanel')).toHaveCount(0);
    await page.screenshot({ path: 'artifacts/movie-dock-collapsed-1100.png' });
    await page.getByRole('button', { name: 'Restore right panel' }).click();
    const overflow = await page.locator('.movie-workspace').evaluate((element) => ({
      horizontal: element.scrollWidth > element.clientWidth,
      vertical: element.scrollHeight > element.clientHeight,
    }));
    expect(overflow).toEqual({ horizontal: false, vertical: false });
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    const reopened = await app.firstWindow();
    await reopened.getByText('Mock ComfyUI', { exact: true }).waitFor();
    await reopened.locator('.navitem').filter({ hasText: 'Movie' }).click();
    await expect(reopened.locator('.movie-timeline-clip')).toHaveCount(1);
  } finally {
    await app.close();
  }
});
