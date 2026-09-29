import { aspectRatios, fitResolution, reducedRatio, type Canvas } from '../../shared/resolution';
import { Field, Toggle } from './ui';
import { patchDraft } from '../stores';

export function ResolutionControls({
  moduleId,
  label,
  settings,
  step = 32,
  max = 2048,
}: {
  moduleId: string;
  label: string;
  settings: Canvas & { resolutionLock: Canvas | null };
  step?: number;
  max?: number;
}) {
  const limits = { min: 256, max, step };
  const lock = settings.resolutionLock;
  const ratio = reducedRatio(lock || settings);
  const preset =
    aspectRatios.find(([, w, h]) => ratio.width * h === ratio.height * w)?.[0] || 'custom';
  const patch = (value: Record<string, unknown>) => patchDraft(value, moduleId);
  const choose = (value: string) => {
    const entry = aspectRatios.find(([id]) => id === value);
    if (!entry) return;
    const resolutionLock = { width: entry[1], height: entry[2] };
    patch({
      ...fitResolution(
        resolutionLock,
        resolutionLock.width >= resolutionLock.height ? 'width' : 'height',
        Math.max(settings.width, settings.height),
        limits,
      ),
      resolutionLock,
    });
  };
  return (
    <>
      <div className="split">
        <Field label="Aspect ratio">
          <select
            className="control"
            aria-label={`${label} aspect ratio`}
            value={preset}
            onChange={(e) => choose(e.target.value)}
          >
            <option value="custom">
              Custom · {ratio.width}:{ratio.height}
            </option>
            {aspectRatios.map(([id]) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Orientation">
          <select
            className="control"
            aria-label={`${label} orientation`}
            value={
              settings.width === settings.height
                ? 'square'
                : settings.width > settings.height
                  ? 'landscape'
                  : 'portrait'
            }
            onChange={(e) => {
              if (e.target.value === 'square') {
                choose('1:1');
                return;
              }
              const landscape = e.target.value === 'landscape';
              if (settings.width === settings.height) {
                choose(landscape ? '16:9' : '9:16');
                return;
              }
              if (landscape === settings.width > settings.height) return;
              patch({
                width: settings.height,
                height: settings.width,
                resolutionLock: lock ? { width: lock.height, height: lock.width } : null,
              });
            }}
          >
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
            <option value="square">Square</option>
          </select>
        </Field>
      </div>
      <Toggle
        label="Lock aspect ratio"
        checked={Boolean(lock)}
        onChange={(checked) => {
          const resolutionLock = checked ? reducedRatio(settings) : null;
          patch(
            resolutionLock
              ? {
                  ...fitResolution(resolutionLock, 'width', settings.width, limits),
                  resolutionLock,
                }
              : { resolutionLock },
          );
        }}
      />
      <div className="split">
        {(['width', 'height'] as const).map((axis) => (
          <Field key={axis} label={axis === 'width' ? 'Width' : 'Height'}>
            <input
              className="control"
              aria-label={`${label} ${axis}`}
              type="number"
              min={256}
              max={max}
              step={step}
              value={settings[axis]}
              onChange={(e) => {
                const value = Number(e.target.value);
                patch(lock ? fitResolution(lock, axis, value, limits) : { [axis]: value });
              }}
            />
          </Field>
        ))}
      </div>
      <Field label="Size preset">
        <select
          className="control"
          aria-label={`${label} size preset`}
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            const axis = settings.width >= settings.height ? 'width' : 'height';
            patch(fitResolution(lock || settings, axis, Number(e.target.value), limits));
          }}
        >
          <option value="">
            {settings.width} × {settings.height} · choose size
          </option>
          {[512, 1024, 1536, 2048, ...(max > 2048 ? [3072, 4096] : [])].map((size) => {
            const fitted = fitResolution(
              lock || settings,
              settings.width >= settings.height ? 'width' : 'height',
              size,
              limits,
            );
            return (
              <option key={size} value={size}>
                {size}px target · {fitted.width} × {fitted.height}
              </option>
            );
          })}
        </select>
      </Field>
      <p className="muted">
        {step}px alignment ·{' '}
        {lock ? `locked ${ratio.width}:${ratio.height}` : 'dimensions unlocked'}
        {lock && settings.width * lock.height !== settings.height * lock.width
          ? ' · nearest supported canvas'
          : ''}
      </p>
    </>
  );
}
