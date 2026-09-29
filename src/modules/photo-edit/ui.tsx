import { ResolutionControls } from '../../components/ResolutionControls';
import { PromptInput } from '../../components/PromptInput';
import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Field, Section } from '../../components/ui';
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
import { photoEditAvailability, photoEditDefaults, type PhotoEditSettings } from './definition';

export function usePhotoEdit(): PhotoEditSettings {
  const projectId = useShell((state) => state.projectId);
  const values = useDrafts((state) => state.drafts[draftKey(projectId, 'photo-edit')]?.values);
  return { ...photoEditDefaults, ...values } as PhotoEditSettings;
}

export function PhotoEditWorkspace() {
  const settings = usePhotoEdit();
  const source = useLibrary((state) =>
    state.assets.find((asset) => asset.id === settings.sourceImage),
  );
  return <PreviewPanel inputs={[{ label: 'Source', asset: source }]} />;
}

export function PhotoEditInspector() {
  const settings = usePhotoEdit();
  const projectId = useShell((state) => state.projectId);
  const selectedId = useShell((state) => state.selectedAsset);
  const jobs = useJobs((state) => state.jobs);
  const assets = useLibrary((state) => state.assets);
  const source = assets.find((asset) => asset.id === settings.sourceImage);
  const completed = jobs.filter(
    (job) =>
      job.projectId === projectId && job.moduleId === 'photo-edit' && job.status === 'complete',
  );
  const outputId = completed.some((job) => job.assetIds.includes(selectedId || ''))
    ? selectedId
    : completed[0]?.assetIds[0];
  const output = assets.find(
    (asset) => asset.id === outputId && asset.kind === 'image' && !asset.missing,
  );
  const readiness = useSettings((state) => state.readiness);
  const availability = photoEditAvailability(readiness, settings.profile);
  return (
    <>
      <Section title="Generator">
        <Field label="Module">
          <select className="control" value="photo-edit" onChange={() => {}}>
            <option value="photo-edit">FireRed Photo Edit</option>
          </select>
        </Field>
        <Field label="Profile">
          <select
            aria-label="Photo Edit profile"
            className="control"
            value={settings.profile}
            onChange={(event) => patchDraft({ profile: event.target.value }, 'photo-edit')}
          >
            <option value="turbo">Turbo · 8-step Lightning</option>
            <option value="quality">Quality · 40 steps</option>
          </select>
        </Field>
        <p className={availability.ready ? 'muted' : 'validation'}>{availability.message}</p>
      </Section>
      <Section title="Output">
        <ResolutionControls moduleId="photo-edit" label="Photo Edit" settings={settings} />
        <p className="muted">
          Source: {source?.name || 'Choose a source image'} ·{' '}
          {source?.dimensions
            ? `${source.dimensions.width} × ${source.dimensions.height}`
            : 'dimensions available after inspection'}
        </p>
        {output && (
          <p className="muted">
            Selected result: {output.name} ·{' '}
            {output.dimensions
              ? `${output.dimensions.width} × ${output.dimensions.height}`
              : 'actual canvas available after inspection'}
            . Use as Ripple replacement sends this result while preserving the Ripple source.
          </p>
        )}
        <p className="muted">
          Source is scaled and center cropped to the selected canvas before editing. Original image
          remains intact.
        </p>
      </Section>
      <Section title="Generation">
        <Field label="Seed">
          <input
            aria-label="Photo Edit seed"
            className="control"
            value={settings.seed}
            onChange={(event) => patchDraft({ seed: event.target.value }, 'photo-edit')}
          />
        </Field>
        <p className="muted">
          {settings.profile === 'turbo' ? '8 steps · CFG 1 · Lightning LoRA' : '40 steps · CFG 4'} ·
          Euler · simple schedule · AuraFlow shift 3.1.
        </p>
        <p className="muted">
          Describe the change to the source image. Up to two reference images can guide the edit.
        </p>
      </Section>
    </>
  );
}

