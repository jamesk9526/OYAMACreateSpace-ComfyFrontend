export type RippleChunk = {
  index: number;
  startFrame: number;
  sourceFrames: number;
  outputFrames: number;
  overlapFrames: number;
};
export type RippleBatchState = {
  schemaVersion: 1;
  sourceAssetId: string;
  targetFrames: number;
  blend: boolean;
  chunks: RippleChunk[];
};
/** Source-adapted 8n+1 chunks; only the final chunk may extend past the requested source span. */
export function planRippleChunks(
  duration: number,
  chunkSeconds: number,
  overlapSeconds: number,
): RippleChunk[] {
  if (
    !Number.isFinite(duration) ||
    duration < 2 ||
    duration > 300 ||
    !Number.isInteger(chunkSeconds) ||
    chunkSeconds < 2 ||
    chunkSeconds > 20
  )
    throw new Error('Long Ripple supports 2–300 seconds with 2–20 second chunks.');
  const sourceFrames = Math.ceil((chunkSeconds * 24 - 1) / 8) * 8;
  const overlap = Math.round(overlapSeconds * 24);
  if (
    !Number.isFinite(overlapSeconds) ||
    overlapSeconds < 0 ||
    overlapSeconds > 2 ||
    overlap >= sourceFrames / 2
  )
    throw new Error('Overlap must be 0–2 seconds and shorter than half a chunk.');
  const total = Math.round(duration * 24),
    chunks: RippleChunk[] = [];
  for (let startFrame = 0; startFrame < total;) {
    const frames = Math.min(
      sourceFrames,
      Math.max(48, overlap * 2 + 8, Math.ceil((total - startFrame) / 8) * 8),
    );
    chunks.push({
      index: chunks.length,
      startFrame,
      sourceFrames: frames,
      outputFrames: frames + 1,
      overlapFrames: chunks.length ? overlap : 0,
    });
    if (chunks.length > 100)
      throw new Error('This clip needs more than 100 Ripple chunks; increase chunk length.');
    if (startFrame + frames >= total) break;
    startFrame += frames - overlap;
  }
  return chunks;
}
