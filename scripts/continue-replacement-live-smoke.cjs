// Real app-owned beat render with blend and typed record changes. Reuses a persisted sequence.
const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const env = { ...process.env, OYAMA_MOCK: '0', OYAMA_TEST: '1', OYAMA_DATA_DIR: path.resolve('artifacts/live-zimage-app') };
delete env.ELECTRON_RUN_AS_NODE;
const sourceId = '183efd7b-ae56-4a83-b95c-9dc65c55f975';
const projectId = '3789f1a8-dc9b-433e-9951-924385027fd5';
const scriptName = 'Live owned replacement and blend 20260929';

async function main() {
  const launch = () => electron.launch({ args: ['.'], env });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByText('ComfyUI Connected', { exact: true }).waitFor({ timeout: 30000 });
    let script = (await page.evaluate((projectId) => window.oyama.listContinuationScripts(projectId), projectId)).find((item) => item.name === scriptName);
    if (!script) {
      const state = await page.evaluate(() => window.oyama.load());
      const queue = await fetch(state.settings.comfyUrl + '/queue').then((response) => response.json());
      if (queue.queue_running.length || queue.queue_pending.length) throw new Error('ComfyUI queue is busy.');
      if (!state.assets.find((item) => item.id === sourceId && !item.missing)) throw new Error('Managed source unavailable.');
      script = await page.evaluate(async ({ projectId, sourceId, scriptName }) => {
        const character = await window.oyama.saveRecord({ id: crypto.randomUUID(), kind: 'character', name: 'Mara replacement test', description: 'Copper hair and a green coat', identityNotes: 'Keep the same face', assetIds: [] });
        const location = await window.oyama.saveRecord({ id: crypto.randomUUID(), kind: 'location', name: 'Atrium replacement test', description: 'Stone arches', environment: 'Indoor stone atrium', lighting: 'Soft dawn side light', assetIds: [] });
        return window.oyama.saveContinuationScript({ id: crypto.randomUUID(), projectId, revision: 0, name: scriptName, sourceVideo: sourceId, continuity: { dialoguePolicy: 'none', audioCarry: false, blendFrames: 8 }, settings: { width: 512, height: 288, quality: 'turbo8', duration: 1, steps: 8, nativeDefaults: false, seed: '32034', prompt: '', sourceVideo: sourceId }, beats: [{ id: crypto.randomUUID(), name: 'Identity and place change', prompt: 'The subject turns slowly toward the camera.', camera: 'Locked medium framing', duration: 1, method: 'last', selectedSeconds: 0, source: { kind: 'original' }, replacements: { characterId: character.id, locationId: location.id } }] });
      }, { projectId, sourceId, scriptName });
    }
    let state = await page.evaluate(() => window.oyama.load());
    let parent = state.jobs.find((job) => job.sequence?.script.id === script.id);
    if (!parent) parent = await page.evaluate(({ id, beatId }) => window.oyama.runContinuationScript(id, beatId), { id: script.id, beatId: script.beats[0].id });
    console.log(`SEQUENCE ${parent.id}`);
    const deadline = Date.now() + 25 * 60 * 1000;
    let prior = '';
    while (Date.now() < deadline) {
      state = await page.evaluate(() => window.oyama.load());
      parent = state.jobs.find((job) => job.id === parent.id);
      if (`${parent.status}:${parent.message}` !== prior) {
        prior = `${parent.status}:${parent.message}`;
        const children = state.jobs.filter((job) => job.snapshot.sequenceParentId === parent.id);
        console.log(`${prior} children=${children.map((job) => `${job.status}:${job.promptId || 'pending'}`).join(',')}`);
      }
      if (parent.status === 'complete') break;
      if (['error', 'unknown', 'cancelled'].includes(parent.status)) throw new Error(parent.message);
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    if (parent.status !== 'complete') throw new Error('Sequence still running; inspect its persisted prompt before retrying.');
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByText('ComfyUI Connected', { exact: true }).waitFor({ timeout: 30000 });
    const result = await page.evaluate(async ({ projectId, scriptId }) => {
      const state = await window.oyama.load();
      const script = (await window.oyama.listContinuationScripts(projectId)).find((item) => item.id === scriptId);
      const parent = state.jobs.find((job) => job.sequence?.script.id === scriptId);
      const child = state.jobs.find((job) => job.snapshot.sequenceParentId === parent.id);
      const asset = state.assets.find((item) => item.id === parent.assetIds[0]);
      return { script, parent, child, asset, media: await window.oyama.probeAsset(asset.id) };
    }, { projectId, scriptId: script.id });
    await fs.writeFile('artifacts/continue-replacement-live-evidence.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ asset: result.asset.id, duration: result.media.duration, frames: result.media.video?.frames, audio: result.media.audio?.codec, blendFrames: result.script.continuity.blendFrames, characterIds: result.child.snapshot.effectiveCharacterIds }));
  } finally {
    await app.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
