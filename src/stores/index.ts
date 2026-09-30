import { create } from 'zustand';
import type {
  Asset,
  Bootstrap,
  DesktopAPI,
  Draft,
  Job,
  LibraryRecord,
  Project,
  Readiness,
  Settings,
} from '../../shared/domain';
import { livePreviewDefaults } from '../../shared/domain';
import { moduleDefaults } from '../modules/registry';
declare global {
  interface Window {
    oyama: DesktopAPI;
  }
}
export const useShell = create<{
  area: string;
  projectId: string;
  composerTab: string;
  inspectorTab: string;
  modal: 'settings' | 'modules' | 'about' | null;
  error: string | null;
  selectedAsset: string | null;
  tabs: string[];
  ready: boolean;
  navigate(area: string): void;
  setProject(id: string): void;
  setError(error: unknown): void;
}>((set) => ({
  area: 'h3',
  projectId: '',
  composerTab: 'Prompt',
  inspectorTab: 'Properties',
  modal: null,
  error: null,
  selectedAsset: null,
  tabs: ['h3'],
  ready: false,
  navigate: (area) =>
    set((s) => ({ area, tabs: s.tabs.includes(area) ? s.tabs : [...s.tabs, area] })),
  setProject: (projectId) => set({ projectId, selectedAsset: null }),
  setError: (error) => {
    const message = error instanceof Error ? error.message : String(error);
    set({ error: message });
    void window.oyama
      ?.reportRendererLog({ level: 'error', message: message.slice(0, 8000) })
      .catch(() => {});
  },
}));
export const useLibrary = create<{
  projects: Project[];
  assets: Asset[];
  records: LibraryRecord[];
}>(() => ({ projects: [], assets: [], records: [] }));
export const useSettings = create<{
  settings: Settings;
  version: string;
  mock: boolean;
  readiness: Readiness | null;
}>(() => ({
  settings: {
    comfyUrl: 'http://127.0.0.1:8188',
    mockScenario: 'success',
    livePreview: livePreviewDefaults,
  },
  version: '2.0.0',
  mock: false,
  readiness: null,
}));
export const useJobs = create<{ jobs: Job[] }>(() => ({ jobs: [] }));
export const useDrafts = create<{ drafts: Record<string, Draft> }>(() => ({ drafts: {} }));
export const draftKey = (projectId: string, moduleId: string) => `${projectId}:${moduleId}`;
export function draftFor(projectId: string, moduleId = 'h3'): Draft {
  return (
    useDrafts.getState().drafts[draftKey(projectId, moduleId)] || {
      projectId,
      moduleId,
      values: moduleDefaults(moduleId),
    }
  );
}
let saveChain = Promise.resolve();
export function patchDraft(patch: Record<string, unknown>, moduleId = 'h3') {
  const projectId = useShell.getState().projectId;
  if (!projectId) return;
  const draft = draftFor(projectId, moduleId);
  const next = { ...draft, values: { ...draft.values, ...patch } };
  useDrafts.setState((s) => ({ drafts: { ...s.drafts, [draftKey(projectId, moduleId)]: next } }));
  saveChain = saveChain.catch(() => {}).then(() => window.oyama.saveDraft(next));
  saveChain.catch(useShell.getState().setError);
}
export async function refreshLibrary() {
  const data = await window.oyama.load();
  useLibrary.setState({ projects: data.projects, assets: data.assets, records: data.records });
}
export async function guarded<T>(action: () => Promise<T>): Promise<T | undefined> {
  try {
    return await action();
  } catch (error) {
    useShell.getState().setError(error);
    return undefined;
  }
}
export async function checkConnection() {
  const readiness = await window.oyama.checkConnection();
  useSettings.setState({ readiness });
}
export async function bootstrap() {
  const data: Bootstrap = await window.oyama.load();
  for (const draft of data.drafts) {
    if (
      draft.moduleId !== 'h3' ||
      !['text', undefined].includes(draft.values.mode as string | undefined)
    )
      continue;
    const ids = [
      ...(Array.isArray(draft.values.characterIds) ? draft.values.characterIds : []),
      ...(Array.isArray(draft.values.locationIds) ? draft.values.locationIds : []),
      ...(Array.isArray(draft.values.wardrobeIds) ? draft.values.wardrobeIds : []),
    ];
    if (
      !draft.values.modeExplicit &&
      ((Array.isArray(draft.values.references) && draft.values.references.length) ||
        data.records.some((r) => ids.includes(r.id) && r.assetIds.length))
    ) {
      draft.values.mode = 'reference';
      await window.oyama.saveDraft(draft);
    }
  }
  useLibrary.setState({ projects: data.projects, assets: data.assets, records: data.records });
  useDrafts.setState({
    drafts: Object.fromEntries(data.drafts.map((d) => [draftKey(d.projectId, d.moduleId), d])),
  });
  useJobs.setState({ jobs: data.jobs });
  useSettings.setState({ settings: data.settings, version: data.version, mock: data.mock });
  useShell.setState({ projectId: data.projects[0].id, ready: true });
}
export function subscribe() {
  return window.oyama.onEvent((event) => {
    if (event.type === 'job') {
      useJobs.setState((s) => ({
        jobs: [event.job, ...s.jobs.filter((j) => j.id !== event.job.id)],
      }));
      if (event.job.status === 'complete') {
        void guarded(refreshLibrary);
        if (event.job.projectId === useShell.getState().projectId)
          useShell.setState({ selectedAsset: event.job.assetIds[0] || null });
      }
    } else if (event.type === 'connection') useSettings.setState({ readiness: event.readiness });
    else void guarded(refreshLibrary);
  });
}
