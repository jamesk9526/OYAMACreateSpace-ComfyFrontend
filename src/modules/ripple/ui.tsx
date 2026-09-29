import { ResolutionControls } from '../../components/ResolutionControls';
import { PromptInput } from '../../components/PromptInput';
import { useEffect, useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Field, Section, Toggle } from '../../components/ui';
import { planRippleChunks } from '../../../shared/ripple-batch';
import { PreviewPanel } from '../../components/PreviewPanel';
import {
  draftFor,
  draftKey,
  guarded,
  patchDraft,
  refreshLibrary,
  useDrafts,
  useJobs,
  useLibrary,
  useSettings,
  useShell,
} from '../../stores';
import {
  rippleAvailability,
  rippleDefaults,
  rippleSourceDuration,
  type RippleSettings,
} from './definition';
import { rippleFrames } from './workflow';

export function useRipple(): RippleSettings {
  const projectId = useShell((state) => state.projectId);
  const values = useDrafts((state) => state.drafts[draftKey(projectId, 'ripple')]?.values);
  return { ...rippleDefaults, ...values } as RippleSettings;
}

export function RippleWorkspace() {
  const settings = useRipple();
  const assets = useLibrary((state) => state.assets);
  return (
    <PreviewPanel
      inputs={[
        { label: 'Source', asset: assets.find((asset) => asset.id === settings.sourceVideo), seekSeconds: settings.mode === 'single' ? settings.sourceInFrame / 24 : 0 },
        { label: 'Frame', asset: assets.find((asset) => asset.id === settings.replacementFrame) },
      ]}
    />
  );
}

function useRippleSource() {
  const settings = useRipple();
  const assets = useLibrary((state) => state.assets);
  const source = assets.find((asset) => asset.id === settings.sourceVideo);
  useEffect(() => {
    if (!source || source.media || source.missing) return;
    void guarded(async () => {
      await window.oyama.probeAsset(source.id);
      await refreshLibrary();
    });
  }, [source?.id, source?.media, source?.missing]);
  return source;
}

