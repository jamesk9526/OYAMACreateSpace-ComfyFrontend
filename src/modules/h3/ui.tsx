import { ResolutionControls } from '../../components/ResolutionControls';
import { PromptInput } from '../../components/PromptInput';
import { useState } from 'react';
import { Sparkles, Plus, UserRound, WandSparkles } from 'lucide-react';
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
import { h3Availability, h3Defaults, type H3Settings } from './definition';
import { effectiveSteps, h3Frames } from './workflow';
import { activeRecordAssetIds } from '../../../shared/record-media';

export function useH3(): H3Settings {
  const projectId = useShell((s) => s.projectId);
  const values = useDrafts((s) => s.drafts[draftKey(projectId, 'h3')]?.values);
  return { ...h3Defaults, ...values } as H3Settings;
}
export function H3Inspector() {
  const s = useH3();
  const readiness = useSettings((v) => v.readiness);
  const assets = useLibrary((v) => v.assets);
  const records = useLibrary((v) => v.records);
  const availability = h3Availability(readiness, s.mode, s.quality);
  const [advanced, setAdvanced] = useState(false);
  const turbo =
    readiness?.mock ||
    readiness?.models.lora?.some((n) =>
      n.includes(s.mode === 'reference' ? 'ref2v_turbo_8step' : 'fl2v_turbo_8step'),
    );
  const firstFrame = assets.find((asset) => asset.id === s.firstFrame);
  const activeReferences =
    s.mode === 'reference'
      ? new Set([
          ...s.references,
          ...records
            .filter((r) => [...s.characterIds, ...s.locationIds, ...s.wardrobeIds].includes(r.id))
            .flatMap((r) => activeRecordAssetIds(r, assets)),
        ]).size
      : 0;
  return (
    <>
      <Section title="Generator">
        <Field label="Module">
          <select className="control" value="h3" onChange={() => {}}>
            <option value="h3">H3 Video</option>
            <option disabled>LTX 2.5 Video — choose from navigation</option>
          </select>
        </Field>
        <Field label="Mode">
          <select
            aria-label="Mode"
            className="control"
            value={s.mode}
            onChange={(e) => {
              patchDraft({ mode: e.target.value, modeExplicit: true });
              useShell.setState({ composerTab: 'Prompt' });
            }}
          >
            <option value="text">Text to Video</option>
            <option value="image">Image to Video</option>
            <option value="reference">Ref2VA</option>
          </select>
        </Field>
        <Field label="Model">
          <select
            aria-label="Model"
            className="control"
            value={s.quality}
            onChange={(e) => patchDraft({ quality: e.target.value })}
          >
            <option value="native">MiniMax H3 · Native Quality</option>
            <option value="turbo8" disabled={!turbo}>
              MiniMax H3 · Turbo 8{!turbo ? ' (LoRA unavailable)' : ''}
            </option>
          </select>
        </Field>
      </Section>
      <p className={availability.ready ? 'muted' : 'validation'}>{availability.message}</p>
      <Section title="Preflight">
        <p className="muted">
          {s.mode === 'text' ? 'Text to Video' : s.mode === 'image' ? 'Image to Video' : 'Ref2VA'} ·{' '}
          {s.quality === 'native' ? 'Native Quality' : 'Turbo 8'} · {effectiveSteps(s)} steps
        </p>
        <p className="muted">
          Requested {s.duration}s · encoded {h3Frames(s.duration)} frames at 24 FPS (
          {(h3Frames(s.duration) / 24).toFixed(3)}s) · video with audio
        </p>
        {s.mode === 'image' && (
          <p className={firstFrame && !firstFrame.missing ? 'muted' : 'validation'}>
            First frame:{' '}
            {firstFrame && !firstFrame.missing ? firstFrame.name : 'Choose a first frame in Frames'}
          </p>
        )}
        {s.mode === 'reference' && (
          <p className={activeReferences ? 'muted' : 'validation'}>
            Active references: {activeReferences || 'Choose a reference in References or Character'}{' '}
            · identity sizing: {s.refImageSize === 'max' ? 'Maximum' : 'Match output'}
          </p>
        )}
        <p className="muted">
          Live preview:{' '}
          {s.livePreview && readiness?.nodes.includes('MiniMaxH3LivePreview')
            ? 'available'
            : 'off or unavailable'}{' '}
          · seed: {s.seed}
        </p>
      </Section>
      {s.mode === 'reference' && (
        <Section title="Reference identity">
          <Field label="Reference image sizing">
            <select
              className="control"
              aria-label="Ref2VA identity detail"
              value={s.refImageSize}
              onChange={(event) => patchDraft({ refImageSize: event.target.value }, 'h3')}
            >
              <option value="match">Match output · faster</option>
              <option value="max">Maximum identity detail</option>
            </select>
          </Field>
          <p className="muted">
            Maximum keeps original reference detail up to a 2048px short edge; it never enlarges
            small images. Larger references can take more memory and several times longer.
          </p>
        </Section>
      )}
      <Section title="Output">
        <ResolutionControls moduleId="h3" label="H3" settings={s} max={4096} />
        {(s.width % 32 !== 0 || s.height % 32 !== 0) && (
          <p className="validation">Dimensions must be multiples of 32.</p>
        )}
        <Field label="Duration" note={`${s.duration} sec`}>
          <input
            className="range"
            type="range"
            min={1}
            max={15}
            value={s.duration}
            onChange={(e) => patchDraft({ duration: Number(e.target.value) })}
          />
        </Field>
        <Field label="FPS">
          <select className="control" value="24" disabled>
            <option>24</option>
          </select>
        </Field>
      </Section>
      <Section title="Generation">
        <Toggle
          label="Live sampling preview"
          checked={s.livePreview}
          onChange={(livePreview) => patchDraft({ livePreview })}
        />
        <p className="muted">
          {readiness?.nodes.includes('MiniMaxH3LivePreview')
            ? 'Animated H3 preview during sampling; final output replaces it.'
            : 'Live previews require MiniMaxH3LivePreview on ComfyUI.'}
        </p>
        <Field label="Steps" note={String(effectiveSteps(s))}>
          <input
            className="control"
            type="number"
            min={1}
            max={100}
            value={effectiveSteps(s)}
            aria-label="H3 sampling steps"
            disabled={s.nativeDefaults}
            onChange={(e) => patchDraft({ steps: Number(e.target.value) })}
          />
        </Field>
        <Field label="Seed">
          <input
            className="control"
            value={s.seed}
            onChange={(e) => patchDraft({ seed: e.target.value })}
          />
        </Field>
        <Field label="Scheduler">
          <select className="control" disabled>
            <option>Model Default · simple</option>
          </select>
        </Field>
        <Toggle
          label="Use profile step defaults"
          checked={s.nativeDefaults}
          onChange={(value) => patchDraft({ nativeDefaults: value })}
        />
        {!s.nativeDefaults && (
          <p className="muted">
            Custom steps use the selected Native or Turbo model recipe. Turbo is tuned for 8 steps;
            other counts can change quality.
          </p>
        )}
      </Section>
      <Section title="Advanced">
        <Toggle label="Advanced parameters" checked={advanced} onChange={setAdvanced} />
        {advanced && (
          <p className="muted">
            Sampler: res_multistep
            <br />
            Frame count: {h3Frames(s.duration)} ({(h3Frames(s.duration) / 24).toFixed(2)}s encoded)
            <br />
            Video and audio are decoded together. Negative conditioning is unavailable for this
            graph.
          </p>
        )}
      </Section>
      <div className="canonical">
        <b>Canonical settings</b>
        <br />
        These controls share the active project draft. Switching workspaces preserves your values.
      </div>
    </>
  );
}
function ReferenceEditor() {
  const s = useH3();
  const assets = useLibrary((v) => v.assets);
  const records = useLibrary((v) => v.records);
  const projectId = useShell((v) => v.projectId);
  const available = assets.filter((a) => !a.missing && (!a.projectId || a.projectId === projectId));
  const attachedBy = new Map<string, string[]>();
  for (const record of records) {
    if (![...s.characterIds, ...s.locationIds, ...s.wardrobeIds].includes(record.id)) continue;
    for (const id of activeRecordAssetIds(record, assets)) {
      attachedBy.set(id, [...(attachedBy.get(id) || []), record.name]);
    }
  }
  return (
    <div className="reference-editor">
      {s.mode === 'image' ? (
        <div className="split">
          {(['firstFrame', 'lastFrame'] as const).map((key) => (
            <Field key={key} label={key === 'firstFrame' ? 'First frame' : 'Last frame (optional)'}>
              <select
                aria-label={key === 'firstFrame' ? 'First frame' : 'Last frame (optional)'}
                className="control"
                value={s[key] || ''}
                onChange={(e) => patchDraft({ [key]: e.target.value || null })}
              >
                <option value="">Choose image</option>
                {available
                  .filter((a) => a.kind === 'image')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </Field>
          ))}
        </div>
      ) : (
        <>
          {s.mode !== 'reference' && (
            <p className="muted">
              Switch to Ref2VA to use reference media. Use Image to Video for first/last frames.
            </p>
          )}
          <div className="reference-list">
            {available.map((a) => (
              <label key={a.id} className="chip">
                <input
                  type="checkbox"
                  checked={s.references.includes(a.id) || attachedBy.has(a.id)}
                  disabled={attachedBy.has(a.id)}
                  onChange={(e) =>
                    patchDraft({
                      ...(e.target.checked ? { mode: 'reference' } : {}),
                      references: e.target.checked
                        ? [...s.references, a.id]
                        : s.references.filter((id) => id !== a.id),
                    })
                  }
                />
                {a.name}
                {attachedBy.has(a.id) && (
                  <span className="muted"> · {attachedBy.get(a.id)!.join(', ')}</span>
                )}
              </label>
            ))}
            {!available.length && (
              <span className="muted">Import an image, video, or audio reference below.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
function CharacterEditor() {
  const s = useH3();
  const records = useLibrary((v) => v.records);
  const assets = useLibrary((v) => v.assets);
  return (
    <div className="reference-editor">
      <div className="reference-list">
        {records.map((record) => {
          const key =
            record.kind === 'character'
              ? 'characterIds'
              : record.kind === 'location'
                ? 'locationIds'
                : 'wardrobeIds';
          return (
            <label className="chip" key={record.id}>
              <input
                type="checkbox"
                checked={s[key].includes(record.id)}
                onChange={(e) =>
                  patchDraft({
                    ...(e.target.checked && activeRecordAssetIds(record, assets).length
                      ? { mode: 'reference' }
                      : {}),
                    ...(e.target.checked && record.kind === 'wardrobe' && record.characterId
                      ? { characterIds: [...new Set([...s.characterIds, record.characterId])] }
                      : {}),
                    [key]: e.target.checked
                      ? [...s[key], record.id]
                      : s[key].filter((id) => id !== record.id),
                  })
                }
              />
              {record.name} <span className="muted">{record.kind}</span>
            </label>
          );
        })}
        {!records.length && (
          <span className="muted">
            Create reusable Characters, Locations or Wardrobe outfits from the left navigation.
          </span>
        )}
      </div>
      <Field label="Style direction">
        <input
          className="control"
          placeholder="Cinematic, soft light, natural motion…"
          value={s.style}
          onChange={(e) => patchDraft({ style: e.target.value })}
        />
      </Field>
    </div>
  );
}
export function H3Composer() {
  const s = useH3();
  const tab = useShell((v) => v.composerTab);
  const tabs =
    s.mode === 'reference'
      ? ['Prompt', 'References', 'Character', 'Negative']
      : s.mode === 'image'
        ? ['Prompt', 'Frames', 'Negative']
        : ['Prompt', 'Negative'];
  const visibleTab = tabs.includes(tab) ? tab : 'Prompt';
  const projectId = useShell((v) => v.projectId);
  const readiness = useSettings((v) => v.readiness);
  const availability = h3Availability(readiness, s.mode, s.quality);
  const records = useLibrary((v) => v.records);
  const assets = useLibrary((v) => v.assets);
  const mediaReady =
    s.mode === 'text' ||
    (s.mode === 'image'
      ? Boolean(s.firstFrame)
      : s.references.length > 0 ||
        records.some(
          (r) =>
            [...s.characterIds, ...s.locationIds, ...s.wardrobeIds].includes(r.id) &&
            activeRecordAssetIds(r, assets).length > 0,
        ));
  const mediaRequiresReference =
    s.mode !== 'reference' &&
    !s.modeExplicit &&
    (s.references.length > 0 ||
      records.some(
        (r) =>
          [...s.characterIds, ...s.locationIds, ...s.wardrobeIds].includes(r.id) &&
          activeRecordAssetIds(r, assets).length > 0,
      ));
  const [submitting, setSubmitting] = useState(false);
  const generate = async () => {
    setSubmitting(true);
    try {
      await guarded(async () => {
        const job = await window.oyama.generate(draftFor(projectId));
        useJobs.setState((v) => ({ jobs: [job, ...v.jobs.filter((j) => j.id !== job.id)] }));
        useShell.setState({ inspectorTab: 'Queue' });
      });
    } finally {
      setSubmitting(false);
    }
  };
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
            aria-label="Prompt"
            onInsert={(prompt) => patchDraft({ prompt }, 'h3')}
            placeholder="Describe the shot, motion, camera, lighting, environment, and subject..."
            value={s.prompt}
            onChange={(e) => patchDraft({ prompt: e.target.value })}
            onKeyDown={(e) => {
              if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                if (
                  !submitting &&
                  availability.ready &&
                  mediaReady &&
                  s.prompt.trim() &&
                  !mediaRequiresReference
                )
                  void generate();
              }
            }}
          />
        ) : visibleTab === 'References' || visibleTab === 'Frames' ? (
          <ReferenceEditor />
        ) : visibleTab === 'Character' ? (
          <CharacterEditor />
        ) : (
          <div>
            <p className="muted">
              H3 uses positive conditioning only. Negative text is saved for future compatible
              modules and is not submitted.
            </p>
            <textarea
              aria-label="Negative prompt"
              disabled
              value={s.negative}
              placeholder="Not supported by this H3 workflow"
            />
          </div>
        )}
      </div>
      <div className="composer-actions">
        {mediaRequiresReference && (
          <button className="smallbtn" onClick={() => patchDraft({ mode: 'reference' })}>
            Use Ref2VA for attached media
          </button>
        )}
        {s.mode !== 'text' && (
          <button
            className="smallbtn"
            onClick={() =>
              void guarded(async () => {
                const imported = await window.oyama.importMedia({ projectId });
                await refreshLibrary();
                if (s.mode === 'image') {
                  const first = imported.find((a) => a.kind === 'image');
                  if (first) patchDraft({ firstFrame: first.id });
                } else
                  patchDraft({
                    ...(imported.length ? { mode: 'reference' } : {}),
                    references: [...new Set([...s.references, ...imported.map((a) => a.id)])],
                  });
                useShell.setState({ composerTab: s.mode === 'image' ? 'Frames' : 'References' });
              })
            }
          >
            <Plus size={12} /> {s.mode === 'image' ? 'Frame' : 'Reference'}
          </button>
        )}
        {s.mode === 'reference' && (
          <button
            className="smallbtn"
            onClick={() => useShell.setState({ composerTab: 'Character' })}
          >
            <UserRound size={12} /> Character
          </button>
        )}
        <select
          aria-label="Style preset"
          className="smallbtn preset"
          value=""
          onChange={(e) => {
            patchDraft({ style: e.target.value });
            useShell.setState({ composerTab: s.mode === 'reference' ? 'Character' : 'Prompt' });
          }}
        >
          <option value="">◇ Preset</option>
          <option value="Cinematic composition, natural light, subtle camera motion.">
            Cinematic
          </option>
          <option value="Documentary realism, handheld camera, available light.">
            Documentary
          </option>
          <option value="Carefully framed studio shot, soft lighting, clean background.">
            Studio
          </option>
        </select>
        <button
          className="smallbtn"
          onClick={() => {
            patchDraft({
              prompt: `${s.prompt}${s.prompt ? '\n\n' : ''}Subject: \nAction: \nCamera: \nLighting: \nEnvironment: \nAudio: `,
            });
            useShell.setState({ composerTab: 'Prompt' });
          }}
        >
          <WandSparkles size={12} /> Prompt Tools
        </button>
        <button
          className="generate"
          disabled={
            submitting ||
            !s.prompt.trim() ||
            !availability.ready ||
            !mediaReady ||
            mediaRequiresReference
          }
          title={
            !availability.ready
              ? availability.message
              : !mediaReady
                ? s.mode === 'image'
                  ? 'Choose a first frame'
                  : 'Attach at least one reference'
                : undefined
          }
          onClick={() => void generate()}
        >
          <Sparkles size={12} /> {submitting ? 'SUBMITTING' : 'GENERATE'}
        </button>
      </div>
    </section>
  );
}
