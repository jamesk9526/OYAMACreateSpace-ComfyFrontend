import fs from 'node:fs/promises';
import { openAsBlob } from 'node:fs';

/** Never overwrite a server checkpoint that an earlier prompt may still memory-map. */
export async function stageGenerationContext(
  source: string,
  jobId: string,
  upload: (form: FormData) => Promise<{ name?: string; subfolder?: string }>,
) {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error('Invalid context job ID.');
  const name = `${jobId}.safetensors`;
  const form = new FormData();
  form.append('image', await openAsBlob(source), name);
  form.append('type', 'output');
  form.append('subfolder', 'CreateSpaceContext');
  form.append('overwrite', 'false');
  const input = await upload(form);
  if (input.name !== name || input.subfolder !== 'CreateSpaceContext')
    throw new Error('ComfyUI did not stage the managed H3 context at its expected location.');
  return `CreateSpaceContext/${name}`;
}

export const maxContextBytes = 512 * 1024 ** 2;
/** Validate the bounded safetensors envelope before persisting or uploading a checkpoint. */
export async function validateGenerationContext(file: string) {
  const handle = await fs.open(file, 'r');
  try {
    const { size } = await handle.stat();
    if (size < 10 || size > maxContextBytes)
      throw new Error('H3 context checkpoint has an invalid size.');
    const prefix = Buffer.alloc(8);
    await handle.read(prefix, 0, 8, 0);
    const length = Number(prefix.readBigUInt64LE());
    if (!Number.isSafeInteger(length) || length < 2 || length > 1024 ** 2 || length + 8 >= size)
      throw new Error('H3 context checkpoint has an invalid header.');
    const header = Buffer.alloc(length);
    await handle.read(header, 0, length, 8);
    const tensors = JSON.parse(header.toString('utf8')) as Record<
      string,
      { dtype?: string; shape?: number[]; data_offsets?: number[] }
    >;
    const ranges: number[][] = [];
    for (const [name, dimensions] of [
      ['video', 5],
      ['audio', 4],
    ] as const) {
      const tensor = tensors[name];
      const bytes = { F16: 2, BF16: 2, F32: 4 }[tensor?.dtype || ''];
      const shape = tensor?.shape;
      const offsets = tensor?.data_offsets;
      if (
        !bytes ||
        !shape ||
        shape.length !== dimensions ||
        !shape.every((n) => Number.isSafeInteger(n) && n > 0) ||
        !offsets ||
        offsets.length !== 2 ||
        !offsets.every((n) => Number.isSafeInteger(n) && n >= 0) ||
        offsets[1] > size - length - 8 ||
        offsets[1] - offsets[0] !== shape.reduce((a, b) => a * b, bytes)
      )
        throw new Error(`H3 context checkpoint contains invalid ${name} tensors.`);
      ranges.push(offsets);
    }
    if (ranges[0][0] < ranges[1][1] && ranges[1][0] < ranges[0][1])
      throw new Error('H3 context checkpoint tensor ranges overlap.');
  } finally {
    await handle.close();
  }
}
