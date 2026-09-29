import fs from 'node:fs/promises';
import path from 'node:path';
import { compileH3 } from '../src/modules/h3/workflow';
import { h3Defaults } from '../src/modules/h3/definition';
import { compileContinue } from '../src/modules/continue/workflow';
import { continueDefaults } from '../src/modules/continue/definition';
import { compileRipple } from '../src/modules/ripple/workflow';
import { rippleDefaults } from '../src/modules/ripple/definition';
import { compileZImage } from '../src/modules/zimage/workflow';
import { zImageDefaults } from '../src/modules/zimage/definition';
import { compileLtx } from '../src/modules/ltx/workflow';
import { ltxDefaults } from '../src/modules/ltx/definition';
import { compilePhotoEdit } from '../src/modules/photo-edit/workflow';
import { photoEditDefaults } from '../src/modules/photo-edit/definition';
import { nodeChoices, type ObjectInfo } from '../shared/modules';
import { applyGpuRouting } from '../shared/gpu-routing';
async function main() {
  const endpoint = 'http://127.0.0.1:8188';
  const [info, stats] = await Promise.all([
    fetch(`${endpoint}/object_info`).then((response) => response.json()) as Promise<ObjectInfo>,
    fetch(`${endpoint}/system_stats`).then((response) => response.json()) as Promise<{
      devices: { index: number }[];
    }>,
  ]);
  const imageId = '11111111-1111-4111-8111-111111111111',
    videoId = '22222222-2222-4222-8222-222222222222';
  const image = nodeChoices(info, 'LoadImage', 'image')[0],
    video = nodeChoices(info, 'LoadVideo', 'file')[0];
  if (!image || !video) throw new Error('Preflight needs existing server image/video inputs.');
  const uploads = [
    { id: imageId, kind: 'image' as const, name: image },
    { id: videoId, kind: 'video' as const, name: video },
  ];
  const routing = {
    preset: 'custom' as const,
    diffusion: 'gpu:0',
    textEncoder: 'gpu:0',
    videoVae: 'gpu:1',
    audioVae: 'gpu:1',
  };
  await fs.mkdir('artifacts/live/settings', { recursive: true });
  async function save(name: string, graph: Parameters<typeof applyGpuRouting>[0]) {
    const target = path.resolve(`artifacts/live/settings/${name}.json`);
    await fs.writeFile(
      target,
      JSON.stringify(applyGpuRouting(graph, info, routing, stats.devices).graph, null, 2),
    );
    console.log(target);
  }
  for (const quality of ['turbo8', 'native'] as const) {
    const steps = quality === 'turbo8' ? 6 : 12;
    for (const mode of ['text', 'image', 'reference'] as const)
      await save(
        `h3-${mode}-${quality}`,
        compileH3(
          {
            ...h3Defaults,
            prompt: 'The glass cube rotates. Quiet room ambience.',
            width: 512,
            height: 288,
            duration: 1,
            quality,
            nativeDefaults: false,
            steps,
            mode,
            refImageSize: 'max',
            firstFrame: mode === 'image' ? imageId : null,
            references: mode === 'reference' ? [imageId] : [],
          },
          info,
          uploads,
          31000 + steps,
          `CreateSpace/preflight-${mode}`,
        ),
      );
    for (const method of ['last', 'selected', 'motion'] as const)
      await save(
        `continue-${method}-${quality}`,
        compileContinue(
          {
            ...continueDefaults,
            prompt: 'The glass cube rotates. Quiet room ambience.',
            sourceVideo: videoId,
            firstFrame: method === 'motion' ? null : imageId,
            width: 512,
            height: 288,
            duration: 1,
            quality,
            nativeDefaults: false,
            steps,
            method,
            contextFrames: 22,
            contextMode: 'frames',
          },
          info,
          uploads,
          31000 + steps,
          `CreateSpace/preflight-${method}`,
        ),
      );
  }
  for (const quality of ['turbo8', 'native'] as const)
    await save(
      `continue-motion-latent-${quality}`,
      compileContinue(
        {
          ...continueDefaults,
          prompt: 'The glass cube rotates. Quiet room ambience.',
          sourceVideo: videoId,
          width: 512,
          height: 288,
          duration: 1,
          quality,
          nativeDefaults: false,
          steps: quality === 'turbo8' ? 6 : 12,
          method: 'motion',
          contextFrames: 22,
          contextMode: 'latent',
          contextSourceAsset: videoId,
          contextUploadPath: `CreateSpaceContext/${videoId}.safetensors`,
        },
        info,
        uploads,
        31000,
        'CreateSpace/preflight-latent',
      ),
    );
  await save(
    'ripple-chunk',
    compileRipple(
      {
        ...rippleDefaults,
        sourceVideo: videoId,
        replacementFrame: imageId,
        width: 512,
        height: 288,
        duration: 2,
        chunkStartFrame: 36,
        chunkSourceFrames: 48,
        sourceDuration: 4,
        preparedFps: 24,
      },
      info,
      uploads,
      32000,
      'CreateSpace/preflight-ripple-chunk',
    ),
  );
  await save(
    'zimage-turbo-routed',
    compileZImage(
      {
        ...zImageDefaults,
        prompt: 'A green glass cube on a studio plinth.',
        width: 256,
        height: 256,
      },
      info,
      [],
      33000,
      'CreateSpace/preflight-zimage-routed',
    ),
  );
  for (const profile of ['turbo', 'quality'] as const) {
    for (const mode of ['text', 'image'] as const)
      await save(
        `ltx-${profile}-${mode}-routed`,
        compileLtx(
          {
            ...ltxDefaults,
            profile,
            mode,
            firstFrame: mode === 'image' ? imageId : null,
            width: 512,
            height: 320,
            duration: 1,
            prompt: 'A quiet studio and slowly rotating green glass cube.',
          },
          info,
          uploads,
          33000,
          'CreateSpace/preflight-ltx-routed',
        ),
      );
    await save(
      `photo-edit-${profile}-routed`,
      compilePhotoEdit(
        {
          ...photoEditDefaults,
          profile,
          sourceImage: imageId,
          references: [imageId],
          width: 512,
          height: 320,
          prompt: 'Change the green cube to blue. Preserve the background.',
        },
        info,
        uploads,
        33000,
        'CreateSpace/preflight-photo-routed',
      ),
    );
  }
  await save(
    'ltx-quality-msr-routed',
    compileLtx(
      {
        ...ltxDefaults,
        profile: 'quality',
        mode: 'image',
        firstFrame: imageId,
        msr: { ...ltxDefaults.msr, enabled: true, pic1: imageId },
        width: 512,
        height: 320,
        duration: 1,
        prompt: 'A quiet studio and slowly rotating green glass cube.',
      },
      info,
      uploads,
      33000,
      'CreateSpace/preflight-ltx-msr-routed',
    ),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
