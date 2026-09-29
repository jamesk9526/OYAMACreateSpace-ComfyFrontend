import { ResolutionControls } from '../../components/ResolutionControls';
import { PromptInput } from '../../components/PromptInput';
import { useState } from 'react';
import { ImagePlus, Sparkles } from 'lucide-react';
import { Field, Section } from '../../components/ui';
import {
  draftFor,
  draftKey,
  guarded,
  patchDraft,
  useDrafts,
  useJobs,
  useLibrary,
  useSettings,
  useShell,
} from '../../stores';
import { zImageAvailability, zImageDefaults, type ZImageSettings } from './definition';

export function useZImage(): ZImageSettings {
  const projectId = useShell((state) => state.projectId);
  const values = useDrafts((state) => state.drafts[draftKey(projectId, 'zimage')]?.values);
  return { ...zImageDefaults, ...values } as ZImageSettings;
}

export function ZImageInspector() {
  const settings = useZImage();
  const readiness = useSettings((state) => state.readiness);
  const availability = zImageAvailability(readiness, settings.variant);
  const switchVariant = (variant: ZImageSettings['variant']) =>
    patchDraft(
      variant === 'turbo' ? { variant, steps: 8, cfg: 1 } : { variant, steps: 40, cfg: 4 },
      'zimage',
    );
  return (
    <>
      <Section title="Generator">
        <Field label="Module">
          <select className="control" value="zimage" onChange={() => {}}>
            <option value="zimage">ZImage</option>
          </select>
        </Field>
        <Field label="Profile">
          <select
            aria-label="Profile"
            className="control"
            value={settings.variant}
            onChange={(event) => switchVariant(event.target.value as ZImageSettings['variant'])}
          >
            <option value="turbo">ZImage Turbo · 8 steps</option>
            <option value="base">ZImage Base · 40 steps</option>
          </select>
        </Field>
        <p className={availability.ready ? 'muted' : 'validation'}>{availability.message}</p>
      </Section>
      <Section title="Canvas">
        <ResolutionControls moduleId="zimage" label="Image" settings={settings} />
        {(settings.width % 32 !== 0 || settings.height % 32 !== 0) && (
          <p className="validation">Dimensions must be multiples of 32.</p>
        )}
      </Section>
      <Section title="Generation">
        <Field label="Steps" note={String(settings.steps)}>
          <input
            className="range"
            type="range"
            min={settings.variant === 'turbo' ? 4 : 28}
            max={settings.variant === 'turbo' ? 20 : 50}
            value={settings.steps}
            onChange={(event) => patchDraft({ steps: Number(event.target.value) }, 'zimage')}
          />
        </Field>
        <Field label="Guidance" note={settings.cfg.toFixed(1)}>
          <input
            className="range"
            type="range"
            min={settings.variant === 'turbo' ? 1 : 3}
            max={settings.variant === 'turbo' ? 3 : 5}
            step={0.1}
            value={settings.cfg}
            onChange={(event) => patchDraft({ cfg: Number(event.target.value) }, 'zimage')}
          />
        </Field>
        <Field label="Seed">
          <input
            aria-label="Image seed"
            className="control"
            value={settings.seed}
            onChange={(event) => patchDraft({ seed: event.target.value }, 'zimage')}
          />
        </Field>
      </Section>
      <Section title="Workflow">
        <p className="muted">
          {settings.variant === 'turbo'
            ? 'Turbo uses zeroed negative conditioning, AuraFlow shift 3, res_multistep and simple scheduling.'
            : 'Base uses the editable negative prompt, AuraFlow shift 3, res_multistep and simple scheduling.'}
        </p>
      </Section>
    </>
  );
}

