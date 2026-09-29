import fs from 'node:fs/promises';
import path from 'node:path';
import type { ObjectInfo } from '../shared/modules';
import { zImageDefaults } from '../src/modules/zimage/definition';
import { compileZImage } from '../src/modules/zimage/workflow';

async function main() {
  const endpoint = process.env.COMFY_URL || 'http://127.0.0.1:8188';
  const response = await fetch(`${endpoint}/object_info`);
  if (!response.ok) throw new Error(`ComfyUI ${response.status}`);
  const info = (await response.json()) as ObjectInfo;
  await fs.mkdir('artifacts/live', { recursive: true });
  for (const variant of ['turbo', 'base'] as const) {
    const graph = compileZImage(
      {
        ...zImageDefaults,
        variant,
        prompt:
          'A precise lime green glass cube on a matte charcoal plinth, soft studio light, centered composition.',
        width: 256,
        height: 256,
        steps: variant === 'turbo' ? 8 : 40,
        cfg: variant === 'turbo' ? 1 : 4,
      },
      info,
      [],
      314159,
      `CreateSpace/validation-zimage-${variant}`,
    );
    const filename = path.resolve(`artifacts/live/zimage-${variant}.json`);
    await fs.writeFile(filename, JSON.stringify(graph, null, 2));
    console.log(filename);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
