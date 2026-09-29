import { useEffect, useState } from 'react';
import {
  scriptContinuitySchema,
  validateBeatSources,
  type ContinuationScript,
  type ContinuationScriptInput,
  type ScriptBeatInput,
} from '../../../shared/continuation';
import type { ContinueSettings } from './definition';
import { continueTiming } from './definition';
import { guarded, useJobs, useLibrary, useShell } from '../../stores';
import { Field } from '../../components/ui';
import { PromptInput } from '../../components/PromptInput';

export function ScriptEditor({ settings }: { settings: ContinueSettings }) {
  const projectId = useShell((state) => state.projectId);
  const assets = useLibrary((state) => state.assets);
  const jobs = useJobs((state) => state.jobs);
  const [scripts, setScripts] = useState<ContinuationScript[]>([]);
  const [draft, setDraft] = useState<ContinuationScriptInput>();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const completedSequences = jobs
    .filter((job) => job.sequence?.script.projectId === projectId && job.status === 'complete')
    .map((job) => job.id)
    .join(',');
  useEffect(() => {
    let alive = true;
    setDraft(undefined);
    setDirty(false);
    void guarded(async () => {
      const result = await window.oyama.listContinuationScripts(projectId);
      if (alive) {
        setScripts(result);
        setDraft(result[0]);
      }
    });
    return () => {
      alive = false;
    };
  }, [projectId]);
  useEffect(() => {
    if (!completedSequences || dirty) return;
    let alive = true;
    void window.oyama
      .listContinuationScripts(projectId)
      .then((result) => {
        if (!alive) return;
        setScripts(result);
        setDraft((old) => result.find((item) => item.id === old?.id) ?? old);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [completedSequences, projectId, dirty]);
  const patch = (value: Partial<ContinuationScriptInput>) => {
    setDraft((old) => (old ? { ...old, ...value } : old));
    setDirty(true);
  };
  const updateBeat = (id: string, value: Partial<ScriptBeatInput>) => {
    if (draft)
      patch({ beats: draft.beats.map((beat) => (beat.id === id ? { ...beat, ...value } : beat)) });
  };
  const addBeat = () => {
    if (draft)
      patch({
        beats: [
          ...draft.beats,
          {
            id: crypto.randomUUID(),
            name: `Beat ${draft.beats.length + 1}`,
            prompt: '',
            duration: settings.duration,
            method: 'last',
            selectedSeconds: 0,
            source: { kind: 'previous' },
          },
        ],
      });
  };
  const issues = draft ? validateBeatSources(draft.beats) : [];
  const saved = scripts.find((script) => script.id === draft?.id);
  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await guarded(async () => {
        const result = await window.oyama.saveContinuationScript(draft);
        setScripts((old) => [result, ...old.filter((script) => script.id !== result.id)]);
        setDraft(result);
        setDirty(false);
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="library-workspace script-workspace">
      <div className="workspace-heading">
        <div>
          <h1>Continue scripts</h1>
          <p>
            Plan original, previous and earlier-beat branches. Save plans before leaving this
            workspace.
          </p>
        </div>
        <button
          className="smallbtn"
          disabled={!settings.sourceVideo || dirty || saving}
          onClick={() => {
            setDraft({
              id: crypto.randomUUID(),
              projectId,
              revision: 0,
              name: 'Untitled script',
              sourceVideo: settings.sourceVideo!,
              settings: { ...settings },
              continuity: scriptContinuitySchema.parse({}),
              beats: [
                {
                  id: crypto.randomUUID(),
                  name: 'Beat 1',
                  prompt: settings.prompt,
                  duration: settings.duration,
                  method: settings.method,
                  selectedSeconds: settings.selectedSeconds,
                  source: { kind: 'original' },
                },
              ],
            });
            setDirty(true);
          }}
        >
          New script
        </button>
      </div>
      {!settings.sourceVideo && !draft && (
        <p className="muted">Choose a source video in the Source tab first.</p>
      )}
      <div className="script-toolbar">
        <select
          className="control"
          aria-label="Continue script"
          disabled={dirty || saving}
          value={draft?.id || ''}
          onChange={(event) => setDraft(scripts.find((script) => script.id === event.target.value))}
        >
          <option value="">Choose a saved script</option>
          {scripts.map((script) => (
            <option key={script.id} value={script.id}>
              {script.name} · revision {script.revision}
            </option>
          ))}
        </select>
        <button
          className="smallbtn"
          disabled={!draft || !dirty || saving || issues.length > 0}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save script'}
        </button>
        <span className="muted">
          {dirty ? 'Unsaved changes' : draft ? `Saved · revision ${draft.revision}` : ''}
        </span>
      </div>
      {draft && (
        <>
          <div className="split">
            <Field label="Script name">
              <input
                className="control"
                aria-label="Script name"
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </Field>
            <Field label="Original source">
              <select
                className="control"
                aria-label="Script original source"
                value={draft.sourceVideo}
                onChange={(e) => patch({ sourceVideo: e.target.value })}
              >
                {assets
                  .filter(
                    (asset) =>
                      asset.kind === 'video' &&
                      !asset.missing &&
                      (!asset.projectId || asset.projectId === projectId),
                  )
                  .map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <p className="muted">
            Script canvas {String(draft.settings.width)} × {String(draft.settings.height)} ·{' '}
            {draft.settings.quality === 'native' ? 'Native' : 'Turbo'} ·{' '}
            {draft.settings.inheritContext ? 'inherit scene context' : 'new action only'}.
          </p>
          <div className="script-beat-settings">
            <Field label="Dialogue guidance">
              <select
                className="control"
                aria-label="Script dialogue guidance"
                value={scriptContinuitySchema.parse(draft.continuity).dialoguePolicy}
                onChange={(event) =>
                  patch({
                    continuity: {
                      ...scriptContinuitySchema.parse(draft.continuity),
                      dialoguePolicy: event.target.value as 'inherit' | 'none' | 'allow',
                    },
                  })
                }
              >
                <option value="inherit">Inherit source context</option>
                <option value="none">No new spoken dialogue</option>
                <option value="allow">Allow new dialogue</option>
              </select>
            </Field>
            <Field label="Previous audio">
              <select
                className="control"
                aria-label="Script previous audio"
                value={scriptContinuitySchema.parse(draft.continuity).audioCarry ? 'carry' : 'mute'}
                onChange={(event) =>
                  patch({
                    continuity: {
                      ...scriptContinuitySchema.parse(draft.continuity),
                      audioCarry: event.target.value === 'carry',
                    },
                  })
                }
              >
                <option value="carry">Carry into next beat</option>
                <option value="mute">Silence preceding audio</option>
              </select>
            </Field>
            <Field label="Blend at seam (frames)">
              <input
                className="control"
                aria-label="Script blend frames"
                type="number"
                min={0}
                max={24}
                step={1}
                value={scriptContinuitySchema.parse(draft.continuity).blendFrames}
                onChange={(event) =>
                  patch({
                    continuity: {
                      ...scriptContinuitySchema.parse(draft.continuity),
                      blendFrames: Number(event.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="Motion context frames">
              <select
                className="control"
                aria-label="Script context frames"
                value={Number(draft.settings.contextFrames || 22)}
                onChange={(event) =>
                  patch({
                    settings: {
                      ...draft.settings,
                      contextFrames: Number(event.target.value),
                    },
                  })
                }
              >
                <option value={5}>5 frames</option>
                <option value={22}>22 frames</option>
                <option value={39}>39 frames</option>
              </select>
            </Field>
          </div>
          {issues.map((issue) => (
            <p className="validation" role="alert" key={issue}>
              {issue}
            </p>
          ))}
          <div className="script-beats">
            {draft.beats.map((beat, index) => {
              const result = saved?.beats.find((old) => old.id === beat.id);
              const resultJob = jobs.find((job) => job.id === result?.result?.jobId);
              const sourceBeatId = beat.source.kind === 'beat' ? beat.source.beatId : null;
              const sourceLabel =
                beat.source.kind === 'original'
                  ? 'Original'
                  : beat.source.kind === 'previous'
                    ? 'Previous'
                    : draft.beats.find((item) => item.id === sourceBeatId)?.name ||
                      'Missing source';
              return (
                <article className="script-beat" key={beat.id}>
                  <div className="script-beat-heading">
                    <b>
                      {index + 1}. {beat.name}
                    </b>
                    <span className="muted">
                      {resultJob && ['queued', 'running', 'recovering'].includes(resultJob.status)
                        ? resultJob.message
                        : result?.stale
                          ? 'Stale result'
                          : result?.result
                            ? 'Result saved'
                            : 'Planned'}{' '}
                      ·{' '}
                      {continueTiming(
                        beat.duration,
                        beat.method,
                        Number(draft.settings.contextFrames || 22),
                      ).duration.toFixed(3)}
                      s{` · ${sourceLabel}`}
                    </span>
                    <button
                      className="smallbtn"
                      aria-label={`Move ${beat.name} up`}
                      disabled={index === 0}
                      onClick={() => {
                        const beats = [...draft.beats];
                        [beats[index - 1], beats[index]] = [beats[index], beats[index - 1]];
                        patch({ beats });
                      }}
                    >
                      ↑
                    </button>
                    <button
                      className="smallbtn"
                      aria-label={`Move ${beat.name} down`}
                      disabled={index === draft.beats.length - 1}
                      onClick={() => {
                        const beats = [...draft.beats];
                        [beats[index + 1], beats[index]] = [beats[index], beats[index + 1]];
                        patch({ beats });
                      }}
                    >
                      ↓
                    </button>
                    <button
                      className="smallbtn"
                      aria-label={`Remove ${beat.name}`}
                      disabled={draft.beats.length === 1}
                      onClick={() =>
                        patch({ beats: draft.beats.filter((item) => item.id !== beat.id) })
                      }
                    >
                      Remove
                    </button>
                  </div>
                  {result?.result && (
                    <p className="muted">
                      Saved output: {result.result.deliveredDuration.toFixed(3)}s ·{' '}
                      {result.result.assetIds.length} managed asset(s)
                      {result.stale ? ' · render again to update this lineage' : ''}
                    </p>
                  )}
                  <div className="split">
                    <Field label="Beat name">
                      <input
                        className="control"
                        aria-label={`Beat ${index + 1} name`}
                        value={beat.name}
                        onChange={(e) => updateBeat(beat.id, { name: e.target.value })}
                      />
                    </Field>
                    <Field label="Source">
                      <select
                        className="control"
                        aria-label={`Beat ${index + 1} source`}
                        value={beat.source.kind === 'beat' ? beat.source.beatId : beat.source.kind}
                        onChange={(e) =>
                          updateBeat(beat.id, {
                            source:
                              e.target.value === 'original'
                                ? { kind: 'original' }
                                : e.target.value === 'previous'
                                  ? { kind: 'previous' }
                                  : { kind: 'beat', beatId: e.target.value },
                          })
                        }
                      >
                        <option value="original">Original video</option>
                        <option value="previous">Previous beat (first uses original)</option>
                        {draft.beats.slice(0, index).map((parent) => (
                          <option key={parent.id} value={parent.id}>
                            {parent.name}
                          </option>
                        ))}
                        {beat.source.kind === 'beat' &&
                          !draft.beats
                            .slice(0, index)
                            .some(
                              (parent) =>
                                parent.id ===
                                (beat.source.kind === 'beat' ? beat.source.beatId : ''),
                            ) && (
                            <option value={beat.source.beatId}>
                              Invalid source · choose an earlier beat
                            </option>
                          )}
                      </select>
                    </Field>
                  </div>
                  <PromptInput
                    aria-label={`Beat ${index + 1} action`}
                    onInsert={(prompt) => updateBeat(beat.id, { prompt })}
                    placeholder="Describe this beat's next action…"
                    value={beat.prompt}
                    onChange={(e) => updateBeat(beat.id, { prompt: e.target.value })}
                  />
                  <Field label="Camera direction">
                    <input
                      className="control"
                      aria-label={`Beat ${index + 1} camera direction`}
                      maxLength={1000}
                      placeholder="Optional camera movement or framing"
                      value={beat.camera || ''}
                      onChange={(event) => updateBeat(beat.id, { camera: event.target.value })}
                    />
                  </Field>
                  <div className="script-beat-settings">
                    <Field label="Requested seconds">
                      <input
                        className="control"
                        aria-label={`Beat ${index + 1} duration`}
                        type="number"
                        min={1}
                        max={15}
                        step={0.5}
                        value={beat.duration}
                        onChange={(e) => updateBeat(beat.id, { duration: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Starting frame">
                      <select
                        className="control"
                        aria-label={`Beat ${index + 1} method`}
                        value={beat.method}
                        onChange={(e) =>
                          updateBeat(beat.id, {
                            method: e.target.value as ScriptBeatInput['method'],
                          })
                        }
                      >
                        <option value="last">Last frame</option>
                        <option value="selected">Selected frame</option>
                        <option value="motion">Motion context</option>
                      </select>
                    </Field>
                    {beat.method === 'selected' && (
                      <Field label="Source time (sec)">
                        <input
                          className="control"
                          aria-label={`Beat ${index + 1} selected time`}
                          type="number"
                          min={0}
                          max={300}
                          step={1 / 24}
                          value={beat.selectedSeconds}
                          onChange={(e) =>
                            updateBeat(beat.id, { selectedSeconds: Number(e.target.value) })
                          }
                        />
                      </Field>
                    )}
                  </div>
                  <div className="script-beat-actions">
                    <button
                      className="smallbtn"
                      disabled={dirty || saving || running || issues.length > 0 || !saved}
                      onClick={() =>
                        void guarded(async () => {
                          setRunning(true);
                          try {
                            await window.oyama.runContinuationScript(saved!.id, beat.id);
                          } finally {
                            setRunning(false);
                          }
                          useShell.setState({ inspectorTab: 'Queue' });
                        })
                      }
                    >
                      Render lineage
                    </button>
                    {result?.result?.assetIds[0] && !result.stale && (
                      <button
                        className="smallbtn"
                        onClick={() =>
                          void guarded(() => window.oyama.exportAsset(result.result!.assetIds[0]))
                        }
                      >
                        Export lineage
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <button className="smallbtn" disabled={draft.beats.length >= 64} onClick={addBeat}>
            Add beat
          </button>
        </>
      )}
      <p className="muted">
        Render lineage follows the selected beat’s ancestors in order. Completed beats and their
        joined videos remain available after cancellation or restart.
      </p>
    </section>
  );
}
