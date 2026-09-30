import { app, BrowserWindow, dialog, ipcMain, nativeImage, protocol, session } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  draftSchema,
  idSchema,
  assetHandoffSchema,
  frameRequestSchema,
  clipRequestSchema,
  recordSchema,
  recordPromotionSchema,
  libraryImageRequestSchema,
  attachRecordImageSchema,
  settingsSchema,
  type AppEvent,
  type Readiness,
} from '../../shared/domain';
import { Store } from './database';
import { ComfyBridge } from './comfy';
import { generatorAdapters } from './modules';
import { MediaService } from './media';
import { mediaResponse } from './media-protocol';
import { thumbnailPath } from './thumbnails';
import version from '../../.generated/version.json';
import { AppLogger } from './logs';
import { rendererLogSchema } from '../../shared/logs';
import { continuationScriptSchema } from '../../shared/continuation';
import { RippleBatchRunner } from './ripple-batch';
import { ContinuationSequenceRunner } from './continuation-sequence';
import { zImageSchema } from '../../src/modules/zimage/definition';
import { movieTimelineSchema } from '../../shared/movie-timeline';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'oyama',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);
const mock = process.env.OYAMA_MOCK === '1' && (!app.isPackaged || process.env.OYAMA_TEST === '1');
if (process.env.OYAMA_DATA_DIR && (!app.isPackaged || process.env.OYAMA_TEST === '1'))
  app.setPath('userData', path.resolve(process.env.OYAMA_DATA_DIR));
else if (!app.isPackaged)
  app.setPath(
    'userData',
    path.join(app.getPath('appData'), mock ? 'OYAMA-CreateSpace-mock' : 'OYAMA-CreateSpace-dev'),
  );
