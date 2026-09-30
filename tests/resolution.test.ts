import { expect, it } from 'vitest';
import { aspectRatios, fitResolution } from '../shared/resolution';
import { generatorDefinitions } from '../src/modules/registry';

it('keeps all presets exact and within model alignment and bounds', () => {
  for (const step of [32, 64])
    for (const [, width, height] of aspectRatios)
      for (const axis of ['width', 'height'] as const)
        for (const target of [0, 256, 832, 1024, 99999]) {
          const result = fitResolution({ width, height }, axis, target, {
            min: 256,
            max: 2048,
            step,
          });
          expect(result.width * height).toBe(result.height * width);
          for (const dimension of Object.values(result)) {
            expect(dimension % step).toBe(0);
            expect(dimension).toBeGreaterThanOrEqual(256);
            expect(dimension).toBeLessThanOrEqual(2048);
          }
        }
});
it('edits either locked axis and loads old drafts unlocked in every generator', () => {
  expect(
    fitResolution({ width: 16, height: 9 }, 'width', 1024, { min: 256, max: 2048, step: 32 }),
  ).toEqual({ width: 1024, height: 576 });
  expect(
    fitResolution({ width: 9, height: 16 }, 'height', 1024, { min: 256, max: 2048, step: 64 }),
  ).toEqual({ width: 576, height: 1024 });
  for (const definition of Object.values(generatorDefinitions)) {
    // Only raster/video generators expose editable output dimensions.
    if (!Object.hasOwn(definition.defaults || {}, 'width')) continue;
    const result = definition.settingsSchema!.parse({}) as { resolutionLock: unknown };
    expect(result.resolutionLock).toBeNull();
  }
});
