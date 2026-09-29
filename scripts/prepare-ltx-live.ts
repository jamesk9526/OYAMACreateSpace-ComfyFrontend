import fs from 'node:fs/promises';
import path from 'node:path';
import type { ObjectInfo, WorkflowUpload } from '../shared/modules';
import { ltxDefaults } from '../src/modules/ltx/definition';
import { compileLtx } from '../src/modules/ltx/workflow';

async function main() {
  const endpoint = process.env.COMFY_URL || 'http://127.0.0.1:8188';
  const response = await fetch(`${endpoint}/object_info`);
  if (!response.ok) throw new Error(`ComfyUI ${response.status}`);
  const info = (await response.json()) as ObjectInfo;
  const msr = process.argv.includes('--msr');
  let msrUpload: WorkflowUpload | null = null;
  if (msr) {
    const result = JSON.parse(
      await fs.readFile('artifacts/live-ltx-image-quality-result.json', 'utf8'),
    ) as { job: { promptId: string }; assets: { id: string; kind: string }[] };
    const history = (await (
      await fetch(`${endpoint}/history/${result.job.promptId}`)
    ).json()) as Record<
      string,
      { prompt: [unknown, unknown, Record<string, { inputs: { image?: string } }>] }
    >;
    const name = history[result.job.promptId]?.prompt?.[2]?.['20']?.inputs.image;
    const id = result.assets.find((asset) => asset.kind === 'image')?.id;
    if (!id || !name) throw new Error('Existing live LTX first-frame upload was not found.');
    msrUpload = { id, name, kind: 'image' };
  }
  await fs.mkdir('artifacts/live', { recursive: true });
  for (const profile of ['turbo', 'quality'] as const) {
    const settings = {
      ...ltxDefaults,
      profile,
      prompt: 'A quiet observatory under a night sky, subtle camera drift, wind in the trees.',
      width: 512,
      height: 320,
      duration: 1,
      ...(msrUpload ? { msr: { ...ltxDefaults.msr, enabled: true, pic1: msrUpload.id } } : {}),
    };
    const graph = compileLtx(
      settings,
      info,
      msrUpload ? [msrUpload] : ([] as WorkflowUpload[]),
      314159,
      `CreateSpace/validation-ltx-${profile}${msr ? '-msr' : ''}`,
    );
    const filename = path.resolve(`artifacts/live/ltx-${profile}${msr ? '-msr' : ''}.json`);
    await fs.writeFile(filename, JSON.stringify(graph, null, 2));
    console.log(filename);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
