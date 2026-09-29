import { useState } from 'react';
import type { Settings } from '../../shared/domain';
import {
  gpuRoutingDefaults,
  routeComponents,
  routeLabels,
  resolvedRoutes,
} from '../../shared/gpu-routing';
import { checkConnection, useSettings } from '../stores';
import { Field, Section } from './ui';

export function SettingsPanel() {
  const saved = useSettings((state) => state.settings);
  const readiness = useSettings((state) => state.readiness);
  const mock = useSettings((state) => state.mock);
  const [draft, setDraft] = useState<Settings>({
    ...saved,
    gpuRouting: saved.gpuRouting ?? gpuRoutingDefaults,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tools, setTools] = useState<Record<string, string>>({});
  const routing = draft.gpuRouting ?? gpuRoutingDefaults;
  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const settings = await window.oyama.saveSettings(draft);
      useSettings.setState({ settings });
      await checkConnection();
      setTools((await window.oyama.diagnostics()).info);
      setMessage(
        'Settings saved. New jobs use these values; existing jobs keep their submitted settings.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  let summary = '';
  try {
    summary = Object.entries(resolvedRoutes(routing, readiness?.devices ?? []))
      .map(
        ([component, target]) => `${routeLabels[component as keyof typeof routeLabels]}: ${target}`,
      )
      .join(' · ');
  } catch (error) {
    summary = String((error as Error).message);
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="settings-scroll">
        <Section title="ComfyUI engine">
          <Field label="ComfyUI address">
            <input
              className="control"
              type="url"
              aria-label="ComfyUI address"
              value={draft.comfyUrl}
              onChange={(event) => setDraft({ ...draft, comfyUrl: event.target.value })}
            />
          </Field>
          <p className={readiness?.connected ? 'muted' : 'validation'}>
            {readiness?.message ?? 'Not checked'}
            {readiness?.queue
              ? ` · ${readiness.queue.running} running / ${readiness.queue.pending} queued`
              : ''}
          </p>
          <button
            type="button"
            className="smallbtn"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void checkConnection()
                .then(async () => setTools((await window.oyama.diagnostics()).info))
                .catch((error) => setMessage(String(error)))
                .finally(() => setBusy(false));
            }}
          >
            Refresh nodes, models & devices
          </button>
          {mock && (
            <Field label="Mock scenario">
              <select
                className="control"
                value={draft.mockScenario}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    mockScenario: event.target.value as Settings['mockScenario'],
                  })
                }
              >
                <option value="success">Success</option>
                <option value="error">Generation error</option>
                <option value="disconnected">Disconnected</option>
              </select>
            </Field>
          )}
        </Section>
        <Section title="H3 live preview">
          <Field label="Frames per preview">
            <input
              className="control"
              type="number"
              min={1}
              max={32}
              step={1}
              required
              aria-label="Live preview frames"
              value={draft.livePreview.frames}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  livePreview: { ...draft.livePreview, frames: Number(event.target.value) },
                })
              }
            />
          </Field>
          <Field label="Playback speed (FPS)">
            <input
              className="control"
              type="number"
              min={1}
              max={60}
              step={1}
              required
              aria-label="Live preview FPS"
              value={draft.livePreview.fps}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  livePreview: { ...draft.livePreview, fps: Number(event.target.value) },
                })
              }
            />
          </Field>
          <p className="muted">
            H3 and Continue use these for new jobs with live preview enabled. 24 FPS plays at normal
            speed; fewer frames decode faster.
          </p>
        </Section>
        <Section title="GPU routing">
          <Field label="Placement preset">
            <select
              className="control"
              aria-label="GPU routing preset"
              value={routing.preset}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  gpuRouting: { ...routing, preset: event.target.value as typeof routing.preset },
                })
              }
            >
              <option value="auto">Auto · ComfyUI manages devices</option>
              <option value="single" disabled={!readiness?.devices.length}>
                Single GPU · first advertised device
              </option>
              <option value="split" disabled={(readiness?.devices.length ?? 0) < 2}>
                Split · diffusion first, encoders / VAEs second
              </option>
              <option value="custom">Custom placement</option>
            </select>
          </Field>
          {routing.preset === 'custom' &&
            routeComponents.map((component) => {
              const choices = readiness?.routing?.[component] ?? ['auto'];
              return (
                <Field key={component} label={routeLabels[component]}>
                  <select
                    className="control"
                    aria-label={`${routeLabels[component]} device`}
                    value={routing[component]}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        gpuRouting: { ...routing, [component]: event.target.value },
                      })
                    }
                  >
                    {!choices.includes(routing[component]) && (
                      <option value={routing[component]}>{routing[component]} · unavailable</option>
                    )}
                    {choices.map((choice) => (
                      <option key={choice} value={choice}>
                        {choice === 'auto'
                          ? 'Auto'
                          : choice === 'cpu'
                            ? 'CPU'
                            : `${choice} · ${readiness?.devices.find((device) => device.index === Number(choice.slice(4)))?.name ?? 'advertised selector'}`}
                      </option>
                    ))}
                  </select>
                </Field>
              );
            })}
          <p className="muted">{summary}</p>
          <p className="muted">
            Choices come from the connected server's device nodes. Unavailable requested routes fail
            before upload. ComfyUI controls offloading; routing does not combine GPU memory.
          </p>
          {readiness?.devices.map((device) => (
            <p className="muted" key={device.index}>
              GPU {device.index}: {device.name} · {(device.vram_free / 1024 ** 3).toFixed(1)} /{' '}
              {(device.vram_total / 1024 ** 3).toFixed(1)} GiB free / total
            </p>
          ))}
        </Section>
        <Section title="Installed models & media tools">
          <p className="muted">
            {Object.entries(readiness?.models ?? {})
              .map(([kind, names]) => `${kind}: ${names.length}`)
              .join(' · ') || 'Connect to inspect installed models.'}
          </p>
          <p className="muted">
            {tools['Media tools'] ??
              'Save or refresh to check bundled FFmpeg / ffprobe availability.'}
          </p>
          <p className="muted">
            Models stay in ComfyUI's configured folders. Project settings, media and logs use
            managed local storage.
          </p>
          {tools['Data directory'] && <p className="muted">Storage: {tools['Data directory']}</p>}
        </Section>
      </div>
      <p className="muted" role="status">
        {message}
      </p>
      <button className="generate" disabled={busy}>
        {busy ? 'Checking…' : 'Save & test connection'}
      </button>
    </form>
  );
}
