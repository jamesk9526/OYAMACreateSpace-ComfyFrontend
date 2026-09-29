import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

export function byteRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || !size || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start >= size ||
    end < start ||
    (!match[1] && Number(match[2]) === 0)
  )
    return null;
  return { start, end };
}

// The caller resolves a validated asset ID to a managed path. No renderer paths are accepted.
export async function mediaResponse(
  request: Request,
  file: string,
  mime: string,
): Promise<Response> {
  const { size } = await stat(file);
  const headers = new Headers({
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  });
  const requested = request.headers.get('Range');
  const range = requested ? byteRange(requested, size) : { start: 0, end: size - 1 };
  if (!range) {
    headers.set('Content-Range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set('Content-Length', String(size ? range.end - range.start + 1 : 0));
  if (requested) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
  const body =
    request.method === 'HEAD' || !size
      ? null
      : (Readable.toWeb(createReadStream(file, range)) as ReadableStream<Uint8Array>);
  return new Response(body, { status: requested ? 206 : 200, headers });
}
