const { _electron: electron } = require('@playwright/test');
const path = require('node:path');
const env = {
  ...process.env,
  OYAMA_MOCK: '0',
  OYAMA_TEST: '1',
  OYAMA_DATA_DIR: path.resolve('artifacts/live-zimage-app'),
};
delete env.ELECTRON_RUN_AS_NODE;
const packaged = process.argv.includes('--packaged');
const restartMidway = process.argv.includes('--restart-midway');
const continuity = process.argv.includes('--continuity');
if (packaged) env.PATH = process.env.SystemRoot + '\\System32';
async function main() {
  const launch = () =>
    electron.launch(
      packaged
        ? {
            executablePath: path.resolve('release/win-unpacked/OYAMA CreateSpace.exe'),
            args: [],
            env,
          }
        : { args: ['.'], env },
    );
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByText('ComfyUI Connected', { exact: true }).waitFor({ timeout: 30000 });
    let state = await page.evaluate(() => window.oyama.load());
    const scriptName = continuity
      ? 'Live continuity-guided sequence 20260927'
      : restartMidway
        ? 'Live restart two-beat sequence 20260927'
        : 'Live two-beat sequence 20260927';
    let script = (
      await page.evaluate(
        (id) => window.oyama.listContinuationScripts(id),
        '3789f1a8-dc9b-433e-9951-924385027fd5',
      )
    ).find((item) => item.name === scriptName);
    if (!script && !packaged) {
      const queue = await fetch(state.settings.comfyUrl + '/queue').then((r) => r.json());
      if (queue.queue_running.length || queue.queue_pending.length)
        throw new Error('ComfyUI queue is busy.');
      const sourceId = '183efd7b-ae56-4a83-b95c-9dc65c55f975';
      const source = state.assets.find((asset) => asset.id === sourceId);
      if (!source || source.missing) throw new Error('Managed source missing.');
      script = await page.evaluate(
        async ({ sourceId, scriptName, continuity }) => {
          const ids = [crypto.randomUUID(), crypto.randomUUID()];
          return window.oyama.saveContinuationScript({
            id: crypto.randomUUID(),
            projectId: '3789f1a8-dc9b-433e-9951-924385027fd5',
            revision: 0,
            name: scriptName,
            sourceVideo: sourceId,
            ...(continuity ? { continuity: { dialoguePolicy: 'none', audioCarry: false } } : {}),
            settings: {
              width: 512,
              height: 288,
              quality: 'turbo8',
              duration: 1,
              steps: 8,
              nativeDefaults: false,
              contextFrames: 22,
              seed: '32023',
              prompt: '',
              sourceVideo: sourceId,
            },
            beats: ids.map((id, index) => ({
              id,
              name: `Beat ${index + 1}`,
              ...(continuity
                ? { camera: index === 0 ? 'Slow orbit left' : 'Locked medium shot' }
                : {}),
              prompt:
                index === 0
                  ? 'The small glass cube turns slowly on the table; the locked camera observes the same studio scene.'
                  : 'The small glass cube settles and its reflections shift gently; keep the locked camera and studio scene.',
              duration: 1,
              method: 'last',
              selectedSeconds: 0,
              source: { kind: index === 0 ? 'original' : 'previous' },
            })),
          });
        },
        { sourceId, scriptName, continuity },
      );
    }
    if (!script) throw new Error('Sequence script not found in packaged app.');
    let parent = state.jobs.find((job) => job.sequence?.script.id === script.id);
    if (!parent && !packaged) {
      parent = await page.evaluate(
        ({ id, beatId }) => window.oyama.runContinuationScript(id, beatId),
        { id: script.id, beatId: script.beats[1].id },
      );
    }
    if (!parent) throw new Error('Sequence parent not found.');
    let last = '';
    let restarted = false;
    let originalPrompts;
    for (const deadline = Date.now() + 20 * 60 * 1000; Date.now() < deadline;) {
      state = await page.evaluate(() => window.oyama.load());
      parent = state.jobs.find((job) => job.id === parent.id);
      const children = state.jobs.filter((job) => job.snapshot.sequenceParentId === parent.id);
      const status = `${parent.status}: ${parent.message}; children=${children.map((child) => child.status + '/' + child.promptId).join(',')}`;
      if (status !== last) {
        console.log(status);
        last = status;
      }
      if (
        restartMidway &&
        !packaged &&
        !restarted &&
        children.length === 2 &&
        children.some((child) => child.status === 'complete') &&
        children.some((child) => child.promptId && ['queued', 'running'].includes(child.status))
      ) {
        originalPrompts = children.map((child) => child.promptId);
        console.log('RESTART_WITH_KNOWN_PROMPTS ' + JSON.stringify(originalPrompts));
        await page.getByRole('button', { name: 'Close window' }).click();
        await app.close();
        app = await launch();
        page = await app.firstWindow();
        await page.getByText('ComfyUI Connected', { exact: true }).waitFor({ timeout: 30000 });
        restarted = true;
        continue;
      }
      if (parent.status === 'error' || parent.status === 'unknown' || parent.status === 'cancelled')
        throw new Error(status);
      if (parent.status === 'complete') {
        if (
          children.length !== 2 ||
          children.some((child) => child.status !== 'complete' || !child.promptId)
        )
          throw new Error('Sequence lineage or prompt IDs are incomplete.');
        if (
          continuity &&
          children.some(
            (child) =>
              child.snapshot.dialoguePolicy !== 'none' ||
              child.snapshot.audioCarry !== false ||
              !String(child.snapshot.actionPrompt).includes('Camera direction:'),
          )
        )
          throw new Error('Continuity and camera settings did not reach both real child jobs.');
        if (
          restartMidway &&
          !packaged &&
          (!restarted ||
            JSON.stringify(originalPrompts) !==
              JSON.stringify(children.map((child) => child.promptId)))
        )
          throw new Error('Restart changed original ComfyUI prompt IDs.');
        const scriptNow = (
          await page.evaluate((id) => window.oyama.listContinuationScripts(id), script.projectId)
        ).find((item) => item.id === script.id);
        if (scriptNow.beats.some((beat) => beat.stale || !beat.result?.assetIds[0]))
          throw new Error('Beat results were not persisted.');
        const probe = await page.evaluate((id) => window.oyama.probeAsset(id), parent.assetIds[0]);
        if (probe.video?.frames !== 110 || !probe.audio || probe.video.width !== 512)
          throw new Error(`Unexpected final streams: ${JSON.stringify(probe)}`);
        console.log(
          JSON.stringify(
            {
              parentId: parent.id,
              prompts: children.map((child) => child.promptId),
              output: parent.assetIds[0],
              probe,
            },
            null,
            2,
          ),
        );
        if (packaged) {
          const seeked = await page.evaluate(async (id) => {
            const video = document.createElement('video');
            video.src = `oyama://media/${id}`;
            video.preload = 'auto';
            document.body.append(video);
            try {
              await new Promise((resolve, reject) => {
                video.addEventListener('loadedmetadata', resolve, { once: true });
                video.addEventListener('error', () => reject(new Error('Video failed to reopen')), {
                  once: true,
                });
              });
              video.currentTime = 3.8;
              await new Promise((resolve, reject) => {
                video.addEventListener('seeked', resolve, { once: true });
                video.addEventListener('error', () => reject(new Error('Video seek failed')), {
                  once: true,
                });
              });
              return video.currentTime;
            } finally {
              video.remove();
            }
          }, parent.assetIds[0]);
          if (seeked < 3.7) throw new Error('Packaged video did not seek into the second beat.');
          console.log(`Packaged seek into second beat: ${seeked}s`);
        }
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (parent.status !== 'complete') throw new Error('Sequence timed out.');
    await page.getByRole('button', { name: 'Close window' }).click();
  } finally {
    await app.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
