import { create } from 'zustand';
import type { MovieTimeline } from '../../../shared/movie-timeline';

type MovieSession = {
  timeline: MovieTimeline | null;
  selectedClipId: string | null;
  setTimeline: (timeline: MovieTimeline) => void;
  selectClip: (id: string | null) => void;
};

export const useMovieSession = create<MovieSession>((set) => ({
  timeline: null,
  selectedClipId: null,
  setTimeline: (timeline) => set({ timeline }),
  selectClip: (selectedClipId) => set({ selectedClipId }),
}));

let saveChain: Promise<unknown> = Promise.resolve();
let revision = 0;
export async function persistMovieTimeline(next: MovieTimeline) {
  const previous = useMovieSession.getState().timeline;
  const currentRevision = ++revision;
  useMovieSession.getState().setTimeline(next);
  const operation = saveChain
    .then(async () => {
      const saved =
        typeof window.oyama.saveMovieTimeline === 'function'
          ? await window.oyama.saveMovieTimeline(next)
          : next;
      if (
        currentRevision === revision &&
        useMovieSession.getState().timeline?.projectId === next.projectId
      )
        useMovieSession.getState().setTimeline(saved);
      return saved;
    })
    .catch((error: unknown) => {
      if (currentRevision === revision && previous?.projectId === next.projectId)
        useMovieSession.getState().setTimeline(previous);
      throw error;
    });
  saveChain = operation.catch(() => undefined);
  return operation;
}
