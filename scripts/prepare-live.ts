import fs from 'node:fs/promises';
import path from 'node:path';
import { compileH3 } from '../src/modules/h3/workflow';
import { h3Defaults } from '../src/modules/h3/definition';
import type { ObjectInfo } from '../shared/modules';

async function main() {
  const endpoint = process.env.COMFY_URL || 'http://127.0.0.1:8188';
  const response = await fetch(`${endpoint}/object_info`);
  if (!response.ok) throw new Error(`ComfyUI ${response.status}`);
  const info = (await response.json()) as ObjectInfo;
  const referenceId = '11111111-1111-4111-8111-111111111111';
  const form = new FormData();
  form.append(
    'image',
    new Blob([await fs.readFile('public/mock/reference.png')], { type: 'image/png' }),
    'createspace-test-reference.png',
  );
  form.append('overwrite', 'true');
  const uploaded = await fetch(`${endpoint}/upload/image`, { method: 'POST', body: form });
  if (!uploaded.ok) throw new Error(await uploaded.text());
  const input = (await uploaded.json()) as { name: string; subfolder?: string };
  const name = input.subfolder ? `${input.subfolder}/${input.name}` : input.name;
  await fs.mkdir('artifacts/live', { recursive: true });
  for (const mode of ['text', 'image', 'reference'] as const) {
    const values = {
      ...h3Defaults,
      mode,
      refImageSize: process.argv.includes('--maximum-identity')
        ? ('max' as const)
        : ('match' as const),
      prompt:
        'A small lime green cube rotates slowly on a dark studio table. A locked camera, soft studio light. Gentle room ambience.',
      width: 256,
      height: 256,
      duration: 1,
      quality: 'turbo8' as const,
      firstFrame: mode === 'image' ? referenceId : null,
      references: mode === 'reference' ? [referenceId] : [],
    };
    const graph = compileH3(
      values,
      info,
      mode === 'text' ? [] : [{ id: referenceId, kind: 'image', name }],
      42,
      `CreateSpace/validation-${mode}`,
    );
    const filename = path.resolve(
      `artifacts/live/h3-${mode}${process.argv.includes('--maximum-identity') ? '-max' : ''}.json`,
    );
    await fs.writeFile(filename, JSON.stringify(graph, null, 2));
    console.log(filename);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
