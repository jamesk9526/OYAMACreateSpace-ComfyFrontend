import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MediaService, parseFrameRate, parseProbe } from '../electron/main/media';

describe('media metadata', () => {
  it('parses rational and variable frame rates without inventing zero-rate values', () => {
    expect(parseFrameRate('30000/1001')).toBeCloseTo(29.97003);
    expect(parseFrameRate('0/0')).toBeUndefined();
    const media = parseProbe({
      format: { duration: '3.000000' },
      streams: [
        {
          codec_type: 'video',
          codec_name: 'h264',
          width: 832,
          height: 480,
          avg_frame_rate: '0/0',
          r_frame_rate: '24/1',
          nb_frames: '72',
        },
        { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000' },
      ],
    });
    expect(media.video).toMatchObject({ codec: 'h264', width: 832, fps: 24, frames: 72 });
    expect(media.audio).toMatchObject({ codec: 'aac', sampleRate: 48000 });
    expect(media.duration).toBe(3);
  });

  it('accepts audio-only media and rejects empty or invalid metadata', () => {
    expect(
      parseProbe({
        format: { duration: '2' },
        streams: [{ codec_type: 'audio', codec_name: 'flac' }],
      }).video,
    ).toBeNull();
    expect(() => parseProbe({ format: { duration: '0' }, streams: [] })).toThrow('no usable');
    expect(() => parseProbe(null)).toThrow('invalid');
  });
});

const toolsDirectory = path.resolve('.generated/media-tools/win-x64');
it.skipIf(!existsSync(path.join(toolsDirectory, 'ffmpeg.exe')))(
  'crossfades a Continue seam with exact frames and audio',
  async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'createspace-blend-'));
    try {
      const media = new MediaService({ explicitDirectory: toolsDirectory });
      const source = path.join(directory, 'source.mp4');
      const beat = path.join(directory, 'beat.mp4');
      const output = path.join(directory, 'joined.mp4');
      for (const [file, color, seconds] of [
        [source, 'red', '2'],
        [beat, 'blue', '1'],
      ]) {
        execFileSync(
          media.ffmpeg,
          [
            '-nostdin',
            '-v',
            'error',
            '-f',
            'lavfi',
            '-i',
            `color=c=${color}:s=320x256:r=24:d=${seconds}`,
            '-f',
            'lavfi',
            '-i',
            `sine=frequency=440:sample_rate=48000:duration=${seconds}`,
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-shortest',
            '-y',
            file,
          ],
          { windowsHide: true },
        );
      }
      const result = await media.joinVideos(source, beat, output, 320, 256, undefined, true, 6);
      expect(result.video?.frames).toBe(66);
      expect(result.audio).not.toBeNull();
      expect(result.duration).toBeCloseTo(2.75, 1);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
  120000,
);
