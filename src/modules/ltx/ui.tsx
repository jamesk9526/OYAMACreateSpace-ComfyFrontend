import { ResolutionControls } from '../../components/ResolutionControls';
import { PromptInput } from '../../components/PromptInput';
import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Field, Section, Toggle } from '../../components/ui';
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
import { ltxAvailability, ltxDefaults, type LtxSettings } from './definition';
import { ltxFrames } from './workflow';

export function useLtx(): LtxSettings {
  const projectId = useShell((state) => state.projectId);
  const values = useDrafts((state) => state.drafts[draftKey(projectId, 'ltx')]?.values);
  return { ...ltxDefaults, ...values } as LtxSettings;
}

export function LtxInspector() {
  const settings = useLtx();
  const readiness = useSettings((state) => state.readiness);
  const availability = ltxAvailability(readiness, settings.profile, settings.msr.enabled);
  return (
    <>
      <Section title="Generator">
        <Field label="Module">
          <select className="control" value="ltx" onChange={() => {}}>
            <option value="ltx">LTX 2.5 Video</option>
          </select>
        </Field>
        <Field label="Mode">
          <select
            aria-label="LTX mode"
            className="control"
            value={settings.mode}
            onChange={(event) => {
              patchDraft(
                {
                  mode: event.target.value,
                  ...(event.target.value === 'turnaround' ? { duration: 8 } : {}),
                },
                'ltx',
              );
              useShell.setState({ composerTab: 'Prompt' });
            }}
          >
            <option value="text">Text to Video</option>
            <option value="image">Image to Video</option>
            <option value="turnaround">Turnaround · experimental</option>
          </select>
        </Field>
        {settings.mode === 'turnaround' && (
          <>
            <Field label="Camera orbit">
              <select
                aria-label="Camera orbit"
                className="control"
                value={settings.orbitDirection}
                onChange={(event) => patchDraft({ orbitDirection: event.target.value }, 'ltx')}
              >
                <option value="clockwise">360° clockwise</option>
                <option value="counterclockwise">360° counterclockwise</option>
              </select>
            </Field>
            <p className="muted">
              Requests a motionless subject and 360° camera orbit. A complete orbit and consistent
              geometry are not guaranteed; review the saved views before modeling.
            </p>
          </>
        )}
        <Field label="Profile">
          <select
            aria-label="LTX profile"
            className="control"
            value={settings.profile}
            onChange={(event) => patchDraft({ profile: event.target.value }, 'ltx')}
          >
            <option value="turbo">Distilled · one stage</option>
            <option value="quality">Distilled · two stage quality</option>
          </select>
        </Field>
        <p className={availability.ready ? 'muted' : 'validation'}>{availability.message}</p>
      </Section>
      <Section title="Output">
        <ResolutionControls moduleId="ltx" label="LTX" settings={settings} step={64} />
        {(settings.width % 64 !== 0 || settings.height % 64 !== 0) && (
          <p className="validation">Output dimensions must be multiples of 64.</p>
        )}
        <Field label="Duration" note={`${settings.duration} sec`}>
          <input
            className="range"
            type="range"
            min={1}
            max={15}
            step={1}
            value={settings.duration}
            onChange={(event) => patchDraft({ duration: Number(event.target.value) }, 'ltx')}
          />
        </Field>
        <Field label="Frame rate">
          <select className="control" value="24" disabled>
            <option value="24">24 FPS</option>
          </select>
        </Field>
      </Section>
      <Section title="Generation">
        <Field label="Seed">
          <input
            aria-label="LTX seed"
            className="control"
            value={settings.seed}
            onChange={(event) => patchDraft({ seed: event.target.value }, 'ltx')}
          />
        </Field>
        <p className="muted">
          {ltxFrames(settings.duration)} frames · synchronized audio ·{' '}
          {settings.profile === 'quality'
            ? 'half-size first stage, latent x2 upscale, refinement'
            : 'single distilled stage'}
          .
        </p>
        <p className="muted">
          Sampling uses the source recipe's fixed sigma schedule, Euler ancestral sampler, and
          video/audio guidance 1.
        </p>
      </Section>
    </>
  );
}

