import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { MediaProbe, MediaStream } from '../../shared/domain';

const runFile = promisify(execFile);

function positive(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

export function parseFrameRate(value: unknown): number | undefined {
  if (typeof value !== 'string') return positive(value);
  const [numerator, denominator] = value.split('/').map(Number);
  return positive(numerator / (denominator ?? 1));
}

export function parseProbe(raw: unknown): MediaProbe {
  if (!raw || typeof raw !== 'object') throw new Error('ffprobe returned invalid media metadata.');
  const data = raw as { format?: { duration?: unknown }; streams?: Record<string, unknown>[] };
  const streams: MediaStream[] = (data.streams || []).flatMap((item) => {
    const kind = item.codec_type;
    if (kind !== 'video' && kind !== 'audio') return [];
    return [
      {
        kind,
        codec: typeof item.codec_name === 'string' ? item.codec_name : 'unknown',
        ...(kind === 'video'
          ? {
              width: positive(item.width),
              height: positive(item.height),
              fps: parseFrameRate(item.avg_frame_rate) ?? parseFrameRate(item.r_frame_rate),
              frames: positive(item.nb_frames),
            }
          : { sampleRate: positive(item.sample_rate) }),
        duration: positive(item.duration),
      },
    ];
  });
  const duration =
    positive(data.format?.duration) ??
    Math.max(0, ...streams.map((stream) => stream.duration || 0));
  if (!streams.length || !duration)
    throw new Error('Media has no usable audio/video stream or duration.');
  return {
    duration,
    streams,
    video: streams.find((stream) => stream.kind === 'video') || null,
    audio: streams.find((stream) => stream.kind === 'audio') || null,
  };
}

export function findMediaTool(
  name: 'ffmpeg' | 'ffprobe',
  options: { resourcesPath?: string; pathEnv?: string; explicitDirectory?: string } = {},
): string {
  const filename = process.platform === 'win32' ? `${name}.exe` : name;
  const directories = [
    options.explicitDirectory,
    options.resourcesPath &&
      path.join(
        options.resourcesPath,
        'media-tools',
        process.platform === 'win32' ? 'win-x64' : process.platform,
      ),
    ...(options.pathEnv ?? process.env.PATH ?? '').split(path.delimiter),
  ].filter((entry): entry is string => Boolean(entry));
  const match = directories.map((directory) => path.join(directory, filename)).find(existsSync);
  if (!match)
    throw new Error(
      `${filename} is unavailable. Install FFmpeg on PATH or include it in the application's media-tools resources.`,
    );
  return match;
}

export class MediaService {
  readonly ffmpeg: string;
  readonly ffprobe: string;
  constructor(
    options: { resourcesPath?: string; pathEnv?: string; explicitDirectory?: string } = {},
  ) {
    this.ffmpeg = findMediaTool('ffmpeg', options);
    this.ffprobe = findMediaTool('ffprobe', options);
  }
  async probe(source: string): Promise<MediaProbe> {
    const { stdout } = await runFile(
      this.ffprobe,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,nb_frames,sample_rate,duration',
        '-of',
        'json',
        source,
      ],
      { windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024 },
    );
    return parseProbe(JSON.parse(stdout));
  }
  async extractFrame(source: string, target: string, seconds: number): Promise<void> {
    if (path.extname(target).toLowerCase() !== '.png')
      throw new Error('Extracted frame must be a PNG.');
    const metadata = await this.probe(source);
    if (!metadata.video) throw new Error('Media has no video frames.');
    if (!Number.isFinite(seconds) || seconds < 0 || seconds >= metadata.duration)
      throw new Error('Frame time is outside the source video.');
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await runFile(
        this.ffmpeg,
        [
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          source,
          '-ss',
          String(seconds),
          '-frames:v',
          '1',
          '-y',
          target,
        ],
        { windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 },
      );
      const stat = await fs.stat(target);
      if (!stat.size) throw new Error('Frame extraction produced an empty file.');
    } catch (error) {
      await fs.rm(target, { force: true });
      throw error;
    }
  }
  /** Temporary, bounded upload copy. Original media remains untouched. */
  async prepareRippleVideo(
    source: string,
    target: string,
    frames: number,
    width: number,
    height: number,
    startFrame = 0,
    paddedFrames?: number,
  ): Promise<void> {
    if (paddedFrames !== undefined) frames = paddedFrames;
    if (!Number.isInteger(startFrame) || startFrame < 0 || startFrame > 7200)
      throw new Error('Invalid Ripple chunk start.');
    if (
      path.extname(target).toLowerCase() !== '.mp4' ||
      !Number.isInteger(frames) ||
      frames < 48 ||
      frames > 480 ||
      frames % 8 !== 0 ||
      ![width, height].every(
        (value) => Number.isInteger(value) && value >= 256 && value <= 2048 && value % 32 === 0,
      )
    )
      throw new Error('Invalid Ripple upload dimensions or frame count.');
    const metadata = await this.probe(source);
    const videoDuration =
      metadata.video?.duration ??
      (metadata.video?.frames && metadata.video.fps
        ? metadata.video.frames / metadata.video.fps
        : metadata.duration);
    if (
      !metadata.video ||
      startFrame / 24 >= videoDuration ||
      (paddedFrames === undefined && videoDuration + 0.001 < (startFrame + frames) / 24)
    )
      throw new Error('Source video is too short for this Ripple edit.');
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await runFile(
        this.ffmpeg,
        [
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          source,
          '-ss',
          String(startFrame / 24),
          '-t',
          String(frames / 24),
          '-map',
          '0:v:0',
          '-map',
          '0:a?',
          '-vf',
          `fps=24,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}${paddedFrames === undefined ? '' : `,tpad=stop_mode=clone:stop_duration=${frames / 24}`}`,
          '-frames:v',
          String(frames),
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          '18',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-movflags',
          '+faststart',
          '-y',
          target,
        ],
        { windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 2 * 1024 * 1024 },
      );
      const prepared = await this.probe(target);
      if (prepared.video?.frames !== frames || Math.abs((prepared.video?.fps || 0) - 24) > 0.02)
        throw new Error('Prepared Ripple source has an unexpected frame count or frame rate.');
    } catch (error) {
      await fs.rm(target, { force: true });
      throw error;
    }
  }
  async assembleRipple(
    source: string,
    clips: { file: string; sourceFrames: number; overlapFrames: number }[],
    target: string,
    frames: number,
    width: number,
    height: number,
    blend: boolean,
    signal?: AbortSignal,
  ): Promise<MediaProbe> {
    if (
      !clips.length ||
      clips.length > 100 ||
      !Number.isInteger(frames) ||
      frames < 48 ||
      frames > 7200 ||
      ![width, height].every(
        (value) => Number.isInteger(value) && value >= 256 && value <= 2048 && value % 32 === 0,
      ) ||
      clips.some(
        (clip, index) =>
          !Number.isInteger(clip.sourceFrames) ||
          clip.sourceFrames < 48 ||
          clip.sourceFrames > 480 ||
          clip.sourceFrames % 8 ||
          !Number.isInteger(clip.overlapFrames) ||
          clip.overlapFrames < 0 ||
          clip.overlapFrames > 48 ||
          (index === 0 ? clip.overlapFrames !== 0 : clip.overlapFrames >= clip.sourceFrames / 2),
      )
    )
      throw new Error('Invalid Ripple assembly plan.');
    const metadata = await this.probe(source);
    const filters = clips.map(
      (clip, index) =>
        `[${index}:v:0]scale=${width}:${height},format=yuv420p,trim=end_frame=${clip.sourceFrames},setpts=PTS-STARTPTS,fps=24,settb=AVTB[v${index}]`,
    );
    let combined = 'v0',
      timeline = clips[0].sourceFrames / 24;
    for (let index = 1; index < clips.length; index++) {
      const clip = clips[index],
        overlap = clip.overlapFrames / 24,
        next = `joined${index}`;
      if (blend && overlap > 0)
        filters.push(
          `[${combined}][v${index}]xfade=transition=fade:duration=${overlap}:offset=${(timeline - overlap).toFixed(6)}[${next}]`,
        );
      else {
        const tail = `tail${index}`;
        filters.push(
          `[v${index}]trim=start_frame=${clip.overlapFrames},setpts=PTS-STARTPTS[${tail}]`,
        );
        filters.push(`[${combined}][${tail}]concat=n=2:v=1:a=0[${next}]`);
      }
      combined = next;
      timeline += (clip.sourceFrames - clip.overlapFrames) / 24;
    }
    filters.push(`[${combined}]trim=end_frame=${frames},setpts=PTS-STARTPTS,fps=24[vout]`);
    filters.push(
      metadata.audio
        ? `[${clips.length}:a:0]aresample=48000,apad,atrim=duration=${frames / 24},asetpts=PTS-STARTPTS[aout]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${frames / 24}[aout]`,
    );
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await runFile(
        this.ffmpeg,
        [
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          ...clips.flatMap((clip) => ['-i', clip.file]),
          '-i',
          source,
          '-filter_complex_threads',
          '1',
          '-filter_complex',
          filters.join(';'),
          '-map',
          '[vout]',
          '-map',
          '[aout]',
          '-frames:v',
          String(frames),
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          '18',
          '-pix_fmt',
          'yuv420p',
          '-r',
          '24',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-movflags',
          '+faststart',
          '-y',
          target,
        ],
        { windowsHide: true, timeout: 20 * 60 * 1000, maxBuffer: 2 * 1024 * 1024, signal },
      );
      const result = await this.probe(target);
      if (
        result.video?.frames !== frames ||
        !result.audio ||
        result.video.width !== width ||
        result.video.height !== height ||
        Math.abs((result.video.fps ?? 0) - 24) > 0.02
      )
        throw new Error(
          'Ripple assembly has unexpected streams or frame count; completed chunks are retained.',
        );
      return result;
    } catch (error) {
      await fs.rm(target, { force: true });
      throw error;
    }
  }
  /** Upload only the normalized tail needed for motion guidance; keep the original intact. */
  async prepareMotionContext(
    source: string,
    target: string,
    frames: number,
    width: number,
    height: number,
  ): Promise<void> {
    if (
      path.extname(target).toLowerCase() !== '.mp4' ||
      ![5, 22, 39].includes(frames) ||
      ![width, height].every(
        (value) => Number.isInteger(value) && value >= 256 && value <= 2048 && value % 32 === 0,
      )
    )
      throw new Error('Invalid motion-context canvas or length.');
    const metadata = await this.probe(source);
    const duration = metadata.video?.duration ?? metadata.duration;
    const total = Math.round(duration * 24);
    if (!metadata.video || duration > 300 || total < frames)
      throw new Error(
        'Source is too short for the selected motion context. Choose fewer context frames.',
      );
    const startFrame = total - frames;
    const start = startFrame / 24;
    const length = frames / 24;
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await runFile(
        this.ffmpeg,
        [
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          source,
          ...(metadata.audio ? [] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']),
          '-filter_complex',
          `[0:v]fps=24,trim=start_frame=${startFrame}:end_frame=${total},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[v];` +
            (metadata.audio
              ? `[0:a]atrim=start=${start},asetpts=PTS-STARTPTS,apad,atrim=duration=${length}[a]`
              : `[1:a]atrim=duration=${length},asetpts=PTS-STARTPTS[a]`),
          '-map',
          '[v]',
          '-map',
          '[a]',
          '-frames:v',
          String(frames),
          '-r',
          '24',
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          '18',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-ar',
          '48000',
          '-movflags',
          '+faststart',
          '-y',
          target,
        ],
        { windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 2 * 1024 * 1024 },
      );
      const prepared = await this.probe(target);
      if (
        prepared.video?.frames !== frames ||
        Math.abs((prepared.video.fps || 0) - 24) > 0.02 ||
        !prepared.audio
      )
        throw new Error('Prepared motion context has unexpected frames or audio.');
    } catch (error) {
      await fs.rm(target, { force: true });
      throw error;
    }
  }
  async clipVideo(source: string, target: string, start: number, end: number): Promise<void> {
    if (path.extname(target).toLowerCase() !== '.mp4')
      throw new Error('Clipped video must be an MP4.');
    const metadata = await this.probe(source);
    if (!metadata.video) throw new Error('Media has no video stream to clip.');
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end <= start ||
      end > metadata.duration + 0.001
    )
      throw new Error('Clip range is outside the source video.');
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await runFile(
        this.ffmpeg,
        [
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          source,
          '-ss',
          String(start),
          '-t',
          String(end - start),
          '-map',
          '0:v:0',
          '-map',
          '0:a?',
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          '18',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-movflags',
          '+faststart',
          '-y',
          target,
        ],
        { windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 2 * 1024 * 1024 },
      );
      const stat = await fs.stat(target);
      if (!stat.size) throw new Error('Clipping produced an empty file.');
    } catch (error) {
      await fs.rm(target, { force: true });
      throw error;
    }
  }
  async joinVideos(
    source: string,
    beat: string,
    target: string,
    width: number,
    height: number,
    retainedSourceFrames?: number,
    carrySourceAudio = true,
    blendFrames = 0,
  ): Promise<MediaProbe> {
    if (
      path.extname(target).toLowerCase() !== '.mp4' ||
      ![width, height].every(
        (value) => Number.isInteger(value) && value >= 256 && value <= 2048 && value % 32 === 0,
      )
    )
      throw new Error('Invalid continuation canvas.');
    const [original, generated] = await Promise.all([this.probe(source), this.probe(beat)]);
    const duration = (media: MediaProbe) =>
      media.video?.duration ??
      (media.video?.frames && media.video.fps
        ? media.video.frames / media.video.fps
        : media.duration);
    if (!original.video || !generated.video)
      throw new Error('Both continuation inputs must contain video.');
    const availableFrames = Math.round(duration(original) * 24);
    if (
      retainedSourceFrames !== undefined &&
      (!Number.isInteger(retainedSourceFrames) ||
        retainedSourceFrames < 1 ||
        retainedSourceFrames > availableFrames)
    )
      throw new Error('Selected continuation source range is invalid.');
    const sourceFrames = retainedSourceFrames ?? availableFrames;
    const beatFrames = Math.round(duration(generated) * 24);
    if (sourceFrames < 1 || beatFrames < 1)
      throw new Error('Continuation input has no usable frames.');
    if (
      !Number.isInteger(blendFrames) ||
      blendFrames < 0 ||
      blendFrames > 24 ||
      blendFrames >= Math.min(sourceFrames, beatFrames)
    )
      throw new Error('Invalid continuation blend overlap.');
    const videoFilter = (index: number, frames: number) =>
      `[${index}:v:0]fps=24,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${frames},settb=AVTB,setpts=N/(24*TB),fps=24,format=yuv420p[v${index}]`;
    const audioFilter = (index: number, media: MediaProbe, frames: number) =>
      `${media.audio ? `[${index}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad` : 'anullsrc=channel_layout=stereo:sample_rate=48000'},atrim=duration=${frames / 24},asetpts=PTS-STARTPTS[a${index}]`;
    const filter = [
      videoFilter(0, sourceFrames),
      videoFilter(1, beatFrames),
      audioFilter(0, carrySourceAudio ? original : { ...original, audio: null }, sourceFrames),
      audioFilter(1, generated, beatFrames),
      blendFrames > 0
        ? `[v0][v1]xfade=transition=fade:duration=${blendFrames / 24}:offset=${(sourceFrames - blendFrames) / 24}[v]`
        : '[v0][v1]concat=n=2:v=1:a=0[v]',
      blendFrames > 0
        ? `[a0][a1]acrossfade=d=${blendFrames / 24}:c1=tri:c2=tri[a]`
        : '[a0][a1]concat=n=2:v=0:a=1[a]',
    ].join(';');
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await runFile(
        this.ffmpeg,
        [
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          source,
          '-i',
          beat,
          '-filter_complex',
          filter,
          '-map',
          '[v]',
          '-map',
          '[a]',
          '-r',
          '24',
          '-fps_mode',
          'cfr',
          '-frames:v',
          String(sourceFrames + beatFrames - blendFrames),
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          '18',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-movflags',
          '+faststart',
          '-y',
          target,
        ],
        { windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 2 * 1024 * 1024 },
      );
      const joined = await this.probe(target);
      if (
        joined.video?.frames !== sourceFrames + beatFrames - blendFrames ||
        !joined.audio ||
        Math.abs(joined.duration - (sourceFrames + beatFrames - blendFrames) / 24) > 0.1
      )
        throw new Error(
          `Joined continuation has unexpected frame count, audio or duration: expected ${sourceFrames + beatFrames - blendFrames} frames, received ${JSON.stringify(joined)}.`,
        );
      return joined;
    } catch (error) {
      await fs.rm(target, { force: true });
      throw error;
    }
  }
}
