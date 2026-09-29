import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { createVersion } = require('../scripts/version.cjs');
it('uses one UTC timestamp and valid increasing Windows components', () => {
  const first = createVersion(new Date('2026-09-26T18:45:30Z'));
  expect(first.version).toBe('2.0.0+20260926.184530');
  expect(first.windowsVersion).toBe('2.0.268.33765');
  expect(createVersion(new Date('2026-09-26T18:45:32Z')).windowsVersion).toBe('2.0.268.33766');
});
