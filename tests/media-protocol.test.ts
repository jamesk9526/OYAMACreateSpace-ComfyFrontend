import { describe, expect, it } from 'vitest';
import { byteRange, mediaResponse } from '../electron/main/media-protocol';
import path from 'node:path';
describe('managed media range requests', () => {
  it('bounds single byte ranges and rejects malformed, multiple or unsatisfiable ranges', () => {
    expect(byteRange('bytes=0-99', 20)).toEqual({ start: 0, end: 19 });
    expect(byteRange('bytes=5-', 20)).toEqual({ start: 5, end: 19 });
    expect(byteRange('bytes=-5', 20)).toEqual({ start: 15, end: 19 });
    for (const header of [
      'bytes=20-',
      'bytes=9-2',
      'bytes=-0',
      'bytes=-',
      'bytes=0-1,4-5',
      'bytes=999999999999999999999-',
    ])
      expect(byteRange(header, 20)).toBeNull();
  });
  it('streams only the requested bytes and gives HEAD and invalid-range metadata', async () => {
    const file = path.resolve('public/mock/sample.mp4');
    const request = new Request('https://media.invalid/asset', {
      headers: { Range: 'bytes=2-11' },
    });
    const response = await mediaResponse(request, file, 'video/mp4');
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toMatch(/^bytes 2-11\/\d+$/);
    expect((await response.arrayBuffer()).byteLength).toBe(10);
    const head = await mediaResponse(new Request(request, { method: 'HEAD' }), file, 'video/mp4');
    expect(head.headers.get('Content-Length')).toBe('10');
    expect((await head.arrayBuffer()).byteLength).toBe(0);
    expect(
      (
        await mediaResponse(
          new Request('https://media.invalid', { headers: { Range: 'bytes=999999999-' } }),
          file,
          'video/mp4',
        )
      ).status,
    ).toBe(416);
  });
});
