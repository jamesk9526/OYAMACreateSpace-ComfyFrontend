import fs from 'node:fs/promises';
import path from 'node:path';
import { nodeChoices, type ObjectInfo } from '../shared/modules';
import { photoEditDefaults } from '../src/modules/photo-edit/definition';
import { compilePhotoEdit } from '../src/modules/photo-edit/workflow';

async function main() {
  const response = await fetch('http://127.0.0.1:8188/object_info');
  if (!response.ok) throw new Error(`ComfyUI ${response.status}`);
  const info = (await response.json()) as ObjectInfo;
  const sourceImage = '11111111-1111-4111-8111-111111111111';
  const referenceId = '22222222-2222-4222-8222-222222222222';
  const name = nodeChoices(info, 'LoadImage', 'image')[0];
  if (!name) throw new Error('Need an existing ComfyUI input image.');
  for (const profile of ['turbo', 'quality'] as const) {
    const graph = compilePhotoEdit(
      {
        ...photoEditDefaults,
        sourceImage,
        references: [referenceId],
        profile,
        width: 512,
        height: 320,
        prompt: 'Change the green cube to blue. Preserve the background.',
      },
      info,
      [
        { id: sourceImage, name, kind: 'image' },
        { id: referenceId, name, kind: 'image' },
      ],
      12345,
      'CreateSpace/photo-edit-validation',
    );
    const target = path.resolve(`artifacts/live/photo-edit-${profile}.json`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(graph, null, 2));
    console.log(target);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
