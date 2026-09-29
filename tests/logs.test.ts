import { expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppLogger, redactLog } from '../electron/main/logs';
it('redacts secrets and preview bytes in persisted diagnostics', () => {
  expect(
    redactLog('api_key=private https://user:pass@host/a?token=secret data:image/png;base64,AAAA'),
  ).toBe('api_key=[redacted] https://[redacted]@host/a?token=[redacted] [preview media]');
});
it('bounds, rotates and reopens diagnostic history', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oyama-logs-'));
  try {
    const logger = new AppLogger(root);
    for (let i = 0; i < 1100; i++) logger.write('info', 'test', `${i} ${'x'.repeat(2000)}`);
    expect(logger.snapshot()).toHaveLength(1000);
    expect(fs.statSync(logger.filename).size).toBeLessThanOrEqual(1024 * 1024);
    expect(fs.existsSync(logger.filename + '.1')).toBe(true);
    const reopened = new AppLogger(root);
    expect(reopened.snapshot().at(-1)?.message).toMatch(/^1099 /);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
