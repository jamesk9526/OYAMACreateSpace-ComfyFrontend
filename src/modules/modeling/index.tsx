import { useState } from 'react';
import { Field, Section, Modal } from '../../components/ui';
import { LibraryImageGenerator } from '../../components/LibraryImageGenerator';
import { modelingImagePrompt } from './prompt';
import { ModelPreview } from '../../components/ModelPreview';
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
import { modelingAvailability, modelingDefaults, type ModelingSettings } from './definition';
import './modeling.css';
function useModeling() {
  const projectId = useShell((s) => s.projectId);
  const values = useDrafts((s) => s.drafts[draftKey(projectId, 'modeling')]?.values);
  return { ...modelingDefaults, ...values } as ModelingSettings;
}
function useOutput() {
  const projectId = useShell((s) => s.projectId),
    selected = useShell((s) => s.selectedAsset);
  const jobs = useJobs((s) => s.jobs),
    assets = useLibrary((s) => s.assets);
  const ids = jobs
    .filter(
      (j) => j.projectId === projectId && j.moduleId === 'modeling' && j.status === 'complete',
    )
    .flatMap((j) => j.assetIds);
  return assets.find(
    (a) => a.kind === 'model' && a.id === (selected && ids.includes(selected) ? selected : ids[0]),
  );
}
export function ModelingWorkspace() {
  const settings = useModeling(),
    assets = useLibrary((s) => s.assets),
    output = useOutput();
  const source = assets.find((a) => a.id === settings.sourceImage);
  const [view, setView] = useState('Model');
  return (
    <section className="canvasarea modeling-canvas" aria-label="Modeling workspace">
      <div className="canvas-toolbar">
        <button className="smallbtn" onClick={() => setView('Model')}>
          Model
        </button>
        <button className="smallbtn" disabled={!source} onClick={() => setView('Source')}>
          Source
        </button>
      </div>
      {view === 'Source' && source && !source.missing ? (
        <img className="modeling-source" src={source.url} alt={source.name} />
      ) : output && !output.missing ? (
        <ModelPreview asset={output} />
      ) : (
        <div className="modeling-empty">
          {output?.missing
            ? 'Managed model is missing.'
            : 'Choose an image below to create a 3D model.'}
        </div>
      )}
    </section>
  );
}
export function ModelingInspector() {
  const s = useModeling();
  return (
    <>
      <Section title="Modeling">
        <Field label="Model">
          <input className="control" value="Pixal3D" readOnly />
        </Field>
        <p className="muted">Single view → textured GLB · PBR, normal and occlusion maps</p>
        <button
          className="smallbtn"
          onClick={() =>
            patchDraft(
              {
                ...modelingDefaults,
                sourceImage: s.sourceImage,
                mode: s.mode,
                look: s.look,
                description: s.description,
              },
              'modeling',
            )
          }
        >
          Match Comfy settings
        </button>
      </Section>
      <Section title="Creation">
        <Field label="Mode">
          <select
            aria-label="Mode"
            className="control"
            value={s.mode}
            onChange={(e) => patchDraft({ mode: e.target.value }, 'modeling')}
          >
            <option value="character">Character</option>
            <option value="asset">Asset</option>
          </select>
        </Field>
        <Field label="Look">
          <select
            aria-label="Look"
            className="control"
            value={s.look}
            onChange={(e) => patchDraft({ look: e.target.value }, 'modeling')}
          >
            <option value="realistic">Realistic</option>
            <option value="animated">Animated</option>
          </select>
        </Field>
      </Section>
      <Section title="Asset settings">
        <Field label="Shape resolution">
          <select
            aria-label="Shape resolution"
            className="control"
            value={s.shapeResolution}
            onChange={(e) => patchDraft({ shapeResolution: Number(e.target.value) }, 'modeling')}
          >
            <option value={1024}>1024</option>
            <option value={1536}>1536 · Comfy</option>
          </select>
        </Field>
        <Field label="Remesh resolution">
          <input
            aria-label="Remesh resolution"
            className="control"
            type="number"
            min={128}
            max={1024}
            value={s.remeshResolution}
            onChange={(e) => patchDraft({ remeshResolution: Number(e.target.value) }, 'modeling')}
          />
        </Field>
        <Field label="Smoothing iterations">
          <input
            aria-label="Smoothing iterations"
            className="control"
            type="number"
            min={0}
            max={100}
            value={s.smoothIterations}
            onChange={(e) => patchDraft({ smoothIterations: Number(e.target.value) }, 'modeling')}
          />
        </Field>
        <Field label="Target triangles">
          <input
            aria-label="Target triangles"
            className="control"
            type="number"
            min={1000}
            max={2000000}
            value={s.targetFaces}
            onChange={(e) => patchDraft({ targetFaces: Number(e.target.value) }, 'modeling')}
          />
        </Field>
        <Field label="Texture size">
          <select
            aria-label="Texture size"
            className="control"
            value={s.textureSize}
            onChange={(e) => patchDraft({ textureSize: Number(e.target.value) }, 'modeling')}
          >
            <option value={1024}>1024 × 1024</option>
            <option value={2048}>2048 × 2048</option>
            <option value={4096}>4096 × 4096 · Comfy</option>
          </select>
        </Field>
        <Field label="Shape seed">
          <input
            aria-label="Shape seed"
            className="control"
            value={s.shapeSeed}
            onChange={(e) => patchDraft({ shapeSeed: e.target.value }, 'modeling')}
          />
        </Field>
        <Field label="Texture seed">
          <input
            aria-label="Texture seed"
            className="control"
            value={s.textureSeed}
            onChange={(e) => patchDraft({ textureSeed: e.target.value }, 'modeling')}
          />
        </Field>
        <p className="muted">
          Euler · steps 12 / 20 / 12 / 12 · CFG 7.5 / 7.5 / 7.5 / 1. Remesh UDF, midpoint
          decimation, normals 180°. Normal map 2048; AO 1024, 64 samples.
        </p>
        <Field label="Camera field of view">
          <input
            aria-label="Camera field of view"
            className="control"
            type="number"
            min={1}
            max={170}
            step={0.1}
            value={s.fov}
            onChange={(e) => patchDraft({ fov: Number(e.target.value) }, 'modeling')}
          />
        </Field>
        <Field label="Seed">
          <input
            aria-label="Seed"
            className="control"
            value={s.seed}
            onChange={(e) => patchDraft({ seed: e.target.value }, 'modeling')}
          />
        </Field>
      </Section>
    </>
  );
}
export function ModelingComposer() {
  const s = useModeling(),
    projectId = useShell((state) => state.projectId),
    assets = useLibrary((state) => state.assets),
    jobs = useJobs((state) => state.jobs),
    ready = useSettings((state) => state.readiness),
    output = useOutput();
  const [submitting, setSubmitting] = useState(false);
  const [imageCreator, setImageCreator] = useState(false);
  const source = assets.find(
    (a) =>
      a.id === s.sourceImage &&
      a.kind === 'image' &&
      !a.missing &&
      (a.projectId === null || a.projectId === projectId),
  );
  const availability = modelingAvailability(ready);
  const active = jobs.some(
    (j) =>
      j.moduleId === 'modeling' &&
      j.projectId === projectId &&
      ['preparing', 'submitting', 'queued', 'running', 'recovering', 'unknown'].includes(j.status),
  );
  const generate = async () => {
    setSubmitting(true);
    try {
      await guarded(async () => {
        const job = await window.oyama.generate(draftFor(projectId, 'modeling'));
        useJobs.setState((state) => ({
          jobs: [job, ...state.jobs.filter((j) => j.id !== job.id)],
        }));
        useShell.setState({ inspectorTab: 'Queue', selectedAsset: null });
      });
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <section className="composer">
      <div className="composer-tabs">
        <div className="composer-tab active">
          {s.mode === 'character' ? 'Character' : 'Asset'} ·{' '}
          {s.look === 'animated' ? 'Animated' : 'Realistic'}
        </div>
      </div>
      <div className="modeling-input">
        {source && <img src={source.url} alt="Source image" />}
        <Field label="Source image">
          <select
            aria-label="Source image"
            className="control"
            value={s.sourceImage || ''}
            onChange={(e) => patchDraft({ sourceImage: e.target.value || null }, 'modeling')}
          >
            <option value="">Choose an image…</option>
            {assets
              .filter(
                (a) =>
                  a.kind === 'image' &&
                  !a.missing &&
                  (a.projectId === null || a.projectId === projectId),
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
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
              const image = imported.find((a) => a.kind === 'image');
              if (image) patchDraft({ sourceImage: image.id }, 'modeling');
            })
          }
        >
          Import image
        </button>
        <div className="modeling-image-create">
          <input
            className="control"
            aria-label="Modeling description"
            placeholder={
              s.mode === 'character' ? 'Describe your character…' : 'Describe your asset…'
            }
            value={s.description}
            onChange={(e) => patchDraft({ description: e.target.value }, 'modeling')}
          />
          <button className="smallbtn" onClick={() => setImageCreator(true)}>
            Create image · ZImage
          </button>
        </div>
      </div>
      <div className="composer-actions">
        <span className="muted">{availability.message}</span>
        <button
          className="smallbtn"
          disabled={!output || output.missing}
          onClick={() => void guarded(() => window.oyama.exportAsset(output!.id))}
        >
          Export GLB
        </button>
        <button
          className="smallbtn"
          disabled={!source}
          onClick={() => {
            patchDraft(
              {
                mode: 'turnaround',
                firstFrame: source!.id,
                prompt:
                  s.description ||
                  (s.mode === 'character'
                    ? 'Full-body character in a neutral A-pose.'
                    : 'Centered standalone game asset.'),
                duration: 8,
              },
              'ltx',
            );
            useShell.getState().navigate('ltx');
            useShell.setState({ inspectorTab: 'Properties', composerTab: 'Prompt' });
          }}
        >
          LTX turnaround
        </button>
        <button
          className="generate"
          disabled={!source || !availability.ready || submitting || active}
          onClick={() => void generate()}
        >
          GENERATE MODEL
        </button>
      </div>
      <Modal
        open={imageCreator}
        onClose={() => setImageCreator(false)}
        title="Create Modeling input"
        description="Create and review an image with ZImage, then use it as your 3D source."
      >
        <LibraryImageGenerator
          target={{ kind: 'assets' }}
          prompt={modelingImagePrompt(s)}
          width={1024}
          height={1024}
          onUse={(asset) => {
            patchDraft({ sourceImage: asset.id }, 'modeling');
            setImageCreator(false);
          }}
        />
      </Modal>
    </section>
  );
}
