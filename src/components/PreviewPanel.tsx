import { useEffect, useRef, useState } from 'react';
import type { Asset } from '../../shared/domain';
import { Columns2, Expand, Scan, Sparkles } from 'lucide-react';
import { draftKey, useDrafts, useJobs, useLibrary, useShell } from '../stores';
import { moduleDefaults } from '../modules/registry';
export function PreviewPanel({ inputs = [] }: { inputs?: { label: string; asset?: Asset; seekSeconds?: number }[] }) {
  const moduleId = useShell((s) => s.area);
  const projectId = useShell((s) => s.projectId);
  const selectedId = useShell((s) => s.selectedAsset);
  const assets = useLibrary((s) => s.assets);
  const jobs = useJobs((s) => s.jobs);
  const draft =
    useDrafts((s) => s.drafts[draftKey(projectId, moduleId)]?.values) || moduleDefaults(moduleId);
  const liveJob = jobs.find(
    (j) =>
      j.projectId === projectId &&
      j.moduleId === moduleId &&
      ['running', 'queued', 'recovering'].includes(j.status) &&
      j.preview,
  );
  const [liveUrl, setLiveUrl] = useState<string>();
  useEffect(() => {
    if (!liveJob?.preview) {
      setLiveUrl(undefined);
      return;
    }
    const [header, encoded] = liveJob.preview.split(',');
    const mime = header.slice(5, header.indexOf(';'));
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    setLiveUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [liveJob?.preview]);
  const projectJobs = jobs.filter(
    (j) => j.projectId === projectId && j.moduleId === moduleId && j.status === 'complete',
  );
  const moduleAssetIds = new Set(projectJobs.flatMap((job) => job.assetIds));
  const output =
    assets.find((a) => a.id === selectedId && moduleAssetIds.has(a.id)) ||
    assets.find((a) => a.id === projectJobs[0]?.assetIds[0]);
  const previous = assets.find(
    (a) => a.id === projectJobs.find((j) => j.assetIds[0] !== output?.id)?.assetIds[0],
  );
  const panel = useRef<HTMLElement>(null);
  const [bounds, setBounds] = useState({ width: 800, height: 500 });
  useEffect(() => {
    if (!panel.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setBounds({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(panel.current);
    return () => observer.disconnect();
  }, []);
  const [actual, setActual] = useState(false);
  const [compare, setCompare] = useState(false);
  const [view, setView] = useState('Result');
  const firstInput = inputs.find((input) => input.asset && !input.asset.missing);
  useEffect(() => {
    setView(output ? 'Result' : firstInput?.label || 'Result');
  }, [output?.id, firstInput?.asset?.id]);
  useEffect(() => {
    if (liveJob?.id) {
      setView('Live');
      setCompare(false);
    }
  }, [liveJob?.id]);
  useEffect(() => {
    if (!liveJob && view === 'Live') setView('Result');
  }, [liveJob?.id, view]);
  const viewedAsset =
    view === 'Result' ? output : inputs.find((input) => input.label === view)?.asset;
  const viewedSeek = inputs.find((input) => input.label === view)?.seekSeconds;
  useEffect(() => {
    if (viewedSeek === undefined || !Number.isFinite(viewedSeek)) return;
    const video = panel.current?.querySelector<HTMLVideoElement>('.preview video');
    if (video && video.readyState >= 1) video.currentTime = viewedSeek;
  }, [view, viewedAsset?.id, viewedSeek]);
  const dimensions = viewedAsset?.dimensions || viewedAsset?.media?.video;
  const width = Number(dimensions?.width || draft.width || 16);
  const height = Number(dimensions?.height || draft.height || 9);
  const ratio = width > 0 && height > 0 ? width / height : 16 / 9;
  const previewWidth = Math.max(
    1,
    Math.min(bounds.width * (compare ? 0.9 : 0.72), Math.max(1, bounds.height - 90) * ratio),
  );
  const render = (a: typeof output) =>
    !a || a.missing ? (
      <div className="preview-inner">
        <div className="preview-icon">
          <Sparkles size={22} />
        </div>
        <b>Generation Preview</b>
        <span>
          Your generated image or video will appear here. The active module controls the workspace
          while CreateSpace keeps the shell consistent.
        </span>
      </div>
    ) : a.kind === 'video' ? (
      <video key={a.id} src={a.url} controls preload="metadata" onLoadedMetadata={(event) => {
        if (viewedSeek !== undefined && a.id === viewedAsset?.id) event.currentTarget.currentTime = viewedSeek;
      }} />
    ) : a.kind === 'audio' ? (
      <audio key={a.id} src={a.url} controls />
    ) : (
      <img src={a.url} alt={a.name} />
    );
  return (
    <section className={`canvasarea ${actual ? 'actual-size' : ''}`} ref={panel}>
      <div className="canvas-toolbar">
        {liveJob && (
          <button
            className={`preview-view ${view === 'Live' ? 'on' : ''}`}
            onClick={() => {
              setView('Live');
              setCompare(false);
            }}
          >
            Live
          </button>
        )}
        {inputs.length > 0 &&
          [{ label: 'Result', asset: output }, ...inputs].map((input) => (
            <button
              className={`preview-view ${view === input.label ? 'on' : ''}`}
              key={input.label}
              disabled={!input.asset || input.asset.missing}
              onClick={() => {
                setView(input.label);
                setCompare(false);
              }}
            >
              {input.label}
            </button>
          ))}
        <button title="Fit" aria-label="Fit preview" onClick={() => setActual(false)}>
          <Scan size={14} />
        </button>
        <button title="Actual Size" onClick={() => setActual(true)}>
          1:1
        </button>
        <button
          title="Compare"
          disabled={!previous || !output || view !== 'Result'}
          onClick={() => setCompare((v) => !v)}
          className={compare ? 'on' : ''}
        >
          <Columns2 size={14} />
        </button>
        <button
          title="Fullscreen"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void panel.current?.requestFullscreen();
          }}
        >
          <Expand size={14} />
        </button>
      </div>
      <div
        className={`preview ${compare && previous ? 'comparison' : ''}`}
        style={actual ? undefined : { width: previewWidth, aspectRatio: String(ratio) }}
      >
        {compare && previous && <div>{render(previous)}</div>}
        <div className="preview-media">
          {view === 'Live' && liveJob && liveUrl ? (
            liveJob.preview?.startsWith('data:video/') ? (
              <video
                className="live-preview"
                src={liveUrl}
                autoPlay
                muted
                loop
                playsInline
                aria-label="H3 live sampling preview"
              />
            ) : (
              <img className="live-preview" src={liveUrl} alt="H3 live sampling preview" />
            )
          ) : (
            render(viewedAsset)
          )}
        </div>
      </div>
      <div className="zoom">
        {view === 'Live' && liveJob && <span>Live preview · {liveJob.message}</span>}
        <button onClick={() => setActual((v) => !v)}>
          {actual ? 'Actual size · 100%' : 'Fit ▾'}
        </button>
      </div>
    </section>
  );
}
