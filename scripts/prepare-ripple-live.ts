import fs from 'node:fs/promises';
import path from 'node:path';
import { nodeChoices, type ObjectInfo } from '../shared/modules';
import { rippleDefaults } from '../src/modules/ripple/definition';
import { compileRipple } from '../src/modules/ripple/workflow';

async function main() {
  const response = await fetch('http://127.0.0.1:8188/object_info');
  if (!response.ok) throw new Error(`ComfyUI ${response.status}`);
  const info = (await response.json()) as ObjectInfo;
  const sourceVideo = '11111111-1111-4111-8111-111111111111';
  const replacementFrame = '22222222-2222-4222-8222-222222222222';
  const sourceName = nodeChoices(info, 'LoadVideo', 'file')[0];
  const frameName = nodeChoices(info, 'LoadImage', 'image')[0];
  if (!sourceName || !frameName)
    throw new Error('Validation needs an existing ComfyUI input image and video.');
  const graph = compileRipple(
    {
      ...rippleDefaults,
      sourceVideo,
      replacementFrame,
      width: 512,
      height: 320,
      duration: 2,
      sourceDuration: 2,
      sourceFps: 24,
      preparedFps: 24,
    },
    info,
    [
      { id: sourceVideo, name: sourceName, kind: 'video' },
      { id: replacementFrame, name: frameName, kind: 'image' },
    ],
    314159,
    'CreateSpace/ripple-validation',
  );
  const target = path.resolve('artifacts/live/ripple.json');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(graph, null, 2));
  console.log(target);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
