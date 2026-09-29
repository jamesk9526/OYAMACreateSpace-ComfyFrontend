import type { MovieTimelineClip } from '../../../shared/movie-timeline';

export function snapClipStart(
  rawSeconds: number,
  clipDuration: number,
  otherClips: MovieTimelineClip[],
  playhead: number,
  fps: number,
  pixelsPerSecond: number,
  magnetic: boolean,
) {
  const framed = Math.max(0, Math.round(rawSeconds * fps) / fps);
  if (!magnetic) return framed;
  const anchors = [
    0,
    playhead,
    ...otherClips.flatMap((clip) => [clip.start, clip.start + clip.duration]),
  ];
  const options = anchors
    .flatMap((anchor) => [anchor, anchor - clipDuration])
    .filter((value) => value >= 0);
  const nearest = options.reduce(
    (best, value) => (Math.abs(value - framed) < Math.abs(best - framed) ? value : best),
    options[0] ?? framed,
  );
  return Math.abs(nearest - framed) * pixelsPerSecond <= 8 ? nearest : framed;
}

export function trimClip(
  clip: MovieTimelineClip,
  edge: 'start' | 'end',
  deltaSeconds: number,
  fps: number,
  sourceDuration?: number,
): MovieTimelineClip {
  const delta = Math.round(deltaSeconds * fps) / fps;
  const minDuration = 1 / fps;
  if (edge === 'start') {
    const change = Math.max(
      -Math.min(clip.start, clip.sourceStart),
      Math.min(clip.duration - minDuration, delta),
    );
    return {
      ...clip,
      start: clip.start + change,
      sourceStart: clip.sourceStart + change,
      duration: clip.duration - change,
    };
  }
  const desired = Math.round((clip.duration + delta) * fps) / fps;
  const maxDuration =
    sourceDuration && sourceDuration > 0
      ? Math.max(minDuration, sourceDuration - clip.sourceStart)
      : 86400 - clip.sourceStart;
  return { ...clip, duration: Math.max(minDuration, Math.min(maxDuration, desired)) };
}
