import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';

test('slash prompt library searches, filters, inserts at cursor and persists authored text', async () => {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_MOCK: '1',
    OYAMA_DATA_DIR: path.resolve('artifacts/e2e', `prompt-parts-${Date.now()}`),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    const input = page.getByRole('textbox', { name: 'Prompt', exact: true });
    await input.fill('A quiet room. //');
    await expect(page.getByRole('listbox', { name: 'Prompt parts' })).toBeVisible();
    await page.screenshot({ path: 'artifacts/prompt-parts-1440.png' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760));
    // Resize closes a detached popup; editing reopens it at the new input position.
    await input.press('Backspace');
    await input.pressSequentially('/');
    await page.getByLabel('Prompt part category').selectOption('Camera movement');
    await input.pressSequentially('slow push');
    await expect(page.getByRole('option', { name: /Slow push in/ })).toBeVisible();
    await page.screenshot({ path: 'artifacts/prompt-parts-1100.png' });
    await input.press('Enter');
    await expect(input).toHaveValue(
      'A quiet room. The camera slowly pushes toward the subject, maintaining steady focus. ',
    );
    await expect(page.getByRole('listbox', { name: 'Prompt parts' })).toHaveCount(0);
    const state = await page.evaluate(() => window.oyama.load());
    expect(state.jobs).toHaveLength(0);
    await input.fill('Before //rack After');
    for (let index = 0; index < 6; index++) await input.press('ArrowLeft');
    await expect(page.getByText('Search: rack', { exact: true })).toBeVisible();
    await input.press('ArrowDown');
    await input.press('Tab');
    await expect(input).toHaveValue(
      'Before Focus shifts gradually from the foreground detail to the subject in the background. After',
    );
    await input.fill('//zzzzzz');
    await expect(
      page.getByText('No matching parts. Try another search or category.'),
    ).toBeVisible();
    await input.press('Escape');
    await expect(page.getByRole('listbox', { name: 'Prompt parts' })).toHaveCount(0);
    await input.fill('https://example.com');
    await expect(page.getByRole('listbox', { name: 'Prompt parts' })).toHaveCount(0);
    const tools = [
      ['ZImage · Generate', 'Image prompt'],
      ['LTX 2.5 · Text to Video', 'LTX prompt'],
      ['LTX Ripple · Video Edit', 'Ripple prompt'],
      ['Photo Edit · FireRed', 'Photo Edit prompt'],
      ['Continue / Extend', 'Continue next action'],
    ];
    for (const [tool, label] of tools) {
      await page.getByLabel('Tool mode').selectOption({ label: tool });
      const prompt = page.getByRole('textbox', { name: label, exact: true });
      await prompt.fill('//');
      await page.getByLabel('Prompt part category').selectOption('Lighting');
      await page.getByRole('option', { name: /Soft window light/ }).click();
      await expect(prompt).toHaveValue(
        'Soft window light wraps around the subject with gentle shadows and natural skin tones. ',
      );
    }
    await page.getByRole('button', { name: 'Close window' }).click();
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.getByLabel('Tool mode').selectOption({ label: 'Continue / Extend' });
    await expect(page.getByLabel('Continue next action')).toHaveValue(
      'Soft window light wraps around the subject with gentle shadows and natural skin tones. ',
    );
    await page.getByRole('button', { name: 'Close window' }).click();
  } finally {
    await app.close();
  }
});
