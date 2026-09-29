import { expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  validateGenerationContext,
  stageGenerationContext,
} from '../electron/main/generation-context';

it('stages repeated continuations without replacing a memory-mapped source checkpoint', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'oyama-context-stage-'));
  const source = path.join(folder, 'source.safetensors');
  const bytes = Buffer.from('the exact owned checkpoint bytes');
  await fs.writeFile(source, bytes);
  const serverFiles = new Map<string, Buffer>();
  const upload = async (form: FormData) => {
    const file = form.get('image') as File;
    expect(form.get('overwrite')).toBe('false');
    expect(form.get('type')).toBe('output');
    expect(form.get('subfolder')).toBe('CreateSpaceContext');
    if (serverFiles.has(file.name)) throw new Error('Server file remains memory-mapped.');
    serverFiles.set(file.name, Buffer.from(await file.arrayBuffer()));
    return { name: file.name, subfolder: 'CreateSpaceContext' };
  };
  try {
    const first = await stageGenerationContext(
      source,
      '11111111-1111-4111-8111-111111111111',
      upload,
    );
    const second = await stageGenerationContext(
      source,
      '22222222-2222-4222-8222-222222222222',
      upload,
    );
    expect(first).not.toBe(second);
    expect([...serverFiles.values()]).toEqual([bytes, bytes]);
    expect(await fs.readFile(source)).toEqual(bytes);
    await expect(
      stageGenerationContext(source, '33333333-3333-4333-8333-333333333333', async () => ({
        name: '../unowned.safetensors',
        subfolder: 'other',
      })),
    ).rejects.toThrow('expected location');
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});

it('validates both safetensors streams and rejects damaged or overlapping checkpoints', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'oyama-context-test-'));
  const file = path.join(folder, 'context.safetensors');
  const envelope = async (audioStart: number, videoDimensions = 5) => {
    const header = Buffer.from(
      JSON.stringify({
        video: { dtype: 'F16', shape: Array(videoDimensions).fill(1), data_offsets: [0, 2] },
        audio: { dtype: 'F16', shape: [1, 1, 2, 1], data_offsets: [audioStart, audioStart + 4] },
      }),
    );
    const prefix = Buffer.alloc(8);
    prefix.writeBigUInt64LE(BigInt(header.length));
    await fs.writeFile(file, Buffer.concat([prefix, header, Buffer.alloc(6)]));
  };
  try {
    await envelope(2);
    await expect(validateGenerationContext(file)).resolves.toBeUndefined();
    await envelope(0);
    await expect(validateGenerationContext(file)).rejects.toThrow('overlap');
    await envelope(2, 4);
    await expect(validateGenerationContext(file)).rejects.toThrow('video');
    await fs.writeFile(file, Buffer.alloc(20, 255));
    await expect(validateGenerationContext(file)).rejects.toThrow('header');
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});