let store: Store;
let bridge: ComfyBridge;
let rippleBatches: RippleBatchRunner;
let continueSequences: ContinuationSequenceRunner;
let win: BrowserWindow;
let logger: AppLogger;
process.on('uncaughtExceptionMonitor', (error) =>
  logger?.write('error', 'main', error.stack || error.message),
);
const nameSchema = z.string().trim().min(1).max(100);
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
else
  app
    .whenReady()
    .then(async () => {
      logger = new AppLogger(app.getPath('userData'));
      logger.write(
        'info',
        'app',
        `Starting CreateSpace ${version.version} · Electron ${process.versions.electron} · ${process.platform}/${process.arch} · mock=${mock}`,
      );
      store = new Store(app.getPath('userData'));
      const lastJobMessages = new Map<string, string>();
      let lastConnection = '';
      let lastReadiness: Readiness | undefined;
      const send = (event: AppEvent) => {
        if (event.type === 'job') {
          const message = `${event.job.moduleId} ${event.job.id} · ${event.job.status} · ${event.job.message}${event.job.promptId ? ` · prompt ${event.job.promptId}` : ''}`;
          if (lastJobMessages.get(event.job.id) !== message) {
            logger.write(
              event.job.status === 'error' || event.job.status === 'unknown'
                ? 'error'
                : event.job.status === 'cancelled'
                  ? 'warn'
                  : 'info',
              'job',
              message,
            );
            lastJobMessages.set(event.job.id, message);
            if (lastJobMessages.size > 1000)
              lastJobMessages.delete(lastJobMessages.keys().next().value!);
          }
        } else if (event.type === 'connection') {
          lastReadiness = event.readiness;
          if (event.readiness.message !== lastConnection) {
            lastConnection = event.readiness.message;
            logger.write(
              event.readiness.connected ? 'info' : 'warn',
              'comfy',
              event.readiness.message,
            );
          }
        }
        if (win && !win.isDestroyed()) win.webContents.send('oyama:event', event);
      };
      bridge = new ComfyBridge(store, send, mock, {
        video: path.join(__dirname, '../renderer/mock/sample.mp4'),
        image: path.join(__dirname, '../renderer/mock/reference.png'),
        audio: undefined,
      });
      rippleBatches = new RippleBatchRunner(store, bridge, send);
      continueSequences = new ContinuationSequenceRunner(store, bridge, send);
      protocol.handle('oyama', async (request) => {
        try {
          const url = new URL(request.url);
          if (
            !['media', 'thumbnail'].includes(url.hostname) ||
            !['GET', 'HEAD'].includes(request.method)
          )
            return new Response('Not found', { status: 404 });
          const id = idSchema.parse(url.pathname.slice(1));
          if (url.hostname === 'thumbnail') {
            const asset = store.asset(id);
            const thumbnail = await thumbnailPath(
              asset,
              store.assetPath(id),
              path.join(app.getPath('userData'), 'thumbnails'),
              process.resourcesPath,
            );
            return await mediaResponse(request, thumbnail, 'image/png');
          }
          return await mediaResponse(request, store.assetPath(id), store.asset(id).mime);
        } catch {
          return new Response('Asset unavailable', { status: 404 });
        }
      });
      session.defaultSession.setPermissionRequestHandler((_web, _permission, callback) =>
        callback(false),
      );
      win = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1100,
        minHeight: 760,
        frame: false,
        backgroundColor: '#191919',
        title: 'OYAMA CreateSpace',
        webPreferences: {
          preload: path.join(__dirname, '../preload/index.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', (event) => event.preventDefault());
      win.webContents.on('console-message', (_event, level, message) =>
        logger.write(
          level >= 3 ? 'error' : level === 2 ? 'warn' : 'info',
          'renderer-console',
          message,
        ),
      );
      win.webContents.on('render-process-gone', (_event, details) =>
        logger.write(
          'error',
          'renderer',
          `Process exited: ${details.reason}, code ${details.exitCode}`,
        ),
      );
      const handle = (name: string, handler: (...args: unknown[]) => unknown) =>
        ipcMain.handle(`oyama:${name}`, async (event, ...args: unknown[]) => {
          if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
            throw new Error('Invalid IPC sender');
          try {
            const result = await handler(...args);
            if (
              ![
                'load',
                'saveDraft',
                'diagnostics',
                'reportRendererLog',
                'checkConnection',
              ].includes(name)
            )
              logger.write('info', `ipc:${name}`, 'Completed');
            return result;
          } catch (error) {
            logger.write(
              'error',
              `ipc:${name}`,
              error instanceof Error ? error.stack || error.message : String(error),
            );
            throw error;
          }
        });
      const mediaToolsStatus = () => {
        try {
          const media = new MediaService({ resourcesPath: process.resourcesPath });
          return `${media.ffmpeg.includes(path.join(process.resourcesPath, 'media-tools')) ? 'Bundled' : 'PATH'} FFmpeg / ffprobe available`;
        } catch (error) {
          return (error as Error).message;
        }
      };
      const diagnostics = () => ({
        info: {
          Version: version.version,
          Electron: process.versions.electron || '',
          Chromium: process.versions.chrome || '',
          Node: process.versions.node,
          Platform: `${process.platform}/${process.arch}`,
          Mode: mock ? 'Mock' : 'Live',
          'Media tools': mediaToolsStatus(),
          Packaged: String(app.isPackaged),
          'Data directory': app.getPath('userData'),
          'Log file': logger.filename,
          ComfyUI: store.settings().comfyUrl,
          Jobs: String(store.jobs().length),
          'Uptime seconds': String(Math.floor(process.uptime())),
          Connection: lastReadiness?.message || 'Checking',
          'Node classes': String(lastReadiness?.nodes.length || 0),
          ...Object.fromEntries(
            (lastReadiness?.devices || []).map((device) => [
              `GPU ${device.index}`,
              `${device.name} · ${(device.vram_free / 1024 ** 3).toFixed(1)} / ${(device.vram_total / 1024 ** 3).toFixed(1)} GiB free/total`,
            ]),
          ),
          ...Object.fromEntries(
            Object.entries(lastReadiness?.models || {}).map(([kind, names]) => [
              `${kind} models`,
              String(names.length),
            ]),
          ),
        },
        entries: logger.snapshot(),
      });
      handle('diagnostics', diagnostics);
      handle('reportRendererLog', (value) => {
        const entry = rendererLogSchema.parse(value);
        logger.write(entry.level, 'renderer', entry.message);
      });
      handle('exportLogs', async () => {
        const result = await dialog.showSaveDialog(win, {
          title: 'Export application logs',
          defaultPath: 'CreateSpace-diagnostics.json',
          filters: [{ name: 'Diagnostics JSON', extensions: ['json'] }],
        });
        if (!result.canceled && result.filePath)
          await fs.writeFile(result.filePath, JSON.stringify(diagnostics(), null, 2));
      });
      handle('load', () => store.snapshot(version.version, mock));
      handle('loadMovieTimeline', (value) => store.movieTimeline(idSchema.parse(value)));
      handle('saveMovieTimeline', (value) =>
        store.saveMovieTimeline(movieTimelineSchema.parse(value)),
      );
      handle('listContinuationScripts', (projectId) =>
        store.continuationScripts(idSchema.parse(projectId)),
      );
      handle('saveContinuationScript', (value) =>
        store.saveContinuationScript(continuationScriptSchema.parse(value)),
      );
      handle('runContinuationScript', (scriptId, targetBeatId) =>
        continueSequences.start(idSchema.parse(scriptId), idSchema.parse(targetBeatId)),
      );
      handle('resumeContinuationScript', (id) => continueSequences.resume(idSchema.parse(id)));
      handle('createProject', (name) => store.createProject(nameSchema.parse(name)));
      handle('renameProject', (id, name) =>
        store.renameProject(idSchema.parse(id), nameSchema.parse(name)),
      );
      handle('saveRecord', (record) => store.saveRecord(recordSchema.parse(record)));
      handle('removeRecord', (id) => store.removeRecord(idSchema.parse(id)));
      handle('saveSettings', (settings) => store.saveSettings(settingsSchema.parse(settings)));
      handle('saveDraft', (value) => {
        const draft = draftSchema.parse(value);
        if (!generatorAdapters[draft.moduleId]) throw new Error('Unknown generator');
        store.saveDraft(draft);
      });
      handle('importMedia', async (value) => {
        const { projectId } = z.object({ projectId: idSchema.nullable() }).parse(value);
        const result = await dialog.showOpenDialog(win, {
          title: 'Import references',
          properties: ['openFile', 'multiSelections'],
          filters: [
            {
              name: 'Media',
              extensions: [
                'png',
                'jpg',
                'jpeg',
                'webp',
                'mp4',
                'webm',
                'mov',
                'wav',
                'mp3',
                'flac',
                'ogg',
              ],
            },
          ],
        });
        const assets = [];
        for (const file of result.filePaths) assets.push(await store.importFile(file, projectId));
        return assets;
      });
      const movieExtensions = new Set([
        '.png',
        '.jpg',
        '.jpeg',
        '.webp',
        '.mp4',
        '.webm',
        '.mov',
        '.wav',
        '.mp3',
        '.flac',
        '.ogg',
      ]);
      const importMoviePaths = async (paths: string[], projectId: string) => {
        const assets = [];
        for (const file of paths) {
          if (!movieExtensions.has(path.extname(file).toLowerCase())) continue;
          assets.push(await store.importFile(file, projectId));
        }
        return assets;
      };
      handle('importMovieMedia', async (value) => {
        const request = z
          .object({ projectId: idSchema, source: z.enum(['files', 'folder']) })
          .parse(value);
        store.project(request.projectId);
        const result = await dialog.showOpenDialog(win, {
          title: request.source === 'folder' ? 'Import movie folder' : 'Import movie files',
          properties:
            request.source === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'],
          ...(request.source === 'files'
            ? {
                filters: [
                  {
                    name: 'Media',
                    extensions: [...movieExtensions].map((extension) => extension.slice(1)),
                  },
                ],
              }
            : {}),
        });
        if (result.canceled) return [];
        if (request.source === 'files')
          return importMoviePaths(result.filePaths, request.projectId);
        const files: string[] = [];
        let entriesVisited = 0;
        const visit = async (directory: string, depth: number) => {
          if (depth > 16) throw new Error('Folder nesting is too deep to import');
          for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
            if (++entriesVisited > 10000) throw new Error('Choose a smaller media folder');
            const child = path.join(directory, entry.name);
            if (entry.isDirectory()) await visit(child, depth + 1);
            else if (
              entry.isFile() &&
              movieExtensions.has(path.extname(entry.name).toLowerCase())
            ) {
              files.push(child);
              if (files.length > 1000)
                throw new Error('Choose a folder with at most 1000 media files');
            }
          }
        };
        await visit(result.filePaths[0], 0);
        return importMoviePaths(files, request.projectId);
      });
      handle('importDroppedMovieMedia', async (value) => {
        const request = z
          .object({ projectId: idSchema, paths: z.array(z.string().min(1)).max(100) })
          .parse(value);
        store.project(request.projectId);
        return importMoviePaths(request.paths, request.projectId);
      });
      handle('exportAsset', async (value) => {
        const id = idSchema.parse(value);
        const asset = store.asset(id);
        const result = await dialog.showSaveDialog(win, { defaultPath: asset.name });
        if (result.filePath) await fs.copyFile(store.assetPath(id), result.filePath);
      });
      handle('promoteAsset', async (value) => {
        const asset = await store.promoteAsset(idSchema.parse(value));
        send({ type: 'library' });
        return asset;
      });
      handle('promoteAssetToRecord', async (value) => {
        const request = recordPromotionSchema.parse(value);
        store.project(request.projectId);
        const source = store.asset(request.assetId);
        if (source.projectId && source.projectId !== request.projectId)
          throw new Error('Asset belongs to a different project.');
        const result = await store.promoteAssetToRecord(request.assetId, request.kind);
        send({ type: 'library' });
        return result;
      });
      handle('handoffAsset', async (value) => {
        const request = assetHandoffSchema.parse(value);
        store.project(request.projectId);
        let asset = store.asset(request.assetId);
        if (asset.projectId && asset.projectId !== request.projectId)
          throw new Error('Asset belongs to a different project.');
        const adapter = generatorAdapters[request.targetModuleId];
        if (!adapter?.applyAsset) throw new Error('Target module does not accept asset handoffs.');
        if (asset.kind === 'image' && ['photo-edit', 'ripple'].includes(request.targetModuleId)) {
          const image = nativeImage.createFromPath(store.assetPath(asset.id));
          if (image.isEmpty()) throw new Error('Unable to decode handoff image.');
          asset = store.saveImageDimensions(asset.id, image.getSize());
          send({ type: 'library' });
        }
        if (asset.kind === 'video' && request.targetModuleId === 'continue') {
          const metadata = await new MediaService({ resourcesPath: process.resourcesPath }).probe(
            store.assetPath(asset.id),
          );
          asset = store.saveMediaProbe(asset.id, metadata);
          send({ type: 'library' });
        }
        const existing =
          store.draft(request.projectId, request.targetModuleId) ||
          ({
            projectId: request.projectId,
            moduleId: request.targetModuleId,
            values: {},
          } satisfies import('../../shared/domain').Draft);
        const draft = adapter.applyAsset(existing, request.targetField, asset, request.canvas);
        store.saveDraft(draft);
        return draft;
      });
      handle('probeAsset', async (value) => {
        const id = idSchema.parse(value);
        const asset = store.asset(id);
        if (asset.kind === 'image') throw new Error('Images have no audio/video streams to probe.');
        const media = await new MediaService({ resourcesPath: process.resourcesPath }).probe(
          store.assetPath(id),
        );
        store.saveMediaProbe(id, media);
        return media;
      });
      handle('extractFrame', async (value) => {
        const request = frameRequestSchema.parse(value);
        const source = store.asset(request.assetId);
        if (source.kind !== 'video') throw new Error('Choose a video to extract a frame.');
        const target = path.join(store.root, 'temporary', `${randomUUID()}.png`);
        try {
          await new MediaService({ resourcesPath: process.resourcesPath }).extractFrame(
            store.assetPath(source.id),
            target,
            request.seconds,
            request.frame,
          );
          const frame = await store.importFile(
            target,
            source.projectId,
            `${path.parse(source.name).name}-frame-${request.seconds.toFixed(3)}.png`,
          );
          const derived = store.registerDerivation(frame.id, source.id, {
            operation: 'frame',
            start: request.seconds,
          });
          send({ type: 'library' });
          return derived;
        } finally {
          await fs.rm(target, { force: true });
        }
      });
      handle('clipVideo', async (value) => {
        const request = clipRequestSchema.parse(value);
        const source = store.asset(request.assetId);
        if (source.kind !== 'video') throw new Error('Choose a video to clip.');
        const media = new MediaService({ resourcesPath: process.resourcesPath });
        const target = path.join(store.root, 'temporary', `${randomUUID()}.mp4`);
        try {
          await media.clipVideo(store.assetPath(source.id), target, request.start, request.end);
          const clip = await store.importFile(
            target,
            source.projectId,
            `${path.parse(source.name).name}-clip-${request.start.toFixed(3)}-${request.end.toFixed(3)}.mp4`,
          );
          const derived = store.registerDerivation(clip.id, source.id, {
            operation: 'clip',
            start: request.start,
            end: request.end,
          });
          store.saveMediaProbe(derived.id, await media.probe(target));
          send({ type: 'library' });
          return store.asset(derived.id);
        } finally {
          await fs.rm(target, { force: true });
        }
      });
      handle('checkConnection', async () => {
        const readiness = await bridge.inspect();
        send({ type: 'connection', readiness });
        return readiness;
      });
      handle('generate', (value) => {
        const draft = draftSchema.parse(value);
        return draft.moduleId === 'ripple' && draft.values.mode === 'long'
          ? rippleBatches.start(draft)
          : bridge.start(draft);
      });
      handle('generateLibraryImage', (value) => {
        const request = libraryImageRequestSchema.parse(value);
        const values = zImageSchema.parse(request.values);
        if (!values.prompt.trim()) throw new Error('Describe the image first.');
        if (request.target.kind === 'record') {
          const record = store.record(request.target.recordId);
          if (request.target.purpose === 'master' && record.kind !== 'character')
            throw new Error('Only a character can receive a master image.');
        }
        return bridge.start(
          { projectId: request.projectId, moduleId: 'zimage', values },
          undefined,
          request.target,
        );
      });
      handle('attachRecordImage', async (value) => {
        const request = attachRecordImageSchema.parse(value);
        const record = await store.attachRecordImage(request);
        send({ type: 'library' });
        return record;
      });
      handle('useLibraryImage', async (value) => {
        const job = store.jobs().find((candidate) => candidate.id === idSchema.parse(value));
        if (
          !job ||
          job.moduleId !== 'zimage' ||
          job.status !== 'complete' ||
          !job.libraryImageTarget
        )
          throw new Error('Completed library image job not found.');
        const asset = store.asset(job.assetIds[0]);
        if (asset.kind !== 'image' || asset.projectId !== job.projectId)
          throw new Error('Library image output is unavailable.');
        if (job.libraryImageTarget.kind === 'assets') {
          job.libraryImageAssetId = asset.id;
          store.saveJob(job);
          send({ type: 'job', job });
          return asset;
        }
        if (job.libraryImageAssetId) return store.asset(job.libraryImageAssetId);
        const record = await store.attachRecordImage({
          projectId: job.projectId,
          recordId: job.libraryImageTarget.recordId,
          assetId: asset.id,
          purpose: job.libraryImageTarget.purpose,
        });
        job.libraryImageAssetId =
          record.masterAssetId && job.libraryImageTarget.purpose === 'master'
            ? record.masterAssetId
            : record.assetIds[record.assetIds.length - 1];
        store.saveJob(job);
        send({ type: 'job', job });
        send({ type: 'library' });
        return store.asset(job.libraryImageAssetId);
      });
      handle('resumeBatchJob', (id) => rippleBatches.resume(idSchema.parse(id)));
      handle('cancelJob', async (id) => {
        const jobId = idSchema.parse(id);
        if (!(await continueSequences.cancel(jobId)) && !(await rippleBatches.cancel(jobId)))
          await bridge.cancel(jobId);
      });
      handle('windowAction', (action) => {
        switch (z.enum(['minimize', 'maximize', 'close']).parse(action)) {
          case 'minimize':
            win.minimize();
            break;
          case 'maximize':
            win.isMaximized() ? win.unmaximize() : win.maximize();
            break;
          case 'close':
            win.close();
        }
      });
      if (process.env.ELECTRON_RENDERER_URL && !app.isPackaged)
        await win.loadURL(process.env.ELECTRON_RENDERER_URL);
      else await win.loadFile(path.join(__dirname, '../renderer/index.html'));
    })
    .catch((error) => {
      logger?.write('error', 'startup', (error as Error).stack || String(error));
      dialog.showErrorBox('CreateSpace could not start', (error as Error).message);
      app.quit();
    });
app.on('second-instance', () => {
  if (win) {
    win.restore();
    win.focus();
  }
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  logger?.write('info', 'app', 'Application closing');
  bridge?.close();
  rippleBatches?.close();
  continueSequences?.close();
  store?.close();
});