function PhotoInputs() {
  const settings = usePhotoEdit();
  const projectId = useShell((state) => state.projectId);
  const images = useLibrary((state) => state.assets).filter(
    (asset) =>
      asset.kind === 'image' &&
      !asset.missing &&
      (!asset.projectId || asset.projectId === projectId),
  );
  return (
    <div className="reference-editor">
      <Field label="Source image">
        <select
          aria-label="Photo Edit source"
          className="control"
          value={settings.sourceImage || ''}
          onChange={(event) =>
            patchDraft({ sourceImage: event.target.value || null }, 'photo-edit')
          }
        >
          <option value="">Choose a photo</option>
          {images.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>
      </Field>
      {[0, 1].map((index) => (
        <Field key={index} label={`Reference ${index + 1} (optional)`}>
          <select
            aria-label={`Photo Edit reference ${index + 1}`}
            className="control"
            value={settings.references[index] || ''}
            onChange={(event) => {
              const references = [...settings.references];
              references[index] = event.target.value;
              patchDraft({ references: references.filter(Boolean) }, 'photo-edit');
            }}
          >
            <option value="">None</option>
            {images.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </Field>
      ))}
      <button
        className="smallbtn"
        onClick={() =>
          void guarded(async () => {
            await window.oyama.importMedia({ projectId });
            await refreshLibrary();
          })
        }
      >
        <Plus size={12} /> Import photo
      </button>
    </div>
  );
}

export function PhotoEditComposer() {
  const settings = usePhotoEdit();
  const projectId = useShell((state) => state.projectId);
  const tab = useShell((state) => state.composerTab);
  const readiness = useSettings((state) => state.readiness);
  const availability = photoEditAvailability(readiness, settings.profile);
  const jobs = useJobs((state) => state.jobs);
  const selectedId = useShell((state) => state.selectedAsset);
  const ownJobs = jobs.filter(
    (job) =>
      job.projectId === projectId && job.moduleId === 'photo-edit' && job.status === 'complete',
  );
  const outputId = ownJobs.some((job) => job.assetIds.includes(selectedId || ''))
    ? selectedId
    : ownJobs[0]?.assetIds[0];
  const output = useLibrary((state) =>
    state.assets.find((asset) => asset.id === outputId && asset.kind === 'image' && !asset.missing),
  );
  const [submitting, setSubmitting] = useState(false);
  const canGenerate = availability.ready && Boolean(settings.sourceImage && settings.prompt.trim());
  const generate = async () => {
    setSubmitting(true);
    try {
      await guarded(async () => {
        const job = await window.oyama.generate(draftFor(projectId, 'photo-edit'));
        useJobs.setState((state) => ({
          jobs: [job, ...state.jobs.filter((item) => item.id !== job.id)],
        }));
        useShell.setState({ inspectorTab: 'Queue' });
      });
    } finally {
      setSubmitting(false);
    }
  };
  const visibleTab = tab === 'References' ? tab : 'Prompt';
  return (
    <section className="composer">
      <div className="composer-tabs">
        {['Prompt', 'References'].map((item) => (
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
          <PhotoInputs />
        ) : (
          <PromptInput
            aria-label="Photo Edit prompt"
            onInsert={(prompt) => patchDraft({ prompt }, 'photo-edit')}
            placeholder="Describe the change; specify details to preserve..."
            value={settings.prompt}
            onChange={(event) => patchDraft({ prompt: event.target.value }, 'photo-edit')}
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
          {settings.profile === 'turbo' ? 'Turbo' : 'Quality'}
        </span>
        <button
          className="smallbtn"
          onClick={() => useShell.setState({ composerTab: 'References' })}
        >
          Inputs
        </button>
        <button
          className="smallbtn"
          disabled={!output}
          onClick={() =>
            void guarded(async () => {
              if (!output) return;
              const draft = await window.oyama.handoffAsset({
                assetId: output.id,
                projectId,
                targetModuleId: 'ripple',
                targetField: 'replacementFrame',
              });
              useDrafts.setState((state) => ({
                drafts: { ...state.drafts, [draftKey(projectId, 'ripple')]: draft },
              }));
              useShell.getState().navigate('ripple');
              useShell.setState({
                composerTab: 'References',
                inspectorTab: 'Properties',
                selectedAsset: null,
              });
            })
          }
        >
          Use as Ripple replacement
        </button>
        <button
          className="generate"
          disabled={!canGenerate || submitting}
          title={availability.message}
          onClick={() => void generate()}
        >
          <Sparkles size={12} /> {submitting ? 'SUBMITTING' : 'GENERATE IMAGE'}
        </button>
      </div>
    </section>
  );
}