function FirstFrame() {
  const settings = useLtx();
  const projectId = useShell((state) => state.projectId);
  const assets = useLibrary((state) => state.assets);
  const images = assets.filter(
    (asset) =>
      asset.kind === 'image' &&
      !asset.missing &&
      (!asset.projectId || asset.projectId === projectId),
  );
  return (
    <div className="reference-editor">
      <Field label="First frame">
        <select
          aria-label="LTX first frame"
          className="control"
          value={settings.firstFrame || ''}
          onChange={(event) => patchDraft({ firstFrame: event.target.value || null }, 'ltx')}
        >
          <option value="">Choose an image</option>
          {images.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>
      </Field>
      <button
        className="smallbtn"
        onClick={() =>
          void guarded(async () => {
            const imported = await window.oyama.importMedia({ projectId });
            await refreshLibrary();
            const first = imported.find((asset) => asset.kind === 'image');
            if (first) patchDraft({ firstFrame: first.id, mode: 'image' }, 'ltx');
          })
        }
      >
        <Plus size={12} /> Import first frame
      </button>
      {!images.length && <p className="muted">Import an image or send a ZImage result here.</p>}
    </div>
  );
}

function MsrReferences() {
  const settings = useLtx();
  const projectId = useShell((state) => state.projectId);
  const assets = useLibrary((state) => state.assets);
  const images = assets.filter(
    (asset) =>
      asset.kind === 'image' &&
      !asset.missing &&
      (!asset.projectId || asset.projectId === projectId),
  );
  const slots = [
    ['pic1', 'Picture 1 · required'],
    ['pic2', 'Picture 2'],
    ['pic3', 'Picture 3'],
    ['pic4', 'Picture 4'],
    ['background', 'Background'],
  ] as const;
  return (
    <div className="reference-editor">
      <Toggle
        label="Use Licon MSR references"
        checked={settings.msr.enabled}
        onChange={(enabled) => patchDraft({ msr: { ...settings.msr, enabled } }, 'ltx')}
      />
      <p className="muted">
        Reference slots keep their order. Turbo guides the first stage; Quality guides refinement
        after latent upscale.
      </p>
      {settings.msr.enabled &&
        slots.map(([slot, label]) => (
          <Field key={slot} label={label}>
            <select
              aria-label={`MSR ${slot}`}
              className="control"
              value={settings.msr[slot] || ''}
              onChange={(event) =>
                patchDraft({ msr: { ...settings.msr, [slot]: event.target.value || null } }, 'ltx')
              }
            >
              <option value="">{slot === 'pic1' ? 'Choose image' : 'None'}</option>
              {images.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
          </Field>
        ))}
      {settings.msr.enabled && !settings.msr.pic1 && (
        <p className="validation">Choose Picture 1 before generating.</p>
      )}
    </div>
  );
}

export function LtxComposer() {
  const settings = useLtx();
  const projectId = useShell((state) => state.projectId);
  const tab = useShell((state) => state.composerTab);
  const readiness = useSettings((state) => state.readiness);
  const availability = ltxAvailability(readiness, settings.profile, settings.msr.enabled);
  const [submitting, setSubmitting] = useState(false);
  const [savingViews, setSavingViews] = useState(false);
  const jobs = useJobs((state) => state.jobs);
  const selectedAsset = useShell((state) => state.selectedAsset);
  const turnarounds = jobs.filter(
    (job) =>
      job.projectId === projectId &&
      job.moduleId === 'ltx' &&
      job.status === 'complete' &&
      job.snapshot.mode === 'turnaround',
  );
  const turnaroundId =
    turnarounds.flatMap((job) => job.assetIds).find((id) => id === selectedAsset) ||
    turnarounds[0]?.assetIds[0];
  const saveViews = async () => {
    if (!turnaroundId) return;
    setSavingViews(true);
    try {
      await guarded(async () => {
        const metadata = await window.oyama.probeAsset(turnaroundId);
        for (const fraction of [0, 0.25, 0.5, 0.75])
          await window.oyama.extractFrame({
            assetId: turnaroundId,
            seconds: metadata.duration * fraction,
          });
        await refreshLibrary();
        useShell.getState().navigate('assets');
      });
    } finally {
      setSavingViews(false);
    }
  };
  const generate = async () => {
    setSubmitting(true);
    try {
      await guarded(async () => {
        const job = await window.oyama.generate(draftFor(projectId, 'ltx'));
        useJobs.setState((state) => ({
          jobs: [job, ...state.jobs.filter((candidate) => candidate.id !== job.id)],
        }));
        useShell.setState({ inspectorTab: 'Queue' });
      });
    } finally {
      setSubmitting(false);
    }
  };
  const tabs =
    settings.mode !== 'text'
      ? ['Prompt', 'References', 'MSR', 'Negative']
      : ['Prompt', 'MSR', 'Negative'];
  const visibleTab = tabs.includes(tab) ? tab : 'Prompt';
  return (
    <section className="composer">
      <div className="composer-tabs">
        {tabs.map((item) => (
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
        {visibleTab === 'Prompt' ? (
          <PromptInput
            aria-label="LTX prompt"
            onInsert={(prompt) => patchDraft({ prompt }, 'ltx')}
            placeholder="Describe the scene, motion, camera, lighting, and sound..."
            value={settings.prompt}
            onChange={(event) => patchDraft({ prompt: event.target.value }, 'ltx')}
            onKeyDown={(event) => {
              if (event.ctrlKey && event.key === 'Enter') {
                event.preventDefault();
                if (
                  !submitting &&
                  availability.ready &&
                  settings.prompt.trim() &&
                  (settings.mode === 'text' || settings.firstFrame) &&
                  (!settings.msr.enabled || settings.msr.pic1)
                )
                  void generate();
              }
            }}
          />
        ) : visibleTab === 'References' ? (
          <FirstFrame />
        ) : visibleTab === 'MSR' ? (
          <MsrReferences />
        ) : (
          <textarea
            aria-label="LTX negative prompt"
            value={settings.negative}
            onChange={(event) => patchDraft({ negative: event.target.value }, 'ltx')}
            placeholder="Details to avoid..."
          />
        )}
      </div>
      <div className="composer-actions">
        <span className="muted">
          {settings.width} × {settings.height} · {settings.duration}s · 24 FPS
        </span>
        {settings.mode !== 'text' && (
          <button
            className="smallbtn"
            onClick={() => useShell.setState({ composerTab: 'References' })}
          >
            First frame
          </button>
        )}
        {settings.mode === 'turnaround' && (
          <button
            className="smallbtn"
            disabled={!turnaroundId || savingViews}
            onClick={() => void saveViews()}
          >
            {savingViews ? 'Saving views…' : 'Save 4 views'}
          </button>
        )}
        <button
          className="generate"
          disabled={
            submitting ||
            !settings.prompt.trim() ||
            !availability.ready ||
            (settings.mode !== 'text' && !settings.firstFrame) ||
            (settings.msr.enabled && !settings.msr.pic1)
          }
          title={
            availability.ready
              ? settings.mode !== 'text' && !settings.firstFrame
                ? 'Choose a first frame'
                : 'Generate LTX video'
              : availability.message
          }
          onClick={() => void generate()}
        >
          <Sparkles size={12} /> {submitting ? 'SUBMITTING' : 'GENERATE VIDEO'}
        </button>
      </div>
    </section>
  );
}
