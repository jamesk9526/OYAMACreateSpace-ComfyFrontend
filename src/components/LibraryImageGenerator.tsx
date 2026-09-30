import { useState } from 'react';
import { Image as ImageIcon, Sparkles } from 'lucide-react';
import type { Asset, Job, LibraryImageRequest } from '../../shared/domain';
import {
  zImageAvailability,
  zImageDefaults,
  type ZImageSettings,
} from '../modules/zimage/definition';
import { guarded, refreshLibrary, useJobs, useLibrary, useSettings, useShell } from '../stores';
import { Field } from './ui';

export function AssetThumbnail({ asset, className = '' }: { asset?: Asset; className?: string }) {
  const [failedId, setFailedId] = useState<string | null>(null);
  if (
    !asset ||
    asset.missing ||
    failedId === asset.id ||
    asset.kind === 'audio' ||
    asset.kind === 'model'
  )
    return (
      <span
        className={`asset-placeholder ${className}`}
        aria-label={asset?.missing ? 'File missing' : 'Preview unavailable'}
      >
        <ImageIcon size={20} />
      </span>
    );
  return (
    <img
      className={className}
      src={`oyama://thumbnail/${asset.id}`}
      alt={asset.name}
      loading="lazy"
      onError={() => setFailedId(asset.id)}
    />
  );
}

type Target = LibraryImageRequest['target'];
function matches(job: Job, target: Target, projectId: string) {
  if (job.projectId !== projectId || job.moduleId !== 'zimage') return false;
  if (target.kind === 'assets') return job.libraryImageTarget?.kind === 'assets';
  return (
    job.libraryImageTarget?.kind === 'record' && job.libraryImageTarget.recordId === target.recordId
  );
}

