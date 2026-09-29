import fs from 'node:fs/promises';
import path from 'node:path';
import { nodeChoices, type ObjectInfo } from '../shared/modules';
import { continueDefaults } from '../src/modules/continue/definition';
import { compileContinue } from '../src/modules/continue/workflow';
import { MediaService } from '../electron/main/media';

async function main() {
  const response = await fetch('http://127.0.0.1:8188/object_info');
  if (!response.ok) throw new Error(`ComfyUI ${response.status}`);
  const info = (await response.json()) as ObjectInfo;
  const firstFrame = '11111111-1111-4111-8111-111111111111';
  const name = nodeChoices(info, 'LoadImage', 'image')[0];
  if (!name) throw new Error('Need an existing ComfyUI input image.');
  const motion = process.argv.includes('--motion');
  const latent = process.argv.includes('--latent-context');
  const chain = process.argv.includes('--chain');
  let sourceVideo = '22222222-2222-4222-8222-222222222222';
  let contextUploadPath: string | undefined;
  let contextName = '';
  if (motion) {
    const evidence = JSON.parse(
      await fs.readFile(
        latent
          ? chain
            ? 'artifacts/continue-motion-latent-evidence.json'
            : 'artifacts/h3-text-checkpoint-evidence.json'
          : 'artifacts/continue-selected-evidence.json',
        'utf8',
      ),
    );
    if (latent) {
      sourceVideo = evidence.job.assetIds[0];
      const context = path.resolve(
        'artifacts/live-zimage-app/contexts',
        evidence.job.projectId,
        `${evidence.job.id}.safetensors`,
      );
      const form = new FormData();
      form.append('image', new Blob([await fs.readFile(context)]), `${sourceVideo}.safetensors`);
      form.append('type', 'output');
      form.append('subfolder', 'CreateSpaceContext');
      form.append('overwrite', 'true');
      const uploaded = await fetch('http://127.0.0.1:8188/upload/image', {
        method: 'POST',
        body: form,
      });
      if (!uploaded.ok) throw new Error(await uploaded.text());
      const input = (await uploaded.json()) as { name: string; subfolder: string };
      contextUploadPath = `${input.subfolder}/${input.name}`;
    }
    const target = path.resolve('artifacts/live/motion-context-validation.mp4');
    await new MediaService().prepareMotionContext(
      path.resolve(
        'artifacts/live-zimage-app/media',
        evidence.job.projectId,
        `${latent ? sourceVideo : evidence.job.snapshot.sourceVideo}.mp4`,
      ),
      target,
      22,
      512,
      288,
    );
    const form = new FormData();
    form.append(
      'image',
      new Blob([await fs.readFile(target)], { type: 'video/mp4' }),
      'createspace-motion-validation.mp4',
    );
    const uploaded = await fetch('http://127.0.0.1:8188/upload/image', {
      method: 'POST',
      body: form,
    });
    if (!uploaded.ok) throw new Error(await uploaded.text());
    const input = (await uploaded.json()) as { name: string; subfolder?: string };
    contextName = input.subfolder ? `${input.subfolder}/${input.name}` : input.name;
  }
  for (const quality of ['turbo8', 'native'] as const) {
    const graph = compileContinue(
      {
        ...continueDefaults,
        sourceVideo: motion ? sourceVideo : firstFrame,
        firstFrame: motion ? null : firstFrame,
        method: motion ? 'motion' : 'last',
        contextSourceAsset: latent ? sourceVideo : undefined,
        contextUploadPath,
        quality,
        width: 512,
        height: motion ? 288 : 320,
        duration: 1,
        prompt: 'A glass cube gently rotates on the plinth. Same studio lighting.',
      },
      info,
      motion
        ? [{ id: sourceVideo, name: contextName, kind: 'video' }]
        : [{ id: firstFrame, name, kind: 'image' }],
      12345,
      'CreateSpace/continue-validation',
    );
    const target = path.resolve(
      `artifacts/live/continue-${motion ? 'motion-' : ''}${latent ? (chain ? 'latent-chain-' : 'latent-') : ''}${quality}.json`,
    );
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(graph, null, 2));
    console.log(target);
  }
  console.log('LIVE_QUEUE', await (await fetch('http://127.0.0.1:8188/queue')).text());
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
