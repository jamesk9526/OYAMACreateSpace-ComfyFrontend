import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AppEvent, DesktopAPI } from '../../shared/domain';
const api: DesktopAPI = {
  listContinuationScripts: (projectId) =>
    ipcRenderer.invoke('oyama:listContinuationScripts', projectId),
  saveContinuationScript: (script) => ipcRenderer.invoke('oyama:saveContinuationScript', script),
  runContinuationScript: (scriptId, targetBeatId) =>
    ipcRenderer.invoke('oyama:runContinuationScript', scriptId, targetBeatId),
  resumeContinuationScript: (jobId) => ipcRenderer.invoke('oyama:resumeContinuationScript', jobId),
  diagnostics: () => ipcRenderer.invoke('oyama:diagnostics'),
  exportLogs: () => ipcRenderer.invoke('oyama:exportLogs'),
  reportRendererLog: (entry) => ipcRenderer.invoke('oyama:reportRendererLog', entry),
  load: () => ipcRenderer.invoke('oyama:load'),
  createProject: (name) => ipcRenderer.invoke('oyama:createProject', name),
  renameProject: (id, name) => ipcRenderer.invoke('oyama:renameProject', id, name),
  saveRecord: (record) => ipcRenderer.invoke('oyama:saveRecord', record),
  removeRecord: (id) => ipcRenderer.invoke('oyama:removeRecord', id),
  saveDraft: (draft) => ipcRenderer.invoke('oyama:saveDraft', draft),
  saveSettings: (settings) => ipcRenderer.invoke('oyama:saveSettings', settings),
  importMedia: (request) => ipcRenderer.invoke('oyama:importMedia', request),
  importMovieMedia: (request) => ipcRenderer.invoke('oyama:importMovieMedia', request),
  importDroppedMovieMedia: (projectId, files) =>
    ipcRenderer.invoke('oyama:importDroppedMovieMedia', {
      projectId,
      paths: files.map((file) => webUtils.getPathForFile(file)).filter(Boolean),
    }),
  exportAsset: (id) => ipcRenderer.invoke('oyama:exportAsset', id),
  promoteAsset: (id) => ipcRenderer.invoke('oyama:promoteAsset', id),
  promoteAssetToRecord: (request) => ipcRenderer.invoke('oyama:promoteAssetToRecord', request),
  handoffAsset: (request) => ipcRenderer.invoke('oyama:handoffAsset', request),
  probeAsset: (id) => ipcRenderer.invoke('oyama:probeAsset', id),
  extractFrame: (request) => ipcRenderer.invoke('oyama:extractFrame', request),
  clipVideo: (request) => ipcRenderer.invoke('oyama:clipVideo', request),
  loadMovieTimeline: (projectId) => ipcRenderer.invoke('oyama:loadMovieTimeline', projectId),
  saveMovieTimeline: (timeline) => ipcRenderer.invoke('oyama:saveMovieTimeline', timeline),
  checkConnection: () => ipcRenderer.invoke('oyama:checkConnection'),
  generate: (draft) => ipcRenderer.invoke('oyama:generate', draft),
  generateLibraryImage: (request) => ipcRenderer.invoke('oyama:generateLibraryImage', request),
  useLibraryImage: (jobId) => ipcRenderer.invoke('oyama:useLibraryImage', jobId),
  attachRecordImage: (request) => ipcRenderer.invoke('oyama:attachRecordImage', request),
  cancelJob: (id) => ipcRenderer.invoke('oyama:cancelJob', id),
  resumeBatchJob: (id) => ipcRenderer.invoke('oyama:resumeBatchJob', id),
  windowAction: (action) => ipcRenderer.invoke('oyama:windowAction', action),
  onEvent: (callback) => {
    const listener = (_: unknown, event: AppEvent) => callback(event);
    ipcRenderer.on('oyama:event', listener);
    return () => ipcRenderer.removeListener('oyama:event', listener);
  },
};
contextBridge.exposeInMainWorld('oyama', api);
