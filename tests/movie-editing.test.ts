import { describe, expect, it } from 'vitest';
import { snapClipStart, trimClip } from '../src/modules/movie/editing';
import { formatTimecode, parseTimecode } from '../src/modules/movie/timecode';
import type { MovieTimelineClip } from '../shared/movie-timeline';

const clip: MovieTimelineClip = {
  id: '11111111-1111-4111-8111-111111111111',
  assetId: '22222222-2222-4222-8222-222222222222',
  track: 'video',
  start: 5,
  duration: 3,
  sourceStart: 2,
  volume: 1,
  muted: false,
  locked: false,
};

describe('Movie editing timebase', () => {
  it('formats frame boundaries and rejects invalid timecodes', () => {
    expect(formatTimecode(1.999, 24)).toBe('00:00:02:00');
    expect(parseTimecode('01:02:03:23', 24)).toBeCloseTo(3723 + 23 / 24);
    expect(parseTimecode('00:00:00:24', 24)).toBeNull();
  });

  it('trims a source non-destructively and preserves the right edge when trimming in', () => {
    const inbound = trimClip(clip, 'start', 1, 24, 10);
    expect(inbound).toMatchObject({ start: 6, sourceStart: 3, duration: 2 });
    expect(inbound.start + inbound.duration).toBe(clip.start + clip.duration);
    expect(trimClip(clip, 'start', -4, 24, 10)).toMatchObject({
      start: 3,
      sourceStart: 0,
      duration: 5,
    });
    expect(trimClip(clip, 'end', 20, 24, 10).duration).toBe(8);
  });

  it('keeps every placement on a frame and magnetically joins nearby clip edges', () => {
    expect(snapClipStart(8.06, 2, [clip], 0, 24, 100, true)).toBe(8);
    expect(snapClipStart(8.06, 2, [clip], 0, 24, 100, false)).toBeCloseTo(8 + 1 / 24);
  });
});
