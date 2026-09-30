import { _electron as electron, expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

async function texturedTriangle(file: string) {
  const positions = Buffer.from(new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]).buffer);
  const uv = Buffer.from(new Float32Array([0, 0, 1, 0, 0.5, 1]).buffer);
  const png = await fs.readFile('public/mock/reference.png');
  const data = Buffer.concat([positions, uv, png, Buffer.alloc((4 - (png.length % 4)) % 4)]);
  const json = Buffer.from(
    JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }],
      buffers: [{ byteLength: data.length }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: positions.length },
        { buffer: 0, byteOffset: positions.length, byteLength: uv.length },
        { buffer: 0, byteOffset: positions.length + uv.length, byteLength: png.length },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: 'VEC3',
          min: [-1, -1, 0],
          max: [1, 1, 0],
        },
        { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' },
      ],
      images: [{ bufferView: 2, mimeType: 'image/png' }],
      textures: [{ source: 0 }],
      materials: [
        {
          doubleSided: true,
          pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 },
        },
      ],
    }),
  );
  const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + padded.length + data.length, 8);
  header.writeUInt32LE(padded.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const bin = Buffer.alloc(8);
  bin.writeUInt32LE(data.length, 0);
  bin.writeUInt32LE(0x004e4942, 4);
  await fs.writeFile(file, Buffer.concat([header, padded, bin, data]));
}

test('managed textured GLB loads, orbits and reopens after restart', async () => {
  const directory = path.resolve('artifacts/e2e', `model-preview-${Date.now()}`);
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, 'textured-triangle.glb');
  await texturedTriangle(file);
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    OYAMA_MOCK: '1',
    OYAMA_DATA_DIR: path.join(directory, 'data'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, file);
    await page
      .locator('.navitem')
      .filter({ hasText: /^Assets$/ })
      .click();
    await page.getByRole('button', { name: 'Import media', exact: true }).click();
    await page.locator('.asset-card').filter({ hasText: 'textured-triangle.glb' }).click();
    await expect(page.locator('.model-preview-status')).toContainText('1 triangles · Drag');
    const canvas = page.locator('.model-viewport canvas');
    await expect(canvas).toBeVisible();
    const before = await canvas.screenshot();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 30, { steps: 10 });
    await page.mouse.up();
    await expect.poll(async () => Buffer.compare(before, await canvas.screenshot())).not.toBe(0);
    const absent = await page.evaluate(
      async () => (await fetch('oyama://media/00000000-0000-4000-8000-000000000000')).status,
    );
    expect(absent).toBe(404);
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await expect(page.getByText('Mock ComfyUI', { exact: true })).toBeVisible();
    await page
      .locator('.navitem')
      .filter({ hasText: /^Assets$/ })
      .click();
    await page.locator('.asset-card').filter({ hasText: 'textured-triangle.glb' }).click();
    await expect(page.locator('.model-preview-status')).toContainText('1 triangles · Drag');
  } finally {
    await app.close();
  }
});