export function RippleInspector() {
  const settings = useRipple();
  const source = useRippleSource();
  const jobs = useJobs((state) => state.jobs);
  const batch = jobs.find((job) => job.batch?.sourceAssetId === settings.sourceVideo);
  const readiness = useSettings((state) => state.readiness);
  const availability = rippleAvailability(readiness);
  const frames = rippleFrames(settings.duration);
  let chunks: ReturnType<typeof planRippleChunks> = [],
    planError = '';
  if (settings.mode === 'long') {
    try {
      chunks = planRippleChunks(
        settings.longDuration,
        settings.chunkSeconds,
        settings.overlapSeconds,
      );
    } catch (error) {
      planError = (error as Error).message;
    }
  }
  return (
    <>
      <Section title="Generator">
        <Field label="Module">
          <select className="control" value="ripple" onChange={() => {}}>
            <option value="ripple">LTX Ripple</option>
          </select>
        </Field>
        <p className={availability.ready ? 'muted' : 'validation'}>{availability.message}</p>
        <Field label="Edit mode">
          <select
            className="control"
            aria-label="Ripple edit mode"
            value={settings.mode}
            onChange={(event) =>
              patchDraft(
                {
                  mode: event.target.value,
                  ...(event.target.value === 'long' && source?.media?.video
                    ? { longDuration: Math.max(2, Math.min(300, rippleSourceDuration(source))) }
                    : {}),
                },
                'ripple',
              )
            }
          >
            <option value="single">Single pass · 2–20 seconds</option>
            <option value="long">Long video · sequential chunks</option>
          </select>
        </Field>
        <p className="muted">
          Edit one first frame; guide the full source shot. Source audio is retained.
        </p>
      </Section>
      <Section title="Output">
        <ResolutionControls moduleId="ripple" label="Ripple" settings={settings} />
        {settings.mode === 'single' ? (
          <>
            <Field
              label="Source In"
              note={`${(settings.sourceInFrame / 24).toFixed(3)}s · frame ${settings.sourceInFrame}`}
            >
              <input
                className="control"
                type="number"
                min={0}
                max={7200}
                step={1}
                aria-label="Ripple source In frame"
                value={settings.sourceInFrame}
                onChange={(event) =>
                  patchDraft({ sourceInFrame: Number(event.target.value) }, 'ripple')
                }
              />
            </Field>
            <button
              className="smallbtn"
              disabled={!source?.media?.video}
              onClick={() => {
                const video = document.querySelector<HTMLVideoElement>('.preview video');
                if (video && source && video.getAttribute('src') === source.url)
                  patchDraft({ sourceInFrame: Math.round(video.currentTime * 24) }, 'ripple');
              }}
            >
              Use source playhead as In
            </button>
            <Field label="Duration" note={`${settings.duration} sec`}>
              <input
                aria-label="Ripple duration"
                className="range"
                type="range"
                min={2}
                max={20}
                step={1}
                value={settings.duration}
                onChange={(event) => patchDraft({ duration: Number(event.target.value) }, 'ripple')}
              />
            </Field>
            <p className="muted">
              {frames} frames · 24 FPS · {(frames / 24).toFixed(3)}s encoded
            </p>
            <p className="muted">
              Source Out {settings.sourceInFrame + frames - 1} frames ·{' '}
              {((settings.sourceInFrame + frames - 1) / 24).toFixed(3)}s. Duration controls Out on
              the supported 8n+1 frame grid.
            </p>
            {source?.media &&
              rippleSourceDuration(source) + 0.001 < (settings.sourceInFrame + frames - 1) / 24 && (
                <p className="validation">
                  Source needs at least {((settings.sourceInFrame + frames - 1) / 24).toFixed(2)}{' '}
                  seconds for this edit.
                </p>
              )}
          </>
        ) : (
          <>
            <Field label="Source span" note="seconds from start">
              <input
                className="control"
                type="number"
                min={2}
                max={300}
                step="any"
                aria-label="Ripple long duration"
                value={settings.longDuration}
                onChange={(event) =>
                  patchDraft({ longDuration: Number(event.target.value) }, 'ripple')
                }
              />
            </Field>
            <button
              className="smallbtn"
              disabled={!source?.media?.video}
              onClick={() =>
                patchDraft({ longDuration: Math.min(300, rippleSourceDuration(source)) }, 'ripple')
              }
            >
              Use full source
            </button>
            <Field label="Chunk duration">
              <input
                className="control"
                type="number"
                min={2}
                max={20}
                aria-label="Ripple chunk duration"
                value={settings.chunkSeconds}
                onChange={(event) =>
                  patchDraft({ chunkSeconds: Number(event.target.value) }, 'ripple')
                }
              />
            </Field>
            <Field label="Overlap seconds">
              <input
                className="control"
                type="number"
                min={0}
                max={2}
                step={0.25}
                aria-label="Ripple overlap"
                value={settings.overlapSeconds}
                onChange={(event) =>
                  patchDraft({ overlapSeconds: Number(event.target.value) }, 'ripple')
                }
              />
            </Field>
            <Toggle
              label="Blend overlap"
              checked={settings.blendOverlap}
              onChange={(blendOverlap) => patchDraft({ blendOverlap }, 'ripple')}
            />
            <p className={planError ? 'validation' : 'muted'}>
              {planError ||
                `${chunks.length} sequential chunks · ${Math.round(settings.longDuration * 24)} final frames · original source audio retained`}
            </p>
            {source?.media && settings.longDuration > rippleSourceDuration(source) + 0.001 && (
              <p className="validation">Source is shorter than this span.</p>
            )}
            <p className="muted">
              Each chunk uses the replacement frame and the source motion for its range. Tail
              padding is removed in the joined result. Completed chunks survive cancellation and
              restart.
            </p>
            {!planError && (
              <details>
                <summary>Chunk plan and recovery</summary>
                <div className="ripple-chunk-plan">
                  {chunks.map((chunk) => (
                    <p className="muted" key={chunk.index}>
                      Chunk {chunk.index + 1}: {(chunk.startFrame / 24).toFixed(3)}–
                      {((chunk.startFrame + chunk.sourceFrames) / 24).toFixed(3)}s ·{' '}
                      {chunk.overlapFrames} overlap frames ·{' '}
                      {jobs.find(
                        (job) =>
                          job.snapshot.batchParentId === batch?.id &&
                          job.snapshot.batchChunkIndex === chunk.index &&
                          job.snapshot.batchSuperseded !== true,
                      )?.status || 'not rendered'}
                    </p>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
        <p className="muted">Source span is prepared at 24 FPS; original media is retained.</p>
        {source?.media?.video && (
          <p className="muted">
            Original: {source.media.video.width} × {source.media.video.height} ·{' '}
            {rippleSourceDuration(source).toFixed(3)}s ·{' '}
            {source.media.audio ? 'audio retained' : 'silent source'}
          </p>
        )}
      </Section>
      <Section title="Ripple controls">
        <Field label="LoRA strength" note={settings.strength.toFixed(2)}>
          <input
            aria-label="Ripple strength"
            className="range"
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={settings.strength}
            onChange={(event) => patchDraft({ strength: Number(event.target.value) }, 'ripple')}
          />
        </Field>
        <Field label="Motion guide" note={settings.guideStrength.toFixed(2)}>
          <input
            aria-label="Ripple guide strength"
            className="range"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.guideStrength}
            onChange={(event) =>
              patchDraft({ guideStrength: Number(event.target.value) }, 'ripple')
            }
          />
        </Field>
        <Field label="Seed">
          <input
            aria-label="Ripple seed"
            className="control"
            value={settings.seed}
            onChange={(event) => patchDraft({ seed: event.target.value }, 'ripple')}
          />
        </Field>
      </Section>
    </>
  );
}

function RippleInputs() {
  const settings = useRipple();
  const source = useLibrary((state) =>
    state.assets.find((asset) => asset.id === settings.sourceVideo),
  );
  const projectId = useShell((state) => state.projectId);
  const [editing, setEditing] = useState(false);
  const assets = useLibrary((state) => state.assets).filter(
    (asset) => !asset.missing && (!asset.projectId || asset.projectId === projectId),
  );
  const importMedia = () =>
    void guarded(async () => {
      await window.oyama.importMedia({ projectId });
      await refreshLibrary();
    });
  return (
    <div className="reference-editor">
      <Field label="Source video">
        <select
          aria-label="Ripple source video"
          className="control"
          value={settings.sourceVideo || ''}
          onChange={(event) => patchDraft({ sourceVideo: event.target.value || null }, 'ripple')}
        >
          <option value="">Choose a video</option>
          {assets
            .filter((asset) => asset.kind === 'video')
            .map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Edited first frame">
        <select
          aria-label="Ripple replacement frame"
          className="control"
          value={settings.replacementFrame || ''}
          onChange={(event) =>
            patchDraft({ replacementFrame: event.target.value || null }, 'ripple')
          }
        >
          <option value="">Choose an image</option>
          {assets
            .filter((asset) => asset.kind === 'image')
            .map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
        </select>
      </Field>
      <button className="smallbtn" onClick={importMedia}>
        <Plus size={12} /> Import media
      </button>
      <button
        className="smallbtn"
        disabled={!source || source.missing || editing}
        onClick={() => {
          setEditing(true);
          void guarded(async () => {
            if (!source) return;
            const frame = await window.oyama.extractFrame({
              assetId: source.id,
              seconds: settings.mode === 'single' ? settings.sourceInFrame / 24 : 0,
            });
            const draft = await window.oyama.handoffAsset({
              assetId: frame.id,
              projectId,
              targetModuleId: 'photo-edit',
              targetField: 'sourceImage',
              canvas: { width: settings.width, height: settings.height },
            });
            await refreshLibrary();
            useDrafts.setState((state) => ({
              drafts: { ...state.drafts, [draftKey(projectId, 'photo-edit')]: draft },
            }));
            useShell.getState().navigate('photo-edit');
            useShell.setState({
              composerTab: 'Prompt',
              inspectorTab: 'Properties',
              selectedAsset: null,
            });
          }).finally(() => setEditing(false));
        }}
      >
        {editing ? 'Extracting frame…' : 'Edit first frame with FireRed'}
      </button>
      {source?.media ? (
        <p className="muted">
          {source.media.duration.toFixed(2)}s · {source.media.video?.fps?.toFixed(2) || 'Unknown'}{' '}
          FPS · {source.media.audio ? 'audio present' : 'silent'}
        </p>
      ) : settings.sourceVideo ? (
        <p className="muted">Inspecting source media…</p>
      ) : null}
      <p className="muted">
        A trimmed 24 FPS upload copy is created automatically. Uploads must fit ComfyUI’s 100 MB
        limit.
      </p>
    </div>
  );
}

export function RippleComposer() {
  const settings = useRipple();
  const source = useRippleSource();
  const projectId = useShell((state) => state.projectId);
  const tab = useShell((state) => state.composerTab);
  const readiness = useSettings((state) => state.readiness);
  const availability = rippleAvailability(readiness);
  const [submitting, setSubmitting] = useState(false);
  let validPlan = true;
  if (settings.mode === 'long') {
    try {
      planRippleChunks(settings.longDuration, settings.chunkSeconds, settings.overlapSeconds);
    } catch {
      validPlan = false;
    }
  }
  const canGenerate = Boolean(
    availability.ready &&
    settings.sourceVideo &&
    settings.replacementFrame &&
    source?.media?.video &&
    (source.media.video.fps || 0) > 0 &&
    validPlan &&
    rippleSourceDuration(source) + 0.001 >=
      (settings.mode === 'long'
        ? settings.longDuration
        : (rippleFrames(settings.duration) - 1) / 24),
  );
  const generate = async () => {
    setSubmitting(true);
    try {
      await guarded(async () => {
        const job = await window.oyama.generate(draftFor(projectId, 'ripple'));
        useJobs.setState((state) => ({
          jobs: [job, ...state.jobs.filter((item) => item.id !== job.id)],
        }));
        useShell.setState({ inspectorTab: 'Queue' });
      });
    } finally {
      setSubmitting(false);
    }
  };
  const visibleTab = ['Prompt', 'References', 'Negative'].includes(tab) ? tab : 'Prompt';
  return (
    <section className="composer">
      <div className="composer-tabs">
        {['Prompt', 'References', 'Negative'].map((item) => (
          <button
            key={item}
            className={`composer-tab ${visibleTab === item ? 'active' : ''}`}
            onClick={() => useShell.setState({ composerTab: item })}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="promptwrap">
        {visibleTab === 'References' ? (
          <RippleInputs />
        ) : (
          <PromptInput
            aria-label={visibleTab === 'Negative' ? 'Ripple negative prompt' : 'Ripple prompt'}
            onInsert={(value) =>
              patchDraft({ [visibleTab === 'Negative' ? 'negative' : 'prompt']: value }, 'ripple')
            }
            value={visibleTab === 'Negative' ? settings.negative : settings.prompt}
            onChange={(event) =>
              patchDraft(
                { [visibleTab === 'Negative' ? 'negative' : 'prompt']: event.target.value },
                'ripple',
              )
            }
            onKeyDown={(event) => {
              if (event.ctrlKey && event.key === 'Enter' && canGenerate && !submitting) {
                event.preventDefault();
                void generate();
              }
            }}
          />
        )}
      </div>
      <div className="composer-actions">
        <span className="muted">
          {settings.width} × {settings.height} ·{' '}
          {settings.mode === 'long' ? settings.longDuration.toFixed(3) : settings.duration}s · 24
          FPS
        </span>
        <button
          className="smallbtn"
          onClick={() => useShell.setState({ composerTab: 'References' })}
        >
          Inputs
        </button>
        <button
          className="generate"
          disabled={!canGenerate || submitting}
          title={availability.ready ? 'Generate Ripple edit' : availability.message}
          onClick={() => void generate()}
        >
          <Sparkles size={12} /> {submitting ? 'SUBMITTING' : 'GENERATE VIDEO'}
        </button>
      </div>
    </section>
  );
}
