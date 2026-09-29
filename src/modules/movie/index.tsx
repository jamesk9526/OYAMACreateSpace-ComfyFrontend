import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import {
  FileAudio,
  Film,
  Image,
  Minus,
  Pause,
  Play,
  Plus,
  Scissors,
  SkipBack,
  SkipForward,
  Trash2,
} from 'lucide-react';
import { guarded, refreshLibrary, useLibrary, useShell } from '../../stores';
import {
  emptyMovieTimeline,
  type MovieTimeline,
  type MovieTimelineClip,
} from '../../../shared/movie-timeline';
import './movie.css';
import { formatTimecode, frameToSeconds, parseTimecode, secondsToFrame } from './timecode';
import { persistMovieTimeline, useMovieSession } from './session';
import { snapClipStart, trimClip } from './editing';

const fallbackClipDuration = 5;

export function MovieWorkspace() {
  const projectId = useShell((s) => s.projectId);
  const selectedId = useShell((s) => s.selectedAsset);
  const assets = useLibrary((s) => s.assets);
  const selected = assets.find((a) => a.id === selectedId && a.projectId === projectId);
  useEffect(() => {
    if (!selected || selected.missing || selected.media || selected.kind === 'image') return;
    void guarded(async () => {
      await window.oyama.probeAsset(selected.id);
      await refreshLibrary();
    });
  }, [selected?.id, selected?.kind, selected?.media, selected?.missing]);
  const root = useRef<HTMLDivElement>(null);
  const previewVideo = useRef<HTMLVideoElement>(null);
  const previewAudio = useRef<HTMLAudioElement>(null);
  const previewFrame = useRef<HTMLDivElement>(null);
  const timelineCanvas = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const scrubbingTimeline = useRef(false);
  const [timelineHeight, setTimelineHeight] = useState(20);
  const loadedTimeline = useMovieSession((state) => state.timeline);
  const timeline =
    loadedTimeline?.projectId === projectId ? loadedTimeline : emptyMovieTimeline(projectId);
  const setTimeline = useMovieSession((state) => state.setTimeline);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const selectedClipId = useMovieSession((state) => state.selectedClipId);
  const setSelectedClipId = useMovieSession((state) => state.selectClip);
  const [timelineNotice, setTimelineNotice] = useState('');
  const [pixelsPerSecond, setPixelsPerSecond] = useState(60);
  const [timecodeDraft, setTimecodeDraft] = useState('');
  const [previewBounds, setPreviewBounds] = useState({ width: 0, height: 0 });
  const [previewAspect, setPreviewAspect] = useState(0);
  const [trimDraft, setTrimDraft] = useState<MovieTimelineClip | null>(null);
  const trimGesture = useRef<{ clip: MovieTimelineClip; edge: 'start' | 'end'; x: number } | null>(
    null,
  );
  const videoAssets = assets.filter((asset) => asset.projectId === projectId);

  useEffect(() => {
    let current = true;
    setPlaying(false);
    setPlayhead(0);
    setSelectedClipId(null);
    void guarded(async () => {
      const loaded =
        typeof window.oyama.loadMovieTimeline === 'function'
          ? await window.oyama.loadMovieTimeline(projectId)
          : emptyMovieTimeline(projectId);
      if (current) {
        setTimeline(loaded);
        if (typeof window.oyama.loadMovieTimeline !== 'function')
          setTimelineNotice('Restart the updated app to save timeline clips between sessions.');
      }
    });
    return () => {
      current = false;
    };
  }, [projectId]);

  const sequenceDuration = useMemo(
    () => Math.max(0, ...timeline.clips.map((clip) => clip.start + clip.duration)),
    [timeline.clips],
  );
  const sourceDuration = selected?.kind === 'video' ? selected.media?.duration || 0 : 0;
  const duration = timeline.clips.length ? sequenceDuration : sourceDuration;
  const displayDuration = Math.max(10, Math.ceil(duration / 5) * 5);
  const fps = timeline.fps;
  const activeClip = [...timeline.clips]
    .reverse()
    .find(
      (clip) =>
        clip.track === 'video' && playhead >= clip.start && playhead < clip.start + clip.duration,
    );
  const activeAsset = videoAssets.find((asset) => asset.id === activeClip?.assetId);
  const activeAudioClip = [...timeline.clips]
    .reverse()
    .find(
      (clip) =>
        clip.track === 'audio' && playhead >= clip.start && playhead < clip.start + clip.duration,
    );
  const activeAudioAsset = videoAssets.find((asset) => asset.id === activeAudioClip?.assetId);
  const previewAsset = activeAsset || (!timeline.clips.length ? selected : undefined);
  const previewVideoAsset = previewAsset?.kind === 'video' ? previewAsset : undefined;
  useEffect(() => {
    const frame = previewFrame.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setPreviewBounds({ width, height });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setPreviewAspect(0), [previewAsset?.id]);
  const fittedPreview =
    previewAspect > 0 && previewBounds.width > 0 && previewBounds.height > 0
      ? {
          width: Math.min(previewBounds.width, previewBounds.height * previewAspect),
          height: Math.min(previewBounds.height, previewBounds.width / previewAspect),
        }
      : undefined;

  useEffect(() => {
    const video = previewVideo.current;
    if (!video || !previewVideoAsset) return;
    const sourceTime = activeClip
      ? activeClip.sourceStart +
        Math.max(0, Math.min(activeClip.duration, playhead - activeClip.start))
      : Math.max(0, Math.min(duration, playhead));
    if (Math.abs(video.currentTime - sourceTime) > (playing ? 1 / fps : 0.001))
      video.currentTime = sourceTime;
  }, [activeClip, duration, fps, playhead, playing, previewVideoAsset]);

  useEffect(() => {
    const video = previewVideo.current;
    if (!video || !activeClip) return;
    video.volume = Math.min(1, activeClip.volume);
    video.muted = activeClip.muted;
  }, [activeClip]);

  useEffect(() => {
    const audio = previewAudio.current;
    if (!audio || !activeAudioClip) return;
    const sourceTime = activeAudioClip.sourceStart + playhead - activeAudioClip.start;
    if (Math.abs(audio.currentTime - sourceTime) > (playing ? 1 / fps : 0.001))
      audio.currentTime = sourceTime;
    audio.volume = Math.min(1, activeAudioClip.volume);
    audio.muted = activeAudioClip.muted;
  }, [activeAudioClip, fps, playhead, playing]);

  useEffect(() => {
    const video = previewVideo.current;
    if (!video) return;
    if (previewVideoAsset && playing) void video.play().catch(() => setPlaying(false));
    else video.pause();
  }, [previewVideoAsset, playing]);
  useEffect(() => {
    const audio = previewAudio.current;
    if (!audio) return;
    if (playing) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }, [activeAudioAsset, playing]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - previous) / 1000;
      previous = now;
      const next = playheadRef.current + elapsed;
      if (next >= duration) {
        setPlayhead(duration);
        setPlaying(false);
        return;
      }
      playheadRef.current = next;
      setPlayhead(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, playing]);

  const playheadRef = useRef(playhead);
  useEffect(() => {
    playheadRef.current = playhead;
  }, [playhead]);

  const saveTimeline = async (next: MovieTimeline) => {
    setTimelineNotice('');
    if (typeof window.oyama.saveMovieTimeline === 'function') {
      try {
        next = await persistMovieTimeline(next);
      } catch (error) {
        useShell.getState().setError(error);
        return;
      }
    } else {
      setTimelineNotice('Restart the updated app to save timeline clips between sessions.');
      setTimeline(next);
    }
  };

  const updateTimeline = (clips: MovieTimelineClip[]) =>
    saveTimeline({ ...timeline, projectId, clips });

  const dropOnTrack = async (event: DragEvent<HTMLDivElement>, track: 'video' | 'audio') => {
    event.preventDefault();
    const rect = timelineCanvas.current?.getBoundingClientRect();
    if (!rect) return;
    const rawStart = Math.max(0, (event.clientX - rect.left) / pixelsPerSecond);
    const movedId = event.dataTransfer.getData('application/x-oyama-movie-clip');
    if (movedId) {
      const moving = timeline.clips.find((clip) => clip.id === movedId);
      if (!moving || moving.locked) return;
      const asset = videoAssets.find((item) => item.id === moving.assetId);
      const correctTrack = asset?.kind === 'audio' ? 'audio' : 'video';
      if (track !== correctTrack) {
        setTimelineNotice(
          `Place ${asset?.kind || 'this media'} on ${correctTrack === 'audio' ? 'Audio 1' : 'Video 1'}.`,
        );
        return;
      }
      const start = snapClipStart(
        rawStart,
        moving.duration,
        timeline.clips.filter((clip) => clip.id !== movedId && clip.track === track),
        playhead,
        fps,
        pixelsPerSecond,
        timeline.snap,
      );
      await updateTimeline(
        timeline.clips.map((clip) => (clip.id === movedId ? { ...clip, start } : clip)),
      );
      return;
    }
    const assetId = event.dataTransfer.getData('application/x-oyama-movie-asset');
    const asset = videoAssets.find((item) => item.id === assetId);
    if (!asset || asset.missing) return;
    const targetTrack = asset.kind === 'audio' ? 'audio' : 'video';
    if (track !== targetTrack) {
      setTimelineNotice(
        `Place ${asset.kind} on ${targetTrack === 'audio' ? 'Audio 1' : 'Video 1'}.`,
      );
      return;
    }
    let clipDuration = asset.media?.duration;
    if (!clipDuration && asset.kind !== 'image') {
      try {
        clipDuration = (await window.oyama.probeAsset(asset.id)).duration;
        await refreshLibrary();
      } catch {
        setTimelineNotice(
          `Could not read ${asset.name}. Check that the media file is available and supported.`,
        );
        return;
      }
    }
    if (asset.kind !== 'image' && (!clipDuration || clipDuration <= 0)) {
      setTimelineNotice(`Could not read the duration of ${asset.name}.`);
      return;
    }
    const clip: MovieTimelineClip = {
      id: crypto.randomUUID(),
      assetId,
      track,
      start: snapClipStart(
        rawStart,
        clipDuration || fallbackClipDuration,
        timeline.clips.filter((item) => item.track === track),
        playhead,
        fps,
        pixelsPerSecond,
        timeline.snap,
      ),
      duration: clipDuration || fallbackClipDuration,
      sourceStart: 0,
      volume: 1,
      muted: false,
      locked: false,
    };
    await updateTimeline([...timeline.clips, clip]);
    setSelectedClipId(clip.id);
    setPlayhead(clip.start);
  };

  const scrubAt = (seconds: number) => {
    setPlaying(false);
    setPlayhead(Math.max(0, Math.min(displayDuration, seconds)));
  };

  const stepFrame = (amount: number) => {
    setPlaying(false);
    setPlayhead((current) =>
      Math.max(
        0,
        Math.min(displayDuration, frameToSeconds(secondsToFrame(current, fps) + amount, fps)),
      ),
    );
  };
  const pointerTime = (event: { clientX: number }) => {
    const rect = timelineCanvas.current?.getBoundingClientRect();
    if (!rect) return;
    scrubAt((event.clientX - rect.left) / pixelsPerSecond);
  };
  const deleteSelected = () => {
    if (!selectedClipId || timeline.clips.find((clip) => clip.id === selectedClipId)?.locked)
      return;
    void updateTimeline(timeline.clips.filter((clip) => clip.id !== selectedClipId));
    setSelectedClipId(null);
  };
  const splitSelected = () => {
    const clip = timeline.clips.find((item) => item.id === selectedClipId);
    if (!clip || clip.locked || playhead <= clip.start || playhead >= clip.start + clip.duration)
      return;
    const firstDuration = playhead - clip.start;
    const second: MovieTimelineClip = {
      ...clip,
      id: crypto.randomUUID(),
      start: playhead,
      sourceStart: clip.sourceStart + firstDuration,
      duration: clip.duration - firstDuration,
    };
    void updateTimeline(
      timeline.clips.flatMap((item) =>
        item.id === clip.id ? [{ ...item, duration: firstDuration }, second] : [item],
      ),
    );
    setSelectedClipId(second.id);
  };
  const moveTrim = (clientX: number) => {
    const gesture = trimGesture.current;
    if (!gesture) return null;
    const asset = videoAssets.find((item) => item.id === gesture.clip.assetId);
    const next = trimClip(
      gesture.clip,
      gesture.edge,
      (clientX - gesture.x) / pixelsPerSecond,
      fps,
      asset?.kind === 'image' ? undefined : asset?.media?.duration,
    );
    setTrimDraft(next);
    return next;
  };
  const setFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = root.current?.getBoundingClientRect();
    if (!rect) return;
    setTimelineHeight(
      Math.max(12, Math.min(65, ((rect.bottom - event.clientY) / rect.height) * 100)),
    );
  };

  return (
    <div
      className="movie-workspace"
      ref={root}
      tabIndex={-1}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.matches('input, textarea, select') || target.closest('.movie-timeline-tools'))
          return;
        if (event.code === 'Space') {
          event.preventDefault();
          if (duration > 0) setPlaying((value) => !value);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          stepFrame(event.key === 'ArrowRight' ? 1 : -1);
        } else if (event.key === 'Delete') {
          event.preventDefault();
          deleteSelected();
        } else if (event.key.toLowerCase() === 's' && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          splitSelected();
        }
      }}
      style={{ gridTemplateRows: `minmax(0, 1fr) 6px minmax(0, ${timelineHeight}%)` }}
    >
      <section className="movie-viewer" aria-label="Movie preview">
        <header className="movie-panel-heading">Preview</header>
        <div className="movie-viewer-stage">
          <div className="movie-preview-frame" ref={previewFrame}>
            {activeAudioAsset && !activeAudioAsset.missing && (
              <audio
                key={activeAudioClip?.id}
                ref={previewAudio}
                src={activeAudioAsset.url}
                preload="metadata"
                aria-hidden="true"
              />
            )}
            {previewAsset && !previewAsset.missing && previewAsset.kind === 'video' ? (
              <video
                key={previewAsset.id}
                ref={previewVideo}
                src={previewAsset.url}
                style={fittedPreview}
                preload="metadata"
                onLoadedMetadata={(event) => {
                  const { videoWidth, videoHeight } = event.currentTarget;
                  if (videoWidth > 0 && videoHeight > 0) setPreviewAspect(videoWidth / videoHeight);
                }}
              />
            ) : previewAsset && !previewAsset.missing && previewAsset.kind === 'image' ? (
              <img
                src={previewAsset.url}
                alt={previewAsset.name}
                style={fittedPreview}
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (naturalWidth > 0 && naturalHeight > 0)
                    setPreviewAspect(naturalWidth / naturalHeight);
                }}
              />
            ) : (
              'No clip selected'
            )}
          </div>
        </div>
        <div className="movie-viewer-footer">
          <div className="movie-transport">
            <button
              className="movie-transport-button"
              aria-label="Previous frame"
              onClick={() => stepFrame(-1)}
            >
              <SkipBack size={13} />
            </button>
            <button
              className="movie-transport-button movie-play-button"
              aria-label={playing ? 'Pause' : 'Play'}
              disabled={duration <= 0}
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <button
              className="movie-transport-button"
              aria-label="Next frame"
              onClick={() => stepFrame(1)}
            >
              <SkipForward size={13} />
            </button>
            <input
              className="movie-timecode movie-timecode-input"
              aria-label="Current movie timecode"
              value={timecodeDraft || formatTimecode(playhead, fps)}
              onFocus={() => setTimecodeDraft(formatTimecode(playhead, fps))}
              onChange={(event) => setTimecodeDraft(event.target.value)}
              onBlur={() => {
                const parsed = parseTimecode(timecodeDraft, fps);
                if (parsed !== null) scrubAt(parsed);
                setTimecodeDraft('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                  setTimecodeDraft('');
                  event.currentTarget.blur();
                }
              }}
            />
            <i className="movie-timecode-divider">/</i>
            <span className="movie-timecode">{formatTimecode(duration, fps)}</span>
          </div>
          <input
            className="movie-scrubber"
            type="range"
            min={0}
            max={Math.max(duration, 1 / fps)}
            step={1 / fps}
            value={Math.min(playhead, Math.max(duration, 1 / fps))}
            aria-label="Scrub movie preview"
            onPointerDown={() => {
              setPlaying(false);
            }}
            onChange={(event) => setPlayhead(Number(event.target.value))}
          />
        </div>
      </section>
      <div
        className="movie-resize movie-resize-timeline"
        role="separator"
        tabIndex={0}
        aria-label="Resize preview and timeline"
        aria-orientation="horizontal"
        aria-valuemin={12}
        aria-valuemax={65}
        aria-valuenow={Math.round(timelineHeight)}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (dragging.current) setFromPointer(event);
        }}
        onPointerUp={(event) => {
          if (dragging.current) setFromPointer(event);
          dragging.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 5 : 1;
          const delta = event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
          if (delta) {
            event.preventDefault();
            setTimelineHeight(Math.max(12, Math.min(65, timelineHeight + delta)));
          }
        }}
      />
      <section className="movie-timeline" aria-label="Movie timeline">
        <header className="movie-panel-heading movie-timeline-heading">
          <span>Timeline</span>
          <div className="movie-timeline-tools">
            <button
              className={timeline.snap ? 'active' : ''}
              onClick={() => void saveTimeline({ ...timeline, snap: !timeline.snap })}
            >
              Snap
            </button>
            <button
              aria-label="Split selected clip"
              title="Split selected clip (S)"
              disabled={
                !selectedClipId || timeline.clips.find((clip) => clip.id === selectedClipId)?.locked
              }
              onClick={splitSelected}
            >
              <Scissors size={12} />
            </button>
            <button
              aria-label="Delete selected clip"
              title="Delete selected clip (Delete)"
              disabled={
                !selectedClipId || timeline.clips.find((clip) => clip.id === selectedClipId)?.locked
              }
              onClick={deleteSelected}
            >
              <Trash2 size={12} />
            </button>
            <button
              aria-label="Zoom out timeline"
              onClick={() => setPixelsPerSecond((value) => Math.max(20, value - 20))}
            >
              <Minus size={12} />
            </button>
            <input
              aria-label="Timeline zoom"
              type="range"
              min={20}
              max={240}
              step={10}
              value={pixelsPerSecond}
              onChange={(event) => setPixelsPerSecond(Number(event.target.value))}
            />
            <button
              aria-label="Zoom in timeline"
              onClick={() => setPixelsPerSecond((value) => Math.min(240, value + 20))}
            >
              <Plus size={12} />
            </button>
            <span>{timelineNotice || formatTimecode(playhead, fps)}</span>
          </div>
        </header>
        <div className="movie-timeline-body">
          <div className="movie-track-labels">
            <div />
            <div>Video 1</div>
            <div>Audio 1</div>
          </div>
          <div className="movie-track-viewport">
            <div
              className="movie-track-content"
              ref={timelineCanvas}
              style={{ width: `${displayDuration * pixelsPerSecond}px` }}
            >
              <div
                className="movie-ruler"
                onPointerDown={(event) => {
                  scrubbingTimeline.current = true;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  pointerTime(event);
                }}
                onPointerMove={(event) => {
                  if (scrubbingTimeline.current) pointerTime(event);
                }}
                onPointerUp={(event) => {
                  pointerTime(event);
                  scrubbingTimeline.current = false;
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => {
                  scrubbingTimeline.current = false;
                }}
              >
                {Array.from(
                  {
                    length:
                      Math.floor(
                        displayDuration /
                          (pixelsPerSecond >= 100 ? 1 : pixelsPerSecond >= 45 ? 5 : 10),
                      ) + 1,
                  },
                  (_, index) => {
                    const interval = pixelsPerSecond >= 100 ? 1 : pixelsPerSecond >= 45 ? 5 : 10;
                    const tick = index * interval;
                    return (
                      <span key={index} style={{ left: `${tick * pixelsPerSecond}px` }}>
                        {formatTimecode(tick, fps).slice(0, 8)}
                      </span>
                    );
                  },
                )}
              </div>
              {(['video', 'audio'] as const).map((track) => (
                <div
                  className="movie-track"
                  key={track}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => void dropOnTrack(event, track)}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest('.movie-timeline-clip')) return;
                    pointerTime(event);
                  }}
                >
                  {timeline.clips
                    .filter((clip) => clip.track === track)
                    .map((clip) => {
                      const asset = videoAssets.find((item) => item.id === clip.assetId);
                      const shown = trimDraft?.id === clip.id ? trimDraft : clip;
                      return (
                        <button
                          key={clip.id}
                          className={`movie-timeline-clip ${selectedClipId === clip.id ? 'selected' : ''} ${clip.locked ? 'locked' : ''}`}
                          style={{
                            left: `${shown.start * pixelsPerSecond}px`,
                            width: `${Math.max(40, shown.duration * pixelsPerSecond)}px`,
                          }}
                          draggable={!clip.locked}
                          aria-label={`${asset?.name || 'Missing media'} at ${formatTimecode(clip.start, fps)}`}
                          onClick={() => {
                            setSelectedClipId(clip.id);
                            useShell.setState({ selectedAsset: clip.assetId });
                          }}
                          onDragStart={(event) => {
                            if (trimGesture.current) {
                              event.preventDefault();
                              return;
                            }
                            event.dataTransfer.setData('application/x-oyama-movie-clip', clip.id);
                            event.dataTransfer.effectAllowed = 'move';
                          }}
                        >
                          {!clip.locked &&
                            (['start', 'end'] as const).map((edge) => (
                              <span
                                key={edge}
                                className={`movie-trim-handle ${edge}`}
                                title={`Trim ${edge} of ${asset?.name || 'clip'}`}
                                onPointerDown={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  trimGesture.current = { clip, edge, x: event.clientX };
                                  event.currentTarget.setPointerCapture(event.pointerId);
                                  setSelectedClipId(clip.id);
                                }}
                                onPointerMove={(event) => {
                                  if (trimGesture.current) moveTrim(event.clientX);
                                }}
                                onPointerUp={(event) => {
                                  const next = moveTrim(event.clientX);
                                  trimGesture.current = null;
                                  setTrimDraft(null);
                                  event.currentTarget.releasePointerCapture(event.pointerId);
                                  if (
                                    next &&
                                    (next.start !== clip.start || next.duration !== clip.duration)
                                  )
                                    void updateTimeline(
                                      timeline.clips.map((item) =>
                                        item.id === clip.id ? next : item,
                                      ),
                                    );
                                }}
                                onPointerCancel={() => {
                                  trimGesture.current = null;
                                  setTrimDraft(null);
                                }}
                              />
                            ))}
                          {asset?.name || 'Missing media'}
                        </button>
                      );
                    })}
                  <div
                    className="movie-playhead"
                    style={{ left: `${playhead * pixelsPerSecond}px` }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function MovieSidebar({
  width,
  onResize,
}: {
  width: number;
  onResize: (width: number) => void;
}) {
  const [tab, setTab] = useState<'Media' | 'Properties' | 'Export'>('Media');
  const [mediaPage, setMediaPage] = useState(0);
  const [importing, setImporting] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [importNotice, setImportNotice] = useState('');
  const projectId = useShell((s) => s.projectId);
  const selectedId = useShell((s) => s.selectedAsset);
  const libraryAssets = useLibrary((s) => s.assets);
  const assets = libraryAssets.filter((a) => a.projectId === projectId);
  const pageCount = Math.max(1, Math.ceil(assets.length / 6));
  const currentPage = Math.min(mediaPage, pageCount - 1);
  const selected = assets.find((a) => a.id === selectedId);
  const movieTimeline = useMovieSession((state) => state.timeline);
  const selectedClipId = useMovieSession((state) => state.selectedClipId);
  const selectedClip =
    movieTimeline?.projectId === projectId
      ? movieTimeline.clips.find((clip) => clip.id === selectedClipId)
      : undefined;
  const clipAsset = assets.find((asset) => asset.id === selectedClip?.assetId);
  const updateClip = (patch: Partial<MovieTimelineClip>) => {
    if (!movieTimeline || !selectedClip) return;
    const updated = { ...selectedClip, ...patch };
    const sourceDuration = clipAsset?.kind === 'image' ? undefined : clipAsset?.media?.duration;
    if (
      updated.duration < 1 / movieTimeline.fps ||
      updated.start < 0 ||
      updated.sourceStart < 0 ||
      (sourceDuration &&
        updated.sourceStart + updated.duration > sourceDuration + 1 / movieTimeline.fps)
    ) {
      useShell
        .getState()
        .setError('Clip trim exceeds the source media or is shorter than one frame.');
      return;
    }
    void guarded(() =>
      persistMovieTimeline({
        ...movieTimeline,
        clips: movieTimeline.clips.map((clip) => (clip.id === selectedClip.id ? updated : clip)),
      }),
    );
  };
  const dragging = useRef(false);
  const setFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const body = event.currentTarget.parentElement?.parentElement;
    if (!body) return;
    const rect = body.getBoundingClientRect();
    const next = Math.max(190, Math.min(480, rect.right - event.clientX));
    onResize(next);
  };
  const importFiles = (source: 'files' | 'folder') =>
    void guarded(async () => {
      setImporting(true);
      try {
        if (typeof window.oyama.importMovieMedia === 'function') {
          await window.oyama.importMovieMedia({ projectId, source });
        } else {
          await window.oyama.importMedia({ projectId });
          setImportNotice(
            source === 'folder'
              ? 'This running app supports file import. Restart the updated app to import folders directly.'
              : 'Using the compatible file importer. Restart the updated app for direct Movie imports.',
          );
        }
        await refreshLibrary();
      } finally {
        setImporting(false);
      }
    });
  const dropFiles = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingFiles(false);
    setImportNotice('');
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) return;
    void guarded(async () => {
      setImporting(true);
      try {
        if (typeof window.oyama.importDroppedMovieMedia === 'function') {
          await window.oyama.importDroppedMovieMedia(projectId, files);
        } else {
          await window.oyama.importMedia({ projectId });
          setImportNotice(
            'This running app needs an update for direct drop import. Select the dropped files in the compatible file picker, or restart the updated app.',
          );
        }
        await refreshLibrary();
      } finally {
        setImporting(false);
      }
    });
  };
  return (
    <aside className="rightpanel movie-sidebar" aria-label="Movie sidebar">
      <div
        className="movie-resize movie-resize-sidebar"
        role="separator"
        tabIndex={0}
        aria-label="Resize movie media bin"
        aria-orientation="vertical"
        aria-valuemin={190}
        aria-valuemax={480}
        aria-valuenow={width}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (dragging.current) setFromPointer(event);
        }}
        onPointerUp={(event) => {
          if (dragging.current) setFromPointer(event);
          dragging.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 1;
          const delta = event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0;
          if (delta) {
            event.preventDefault();
            const next = Math.max(190, Math.min(480, width + delta));
            onResize(next);
          }
        }}
      />
      <div className="panel-tabs">
        {(['Media', 'Properties', 'Export'] as const).map((name) => (
          <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>
            {name}
          </button>
        ))}
      </div>
      {tab === 'Media' ? (
        <div
          className={`movie-bin-body ${draggingFiles ? 'dragging' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDraggingFiles(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDraggingFiles(false);
          }}
          onDrop={dropFiles}
        >
          <div className="movie-import-actions">
            <button className="smallbtn" disabled={importing} onClick={() => importFiles('files')}>
              Import files
            </button>
            <button className="smallbtn" disabled={importing} onClick={() => importFiles('folder')}>
              Choose folder
            </button>
          </div>
          {assets.length ? (
            <>
              <div className="movie-media-grid">
                {assets.slice(currentPage * 6, currentPage * 6 + 6).map((asset) => {
                  const Icon =
                    asset.kind === 'video' ? Film : asset.kind === 'audio' ? FileAudio : Image;
                  return (
                    <button
                      className={`movie-media-item ${asset.id === selectedId ? 'selected' : ''}`}
                      key={asset.id}
                      onClick={() => {
                        useShell.setState({ selectedAsset: asset.id });
                        useMovieSession.getState().selectClip(null);
                      }}
                      draggable={!asset.missing}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('application/x-oyama-movie-asset', asset.id);
                        event.dataTransfer.effectAllowed = 'copy';
                      }}
                    >
                      <span className="movie-media-thumb">
                        {asset.kind === 'image' && !asset.missing ? (
                          <img src={asset.url} alt="" loading="lazy" />
                        ) : asset.kind === 'video' && !asset.missing ? (
                          <video
                            src={asset.url}
                            muted
                            loop
                            preload="metadata"
                            aria-hidden="true"
                            onMouseEnter={(event) =>
                              void event.currentTarget.play().catch(() => {})
                            }
                            onMouseLeave={(event) => {
                              event.currentTarget.pause();
                              event.currentTarget.currentTime = 0;
                            }}
                          />
                        ) : (
                          <Icon size={20} />
                        )}
                      </span>
                      <span className="movie-media-name" title={asset.name}>
                        {asset.name}
                      </span>
                    </button>
                  );
                })}
              </div>
              {pageCount > 1 && (
                <div className="movie-media-pages">
                  <button
                    className="smallbtn"
                    disabled={currentPage === 0}
                    onClick={() => setMediaPage(currentPage - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    {currentPage + 1} / {pageCount}
                  </span>
                  <button
                    className="smallbtn"
                    disabled={currentPage === pageCount - 1}
                    onClick={() => setMediaPage(currentPage + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="movie-bin-empty">Drop media here or choose files or a folder.</div>
          )}
          {importNotice && (
            <div className="movie-import-notice" role="status">
              {importNotice}
            </div>
          )}
        </div>
      ) : tab === 'Properties' ? (
        <div className="movie-sidebar-content">
          {selectedClip && clipAsset && movieTimeline ? (
            <>
              <strong>{clipAsset.name}</strong>
              <p>
                {selectedClip.track === 'audio' ? 'Audio' : 'Video'} clip ·{' '}
                {formatTimecode(selectedClip.duration, movieTimeline.fps)}
              </p>
              <MovieNumberField
                label="Timeline start"
                value={selectedClip.start}
                min={0}
                max={86400}
                step={1 / movieTimeline.fps}
                disabled={selectedClip.locked}
                onCommit={(start) => updateClip({ start })}
              />
              <MovieNumberField
                label="Source in"
                value={selectedClip.sourceStart}
                min={0}
                max={86400}
                step={1 / movieTimeline.fps}
                disabled={selectedClip.locked}
                onCommit={(sourceStart) => updateClip({ sourceStart })}
              />
              <MovieNumberField
                label="Duration"
                value={selectedClip.duration}
                min={1 / movieTimeline.fps}
                max={86400}
                step={1 / movieTimeline.fps}
                disabled={selectedClip.locked}
                onCommit={(duration) => updateClip({ duration })}
              />
              {clipAsset.kind !== 'image' && (
                <MovieNumberField
                  label="Preview volume"
                  value={selectedClip.volume}
                  min={0}
                  max={1}
                  step={0.05}
                  disabled={selectedClip.locked}
                  onCommit={(volume) => updateClip({ volume })}
                />
              )}
              <label className="movie-property-toggle">
                <input
                  type="checkbox"
                  checked={selectedClip.muted}
                  disabled={selectedClip.locked}
                  onChange={(event) => updateClip({ muted: event.target.checked })}
                />
                Mute clip
              </label>
              <label className="movie-property-toggle">
                <input
                  type="checkbox"
                  checked={selectedClip.locked}
                  onChange={(event) => updateClip({ locked: event.target.checked })}
                />
                Lock clip
              </label>
            </>
          ) : selected ? (
            <>
              <strong>{selected.name}</strong>
              <p>{selected.kind}</p>
              {selected.media && <p>{selected.media.duration.toFixed(2)} s</p>}
            </>
          ) : (
            'Select media to see its properties.'
          )}
        </div>
      ) : (
        <div className="movie-sidebar-content">Export settings and options will appear here.</div>
      )}
    </aside>
  );
}

function MovieNumberField({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const numeric = Number(draft);
    if (Number.isFinite(numeric) && numeric >= min && numeric <= max && numeric !== value)
      onCommit(numeric);
    setDraft(String(value));
  };
  return (
    <label className="movie-property-field">
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}