export function ZImageComposer() {
  const settings = useZImage();
  const projectId = useShell((state) => state.projectId);
  const tab = useShell((state) => state.composerTab);
  const readiness = useSettings((state) => state.readiness);
  const availability = zImageAvailability(readiness, settings.variant);
  const [submitting, setSubmitting] = useState(false);
  const selectedAsset = useShell((state) => state.selectedAsset);
  const jobs = useJobs((state) => state.jobs);
  const assets = useLibrary((state) => state.assets);
  const latestOutputId = jobs.find(
    (job) => job.projectId === projectId && job.moduleId === 'zimage' && job.status === 'complete',
  )?.assetIds[0];
  const outputId =
    selectedAsset &&
    jobs.some(
      (job) =>
        job.projectId === projectId &&
        job.moduleId === 'zimage' &&
        job.assetIds.includes(selectedAsset),
    )
      ? selectedAsset
      : latestOutputId;
  const output = assets.find((asset) => asset.id === outputId && asset.kind === 'image');
  const generate = async () => {
    setSubmitting(true);
    try {
      await guarded(async () => {
        const job = await window.oyama.generate(draftFor(projectId, 'zimage'));
        useJobs.setState((state) => ({
          jobs: [job, ...state.jobs.filter((candidate) => candidate.id !== job.id)],
        }));
        useShell.setState({ inspectorTab: 'Queue' });
      });
    } finally {
      setSubmitting(false);
    }
  };
  const tabs = settings.variant === 'base' ? ['Prompt', 'Negative'] : ['Prompt'];
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
            aria-label="Image prompt"
            onInsert={(prompt) => patchDraft({ prompt }, 'zimage')}
            placeholder="Describe the subject, composition, lens, light, materials, setting, and color..."
            value={settings.prompt}
            onChange={(event) => patchDraft({ prompt: event.target.value }, 'zimage')}
            onKeyDown={(event) => {
              if (event.ctrlKey && event.key === 'Enter') {
                event.preventDefault();
                if (!submitting && availability.ready && settings.prompt.trim()) void generate();
              }
            }}
          />
        ) : (
          <textarea
            aria-label="Negative prompt"
            value={settings.negative}
            onChange={(event) => patchDraft({ negative: event.target.value }, 'zimage')}
            placeholder="Describe unwanted details or artifacts..."
          />
        )}
      </div>
      <div className="composer-actions">
        <span className="muted">
          {settings.width} × {settings.height} · {settings.variant === 'turbo' ? 'Turbo' : 'Base'}
        </span>
        <button
          className="smallbtn"
          onClick={() =>
            patchDraft(
              {
                prompt: `${settings.prompt}${settings.prompt ? '\n\n' : ''}Subject: \nComposition: \nLens: \nLighting: \nEnvironment: \nColor: `,
              },
              'zimage',
            )
          }
        >
          <ImagePlus size={12} /> Prompt Guide
        </button>
        <button
          className="smallbtn"
          disabled={!output}
          title={output ? 'Open this image as the H3 first frame' : 'Generate an image first'}
          onClick={() =>
            void guarded(async () => {
              if (!output) return;
              const draft = await window.oyama.handoffAsset({
                assetId: output.id,
                projectId,
                targetModuleId: 'h3',
                targetField: 'firstFrame',
              });
              useDrafts.setState((state) => ({
                drafts: { ...state.drafts, [draftKey(projectId, 'h3')]: draft },
              }));
              useShell.getState().navigate('h3');
              useShell.setState({
                composerTab: 'Frames',
                inspectorTab: 'Properties',
                selectedAsset: null,
              });
            })
          }
        >
          Use as H3 first frame
        </button>
        <button
          className="smallbtn"
          disabled={!output}
          title={output ? 'Open this image as the LTX first frame' : 'Generate an image first'}
          onClick={() =>
            void guarded(async () => {
              if (!output) return;
              const draft = await window.oyama.handoffAsset({
                assetId: output.id,
                projectId,
                targetModuleId: 'ltx',
                targetField: 'firstFrame',
              });
              useDrafts.setState((state) => ({
                drafts: { ...state.drafts, [draftKey(projectId, 'ltx')]: draft },
              }));
              useShell.getState().navigate('ltx');
              useShell.setState({
                composerTab: 'References',
                inspectorTab: 'Properties',
                selectedAsset: null,
              });
            })
          }
        >
          Use as LTX first frame
        </button>
        <button
          className="generate"
          disabled={submitting || !settings.prompt.trim() || !availability.ready}
          onClick={() => void generate()}
          title={availability.ready ? 'Generate image' : availability.message}
        >
          <Sparkles size={12} /> {submitting ? 'SUBMITTING' : 'GENERATE IMAGE'}
        </button>
      </div>
    </section>
  );
}
