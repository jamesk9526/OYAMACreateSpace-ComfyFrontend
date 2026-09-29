import { useRef, useState } from 'react';
import { FileAudio, Film, Image, Plus, Download } from 'lucide-react';
import { Empty } from '../../components/ui';
import { draftKey, guarded, refreshLibrary, useDrafts, useLibrary, useShell } from '../../stores';
import type { Asset } from '../../../shared/domain';

function VideoTools({
  asset,
  video,
}: {
  asset: Asset;
  video: React.RefObject<HTMLVideoElement | null>;
}) {
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(1);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<Asset>) => {
    setBusy(true);
    try {
      await guarded(async () => {
        const derived = await action();
        await refreshLibrary();
        useShell.setState({ selectedAsset: derived.id });
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="video-tools">
      <div className="row-actions">
        <button
          className="smallbtn"
          disabled={busy}
          onClick={() =>
            void guarded(async () => {
              await window.oyama.probeAsset(asset.id);
              await refreshLibrary();
            })
          }
        >
          Inspect media
        </button>
        <button
          className="smallbtn"
          disabled={busy}
          onClick={() =>
            void run(() =>
              window.oyama.extractFrame({
                assetId: asset.id,
                seconds: video.current?.currentTime || 0,
              }),
            )
          }
        >
          Save current frame
        </button>
      </div>
      {asset.media && (
        <p className="muted">
          {asset.media.video?.width} × {asset.media.video?.height} ·{' '}
          {asset.media.video?.fps?.toFixed(2) || 'Unknown'} FPS · {asset.media.duration.toFixed(3)}s
          · {asset.media.audio ? `${asset.media.audio.codec} audio` : 'No audio'}
        </p>
      )}
      <div className="split">
        <label className="field">
          Clip start (seconds)
          <input
            aria-label="Clip start"
            className="control"
            type="number"
            min={0}
            step={0.001}
            value={start}
            onChange={(event) => setStart(Number(event.target.value))}
          />
        </label>
        <label className="field">
          Clip end (seconds)
          <input
            aria-label="Clip end"
            className="control"
            type="number"
            min={0}
            step={0.001}
            value={end}
            onChange={(event) => setEnd(Number(event.target.value))}
          />
        </label>
      </div>
      <button
        className="smallbtn"
        disabled={
          busy || end <= start || (asset.media ? end > asset.media.duration + 0.001 : false)
        }
        onClick={() => void run(() => window.oyama.clipVideo({ assetId: asset.id, start, end }))}
      >
        Create clip
      </button>
      {asset.parentAssetId && (
        <p className="muted">
          Derived from {asset.parentAssetId.slice(0, 8)} · {asset.derivation?.operation}{' '}
          {asset.derivation?.start.toFixed(3)}
          {asset.derivation?.end === undefined ? '' : `–${asset.derivation.end.toFixed(3)}`}s
        </p>
      )}
    </div>
  );
}
export function AssetsWorkspace() {
  const projectId = useShell((s) => s.projectId);
  const assets = useLibrary((s) => s.assets);
  const [query, setQuery] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const selectedId = useShell((s) => s.selectedAsset);
  const selected = assets.find((a) => a.id === selectedId);
  const visible = assets.filter(
    (a) =>
      (!a.projectId || a.projectId === projectId) &&
      a.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="library-workspace">
      <header className="workspace-heading">
        <div>
          <h1>Assets & References</h1>
          <p>Managed project media and shared library references.</p>
        </div>
        <button
          className="smallbtn"
          onClick={() =>
            void guarded(async () => {
              await window.oyama.importMedia({ projectId });
              await refreshLibrary();
            })
          }
        >
          <Plus size={13} /> Import media
        </button>
      </header>
      <input
        className="control search"
        aria-label="Search assets"
        placeholder="Search assets…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!visible.length ? (
        <Empty title="Your assets appear here">
          Import references or generate your first video.
        </Empty>
      ) : (
        <div className="asset-grid">
          {visible.map((a) => {
            const Icon = a.kind === 'video' ? Film : a.kind === 'audio' ? FileAudio : Image;
            return (
              <button
                key={a.id}
                className={`asset-card ${selectedId === a.id ? 'selected' : ''}`}
                onClick={() => useShell.setState({ selectedAsset: a.id })}
              >
                {a.kind === 'image' && !a.missing ? (
                  <img src={a.url} alt="" loading="lazy" />
                ) : (
                  <div className="asset-placeholder">
                    <Icon size={24} />
                  </div>
                )}
                <strong>{a.name}</strong>
                <small>
                  {a.missing ? 'File missing' : a.projectId ? a.kind : `Global · ${a.kind}`}
                </small>
              </button>
            );
          })}
        </div>
      )}
      {selected && (
        <div className="asset-detail">
          <header>
            <strong>{selected.name}</strong>
            <div className="row-actions">
              {selected.kind === 'video' && !selected.missing && (
                <button
                  className="smallbtn"
                  onClick={() =>
                    void guarded(async () => {
                      const draft = await window.oyama.handoffAsset({
                        assetId: selected.id,
                        projectId,
                        targetModuleId: 'continue',
                        targetField: 'sourceVideo',
                      });
                      await refreshLibrary();
                      useDrafts.setState((state) => ({
                        drafts: { ...state.drafts, [draftKey(projectId, 'continue')]: draft },
                      }));
                      useShell.getState().navigate('continue');
                      useShell.setState({
                        composerTab: 'Prompt',
                        inspectorTab: 'Properties',
                        selectedAsset: null,
                      });
                    })
                  }
                >
                  Continue this video
                </button>
              )}
              {selected.projectId && (
                <button
                  className="smallbtn"
                  onClick={() =>
                    void guarded(async () => {
                      const promoted = await window.oyama.promoteAsset(selected.id);
                      await refreshLibrary();
                      useShell.setState({ selectedAsset: promoted.id });
                    })
                  }
                >
                  Add to global library
                </button>
              )}
              {selected.kind === 'image' && (
                <>
                  {(['character', 'location'] as const).map((kind) => (
                    <button
                      key={kind}
                      className="smallbtn"
                      onClick={() =>
                        void guarded(async () => {
                          await window.oyama.promoteAssetToRecord({
                            assetId: selected.id,
                            projectId,
                            kind,
                          });
                          await refreshLibrary();
                          useShell
                            .getState()
                            .navigate(kind === 'character' ? 'characters' : 'locations');
                        })
                      }
                    >
                      {kind === 'character' ? 'Create Character' : 'Create Location'}
                    </button>
                  ))}
                </>
              )}
              <button
                className="smallbtn"
                onClick={() => void guarded(() => window.oyama.exportAsset(selected.id))}
              >
                <Download size={12} /> Export
              </button>
            </div>
          </header>
          {selected.missing ? (
            <p className="validation">Managed file is missing. Import the original again.</p>
          ) : selected.kind === 'video' ? (
            <>
              <video key={selected.id} ref={video} src={selected.url} controls />
              <VideoTools key={selected.id} asset={selected} video={video} />
            </>
          ) : selected.kind === 'audio' ? (
            <audio key={selected.id} src={selected.url} controls />
          ) : (
            <img src={selected.url} alt={selected.name} />
          )}
        </div>
      )}
    </div>
  );
}
