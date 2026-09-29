import { ResolutionControls } from '../../components/ResolutionControls';
import { PromptInput } from '../../components/PromptInput';
import { useEffect, useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Field, Section, Toggle } from '../../components/ui';
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
  continueAvailability,
  canReuseContext,
  continueDefaults,
  continueTiming,
  continueSourceRange,
  type ContinueSettings,
} from './definition';
import { rippleSourceDuration } from '../ripple/definition';
import { ScriptEditor } from './ScriptEditor';

function useContinue(): ContinueSettings {
  const projectId = useShell((state) => state.projectId);
  const values = useDrafts((state) => state.drafts[draftKey(projectId, 'continue')]?.values);
  return { ...continueDefaults, ...values } as ContinueSettings;
}
export function ContinueWorkspace() {
  const settings = useContinue();
  const assets = useLibrary((state) => state.assets);
  const tab = useShell((state) => state.composerTab);
  if (tab === 'Script') return <ScriptEditor settings={settings} />;
  return (
    <PreviewPanel
      inputs={[
        { label: 'Source', asset: assets.find((asset) => asset.id === settings.sourceVideo), seekSeconds: settings.method === 'selected' ? settings.selectedSeconds : undefined },
        { label: 'Frame', asset: assets.find((asset) => asset.id === settings.firstFrame) },
      ]}
    />
  );
}
export function ContinueInspector() {
  const [advanced, setAdvanced] = useState(false);
  const settings = useContinue();
  const tab = useShell((state) => state.composerTab);
  const readiness = useSettings((state) => state.readiness);
  const source = useLibrary((state) =>
    state.assets.find((asset) => asset.id === settings.sourceVideo),
  );
  const availability = continueAvailability(readiness, settings.quality, settings.method);
  const timing = continueTiming(settings.duration, settings.method, settings.contextFrames);
  let retainedDuration = rippleSourceDuration(source);
  let rangeError = '';
  if (source?.media?.video) {
    try {
      retainedDuration = continueSourceRange(settings, source).retainedDuration;
    } catch (error) {
      rangeError = (error as Error).message;
    }
  }
  const retainedFrames = Math.round(retainedDuration * 24);
  const blendValid = settings.blendFrames < Math.min(retainedFrames, timing.frames);
  if (tab === 'Script')
    return (
      <Section title="Beat plan">
        <p className="muted">
          Each script owns its original video and saved settings. Edit beats and sources in the
          workspace, then save the script.
        </p>
        <p className="muted">
          Changing a parent invalidates dependent results while retaining their media. Removed or
          forward sources must be repaired before saving.
        </p>
        <p className="muted">
          Use Prompt for a single beat. In Script, render a selected lineage and export its joined
          result.
        </p>
      </Section>
    );
  return (
    <>
      <Section title="Generator">
        <Field label="Module">
          <select className="control" value="continue" onChange={() => {}}>
            <option value="continue">H3 Continue / Extend</option>
          </select>
        </Field>
        <Field label="Continuation method">
          <select
            className="control"
            aria-label="Continue method"
            value={settings.method}
            onChange={(event) =>
              patchDraft({ method: event.target.value, firstFrame: null }, 'continue')
            }
          >
            <option value="last">Last frame</option>
            <option value="selected">Selected frame</option>
            <option
              value="motion"
              disabled={!readiness?.mock && !readiness?.nodes.includes('MiniMaxH3VideoExtender')}
            >
              Motion context
            </option>
          </select>
        </Field>
        {settings.method === 'motion' && (
          <>
            <Field label="Motion context">
              <select
                className="control"
                aria-label="Continue context frames"
                value={settings.contextFrames}
                onChange={(event) =>
                  patchDraft({ contextFrames: Number(event.target.value) }, 'continue')
                }
              >
                <option value={5}>5 frames · 0.208s</option>
                <option value={22}>22 frames · 0.917s</option>
                <option value={39}>39 frames · 1.625s</option>
              </select>
            </Field>
            {advanced && (
              <Field label="Continuity source">
                <select
                  className="control"
                  aria-label="Continue continuity source"
                  value={settings.contextMode}
                  onChange={(event) => patchDraft({ contextMode: event.target.value }, 'continue')}
                >
                  <option value="auto">Auto · prefer saved latents</option>
                  <option value="latent">Saved H3 latents · required</option>
                  <option value="frames">Trailing video frames</option>
                </select>
              </Field>
            )}
            <p className="muted">
              {settings.contextMode !== 'frames' && canReuseContext(settings, source)
                ? 'Reusing trailing H3 video and audio latents from this source.'
                : 'Using trailing frames and audio. Saved latents require an H3 output with matching canvas and enough context frames.'}
            </p>
            {settings.contextMode === 'latent' && !canReuseContext(settings, source) && (
              <p className="validation">
                Choose a compatible H3 output, or use Auto / trailing frames.
              </p>
            )}
            <p className="muted">
              Carry the source tail's motion and audio into the next beat. Only the repeated context
              is removed; original media stays intact.
            </p>
            {source?.media?.video &&
              Math.round(rippleSourceDuration(source) * 24) < settings.contextFrames && (
                <p className="validation">
                  Source is too short for this context. Choose fewer context frames.
                </p>
              )}
          </>
        )}
        {settings.method === 'selected' && (
          <>
            <Field label="Source frame time" note="seconds">
              <input
                className="control"
                aria-label="Continue selected time"
                type="number"
                min={0}
                max={Math.max(
                  0,
                  rippleSourceDuration(source) - 1 / (source?.media?.video?.fps || 24),
                )}
                step={1 / (source?.media?.video?.fps || 24)}
                value={settings.selectedSeconds}
                onChange={(event) =>
                  patchDraft(
                    { selectedSeconds: Number(event.target.value), firstFrame: null },
                    'continue',
                  )
                }
              />
            </Field>
            <button
              className="smallbtn"
              disabled={!source?.media?.video}
              onClick={() => {
                const video = document.querySelector<HTMLVideoElement>('.preview video');
                if (video && source && video.getAttribute('src') === source.url)
                  patchDraft(
                    {
                      selectedSeconds: Math.min(
                        video.currentTime,
                        Math.max(
                          0,
                          rippleSourceDuration(source) - 1 / (source.media?.video?.fps || 24),
                        ),
                      ),
                      firstFrame: null,
                    },
                    'continue',
                  );
              }}
            >
              Use source playhead
            </button>
            <p className={rangeError ? 'validation' : 'muted'}>
              {rangeError ||
                `Retain source through this frame (${retainedDuration.toFixed(3)}s), then append the new beat. Source remains intact.`}
            </p>
          </>
        )}
        <Field label="Quality">
          <select
            className="control"
            aria-label="Continue quality"
            value={settings.quality}
            onChange={(event) => patchDraft({ quality: event.target.value }, 'continue')}
          >
            <option value="turbo8">Turbo 8</option>
            <option value="native">Native Quality</option>
          </select>
        </Field>
        <p className={availability.ready ? 'muted' : 'validation'}>{availability.message}</p>
        {advanced && (
          <Toggle
            label="Use profile step defaults"
            checked={settings.nativeDefaults}
            onChange={(nativeDefaults) => patchDraft({ nativeDefaults }, 'continue')}
          />
        )}
        {advanced && (
          <Field
            label="Sampling steps"
            note={String(
              settings.nativeDefaults ? (settings.quality === 'turbo8' ? 8 : 30) : settings.steps,
            )}
          >
            <input
              className="control"
              type="number"
              min={1}
              max={100}
              aria-label="Continue sampling steps"
              disabled={settings.nativeDefaults}
              value={
                settings.nativeDefaults ? (settings.quality === 'turbo8' ? 8 : 30) : settings.steps
              }
              onChange={(event) => patchDraft({ steps: Number(event.target.value) }, 'continue')}
            />
          </Field>
        )}
        {!settings.nativeDefaults && (
          <p className="muted">
            Custom steps retain the selected model and sampling recipe. Turbo is tuned for 8 steps.
          </p>
        )}
      </Section>
      <Section title="Output">
        <ResolutionControls moduleId="continue" label="Continue" settings={settings} />
        <Field label="Next beat duration" note={`${settings.duration}s requested`}>
          <input
            className="range"
            aria-label="Continue duration"
            type="range"
            min={1}
            max={15}
            step={0.5}
            value={settings.duration}
            onChange={(event) => patchDraft({ duration: Number(event.target.value) }, 'continue')}
          />
        </Field>
        <p className="muted">
          {timing.frames} new frames · 24 FPS · {timing.duration.toFixed(3)}s delivered
        </p>
        <p className="muted">
          Source: {source?.name || 'Choose a source'} · {retainedFrames} retained frames
          {settings.method === 'selected' ? ` through ${settings.selectedSeconds.toFixed(3)}s` : ''}
        </p>
        {settings.method === 'motion' && (
          <p className="muted">
            {timing.frames + timing.trimFrames} sampled frames · {timing.trimFrames} repeated
            context frames trimmed from video and audio.
          </p>
        )}
        <p className="muted">
          Joined video ≈{' '}
          {(retainedDuration + timing.duration - settings.blendFrames / 24).toFixed(3)}s ·{' '}
          {retainedFrames + timing.frames - settings.blendFrames} frames. H3 uses a 17n+5 frame
          grid; generated head frames are retained.
        </p>
        <p className="muted">
          Both clips are fitted to this canvas at 24 FPS. Source audio is
          {settings.audioCarry ? ' carried' : ' muted'}; silent spans are padded.
        </p>
      </Section>
      <Section title="Continuity">
        <Field label="Dialogue guidance">
          <select
            className="control"
            aria-label="Continue dialogue guidance"
            value={settings.dialoguePolicy}
            onChange={(event) => patchDraft({ dialoguePolicy: event.target.value }, 'continue')}
          >
            <option value="inherit">Follow source context</option>
            <option value="none">No spoken dialogue</option>
            <option value="allow">Allow new dialogue</option>
          </select>
        </Field>
        <Toggle
          label="Carry source audio"
          checked={settings.audioCarry}
          onChange={(audioCarry) => patchDraft({ audioCarry }, 'continue')}
        />
        <Field
          label="Blend at seam"
          note={`${settings.blendFrames} frames · ${(settings.blendFrames / 24).toFixed(3)}s`}
        >
          <input
            className="control"
            aria-label="Continue blend frames"
            type="number"
            min={0}
            max={Math.min(
              24,
              Math.max(0, Math.round(retainedDuration * 24) - 1),
              timing.frames - 1,
            )}
            step={1}
            value={settings.blendFrames}
            onChange={(event) =>
              patchDraft({ blendFrames: Number(event.target.value) }, 'continue')
            }
          />
        </Field>
        <p className="muted">
          The source and new beat overlap at the seam. Video and audio crossfade; total duration
          decreases by the overlap.
        </p>
        {!blendValid && (
          <p className="validation">
            Blend overlap must be shorter than both the retained source and the new beat.
          </p>
        )}
        <p className="muted">
          Dialogue is guidance for the generated beat. Source audio carry controls the retained
          segment in the joined result.
        </p>
      </Section>
      <Section title="Generation">
        <Toggle
          label="Live sampling preview"
          checked={settings.livePreview}
          onChange={(livePreview) => patchDraft({ livePreview }, 'continue')}
        />
        <p className="muted">
          {readiness?.nodes.includes('MiniMaxH3LivePreview')
            ? 'Animated H3 preview during sampling.'
            : 'Live previews require MiniMaxH3LivePreview on ComfyUI.'}
        </p>
        <Toggle label="Advanced parameters" checked={advanced} onChange={setAdvanced} />
        {advanced && (
          <Field label="Seed">
            <input
              className="control"
              aria-label="Continue seed"
              value={settings.seed}
              onChange={(event) => patchDraft({ seed: event.target.value }, 'continue')}
            />
          </Field>
        )}
        <p className="muted">
          res_multistep · simple · BasicGuider ·{' '}
          {settings.quality === 'native' ? '30 steps' : '8 steps · Turbo LoRA'}. Original source and
          generated beat remain available in Assets.
        </p>
      </Section>
    </>
  );
}
export function ContinueComposer() {
  const settings = useContinue();
  const projectId = useShell((state) => state.projectId);
  const tab = useShell((state) => state.composerTab);
  const assets = useLibrary((state) => state.assets);
  const source = assets.find((asset) => asset.id === settings.sourceVideo);
  const jobs = useJobs((state) => state.jobs);
  const sourceJob = jobs.find(
    (job) => job.status === 'complete' && job.assetIds.includes(settings.sourceVideo || ''),
  );
  const readiness = useSettings((state) => state.readiness);
  const availability = continueAvailability(readiness, settings.quality, settings.method);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (!source || source.media || source.missing) return;
    void guarded(async () => {
      await window.oyama.probeAsset(source.id);
      await refreshLibrary();
    });
  }, [source?.id, source?.media, source?.missing]);
  const canGenerate =
    availability.ready &&
    Boolean(source && !source.missing && source.media?.video && settings.prompt.trim()) &&
    (settings.method !== 'motion' ||
      (Math.round(rippleSourceDuration(source) * 24) >= settings.contextFrames &&
        (settings.contextMode !== 'latent' || canReuseContext(settings, source)))) &&
    (settings.method !== 'selected' ||
      settings.selectedSeconds <=
        Math.max(0, rippleSourceDuration(source) - 1 / (source?.media?.video?.fps || 24)));
  const generate = async () => {
    setSubmitting(true);
    try {
      await guarded(async () => {
        const job = await window.oyama.generate(draftFor(projectId, 'continue'));
        useJobs.setState((state) => ({
          jobs: [job, ...state.jobs.filter((item) => item.id !== job.id)],
        }));
        const data = await window.oyama.load();
        const prepared = data.drafts.find(
          (draft) => draft.projectId === projectId && draft.moduleId === 'continue',
        );
        if (prepared)
          useDrafts.setState((state) => ({
            drafts: { ...state.drafts, [draftKey(projectId, 'continue')]: prepared },
          }));
        await refreshLibrary();
        useShell.setState({ inspectorTab: 'Queue' });
      });
    } finally {
      setSubmitting(false);
    }
  };
  const visibleTab = ['Prompt', 'Source', 'Context', 'Script'].includes(tab) ? tab : 'Prompt';
  return (
    <section className="composer">
      <div className="composer-tabs">
        {['Prompt', 'Source', 'Context', 'Script'].map((item) => (
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
        {visibleTab === 'Script' ? (
          <div className="reference-editor">
            <p className="muted">
              Edit and save your beat plan above, then render the selected beat’s lineage. Use Queue
              to follow or resume it.
            </p>
          </div>
        ) : visibleTab === 'Source' ? (
          <div className="reference-editor">
            <Field label="Source video">
              <select
                className="control"
                aria-label="Continue source video"
                value={settings.sourceVideo || ''}
                onChange={(event) =>
                  patchDraft(
                    {
                      sourceVideo: event.target.value || null,
                      firstFrame: null,
                      selectedSeconds: 0,
                    },
                    'continue',
                  )
                }
              >
                <option value="">Choose a video</option>
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
            <button
              className="smallbtn"
              onClick={() =>
                void guarded(async () => {
                  await window.oyama.importMedia({ projectId });
                  await refreshLibrary();
                })
              }
            >
              <Plus size={12} /> Import video
            </button>
            <p className="muted">
              {settings.method === 'motion'
                ? 'Trailing motion and audio context is prepared on submission.'
                : `The ${settings.method === 'last' ? 'last' : 'selected'} decoded frame is extracted on submission.`}{' '}
              Source video remains intact.
            </p>
          </div>
        ) : visibleTab === 'Context' ? (
          <div className="reference-editor">
            <label className="check">
              <input
                type="checkbox"
                aria-label="Inherit source context"
                checked={settings.inheritContext}
                onChange={(event) =>
                  patchDraft({ inheritContext: event.target.checked }, 'continue')
                }
              />{' '}
              Inherit source scene prompt
            </label>
            <p className="muted">
              {sourceJob
                ? String(sourceJob.snapshot.prompt || 'Source job has no prompt.')
                : 'Imported videos have no generation prompt. Describe continuity in the next action.'}
            </p>
          </div>
        ) : (
          <PromptInput
            aria-label="Continue next action"
            onInsert={(prompt) => patchDraft({ prompt }, 'continue')}
            placeholder="Describe the next action, camera movement, dialogue and details to preserve..."
            value={settings.prompt}
            onChange={(event) => patchDraft({ prompt: event.target.value }, 'continue')}
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
          {settings.width} × {settings.height} · +
          {continueTiming(
            settings.duration,
            settings.method,
            settings.contextFrames,
          ).duration.toFixed(3)}
          s · 24 FPS
        </span>
        <button className="smallbtn" onClick={() => useShell.setState({ composerTab: 'Source' })}>
          Choose source
        </button>
        <button
          className="generate"
          disabled={!canGenerate || submitting || visibleTab === 'Script'}
          title={availability.message}
          onClick={() => void generate()}
        >
          <Sparkles size={12} /> {submitting ? 'PREPARING' : 'CONTINUE VIDEO'}
        </button>
      </div>
    </section>
  );
}