export function LibraryImageGenerator({
  target,
  prompt,
  width,
  height,
  onPrepare,
  onUse,
  onBack,
}: {
  target: Target;
  prompt: string;
  width: number;
  height: number;
  onPrepare?: () => Promise<void>;
  onUse?: (asset: Asset) => void;
  onBack?: () => void;
}) {
  const projectId = useShell((state) => state.projectId);
  const readiness = useSettings((state) => state.readiness);
  const jobs = useJobs((state) => state.jobs).filter((job) => matches(job, target, projectId));
  const assets = useLibrary((state) => state.assets);
  const [values, setValues] = useState<ZImageSettings>({
    ...zImageDefaults,
    prompt,
    width,
    height,
  });
  const [busy, setBusy] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const selected = jobs.find((job) => job.id === selectedJobId) || jobs[0];
  const output = assets.find((asset) => asset.id === selected?.assetIds[0]);
  const unresolved = jobs.find((job) => job.status === 'unknown');
  const availability = zImageAvailability(readiness, values.variant);
  const update = (patch: Partial<ZImageSettings>) =>
    setValues((current) => ({ ...current, ...patch }));
  const generate = async () => {
    setBusy(true);
    try {
      await guarded(async () => {
        await onPrepare?.();
        const job = await window.oyama.generateLibraryImage({ projectId, target, values });
        useJobs.setState((state) => ({
          jobs: [job, ...state.jobs.filter((item) => item.id !== job.id)],
        }));
        setSelectedJobId(job.id);
      });
    } finally {
      setBusy(false);
    }
  };
  const useImage = async () => {
    if (!selected || selected.status !== 'complete') return;
    setBusy(true);
    try {
      await guarded(async () => {
        await onPrepare?.();
        const asset = await window.oyama.useLibraryImage(selected.id);
        await refreshLibrary();
        onUse?.(asset);
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="library-image-generator">
      <div className="generator-heading">
        <strong>Generate image here</strong>
        {onBack && (
          <button type="button" className="smallbtn" onClick={onBack}>
            Back to details
          </button>
        )}
      </div>
      <Field label="Image prompt">
        <textarea
          className="record-description"
          value={values.prompt}
          onChange={(event) => update({ prompt: event.target.value })}
        />
      </Field>
      <div className="split">
        <Field label="Profile">
          <select
            className="control"
            value={values.variant}
            onChange={(event) =>
              update(
                event.target.value === 'base'
                  ? { variant: 'base', steps: 40, cfg: 4 }
                  : { variant: 'turbo', steps: 8, cfg: 1 },
              )
            }
          >
            <option value="turbo">Turbo</option>
            <option value="base">Base</option>
          </select>
        </Field>
        <Field label="Seed">
          <input
            className="control"
            value={values.seed}
            onChange={(event) => update({ seed: event.target.value })}
          />
        </Field>
      </div>
      <details className="generator-advanced">
        <summary>Advanced</summary>
        <div className="split">
          <Field label="Width">
            <input
              className="control"
              type="number"
              min="256"
              max="2048"
              step="32"
              value={values.width}
              onChange={(event) => update({ width: Number(event.target.value) })}
            />
          </Field>
          <Field label="Height">
            <input
              className="control"
              type="number"
              min="256"
              max="2048"
              step="32"
              value={values.height}
              onChange={(event) => update({ height: Number(event.target.value) })}
            />
          </Field>
          <Field label="Steps">
            <input
              className="control"
              type="number"
              min={values.variant === 'turbo' ? 4 : 28}
              max={values.variant === 'turbo' ? 20 : 50}
              value={values.steps}
              onChange={(event) => update({ steps: Number(event.target.value) })}
            />
          </Field>
          <Field label="Guidance">
            <input
              className="control"
              type="number"
              min={values.variant === 'turbo' ? 1 : 3}
              max={values.variant === 'turbo' ? 3 : 5}
              step="0.1"
              value={values.cfg}
              onChange={(event) => update({ cfg: Number(event.target.value) })}
            />
          </Field>
        </div>
        {values.variant === 'base' && (
          <Field label="Negative prompt">
            <textarea
              className="record-description"
              value={values.negative}
              onChange={(event) => update({ negative: event.target.value })}
            />
          </Field>
        )}
      </details>
      {unresolved && (
        <p className="validation">
          A prior submission is uncertain. Inspect its prompt in Queue before generating again.{' '}
          <button
            type="button"
            className="smallbtn"
            onClick={() => useShell.setState({ inspectorTab: 'Queue' })}
          >
            Open Queue
          </button>
        </p>
      )}
      <p className={availability.ready ? 'muted' : 'validation'}>{availability.message}</p>
      <button
        type="button"
        className="generate"
        disabled={
          busy ||
          !availability.ready ||
          !!unresolved ||
          !values.prompt.trim() ||
          !!jobs.find((job) =>
            ['preparing', 'submitting', 'queued', 'running', 'recovering'].includes(job.status),
          )
        }
        onClick={() => void generate()}
      >
        <Sparkles size={13} /> {busy ? 'Submitting…' : 'Generate image'}
      </button>
      {jobs.length > 1 && (
        <div className="candidate-strip" aria-label="Generated candidates">
          {jobs.map((job) => (
            <button
              type="button"
              key={job.id}
              className={job.id === selected?.id ? 'selected' : ''}
              onClick={() => setSelectedJobId(job.id)}
            >
              {job.status === 'complete' ? (
                <AssetThumbnail asset={assets.find((asset) => asset.id === job.assetIds[0])} />
              ) : (
                <span>{job.status}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="generator-result" aria-live="polite">
          <strong>
            {selected.status === 'complete' ? 'Image ready for review' : selected.status}
          </strong>
          <p>{selected.message}</p>
          {selected.status === 'complete' && output && (
            <>
              <img src={output.url} alt="Generated candidate" />
              <button
                type="button"
                className="generate"
                disabled={busy || !!selected.libraryImageAssetId}
                onClick={() => void useImage()}
              >
                {selected.libraryImageAssetId ? 'Image used' : 'Use image'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
