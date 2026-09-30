import type { Asset, LibraryRecord } from './domain';

/** Approved media is ordered and bounded; a removed/missing selection falls back to an identity anchor. */
export function activeRecordAssetIds(record: LibraryRecord, assets: readonly Asset[]): string[] {
  const available = record.assetIds
    .map((id) =>
      assets.find((asset) => asset.id === id && !asset.missing && asset.projectId === null),
    )
    .filter((asset): asset is Asset => Boolean(asset));
  if (!available.length) return [];
  if (record.approvedAssetIds === undefined) return available.map((asset) => asset.id);
  const selected = record.approvedAssetIds.filter((id) =>
    available.some((asset) => asset.id === id),
  );
  if (selected.length) return selected;
  const anchor =
    available.find((asset) => asset.id === record.masterAssetId) ??
    available.find((asset) => asset.kind === 'image') ??
    available[0];
  return [anchor.id];
}

export function recordCover(record: LibraryRecord, assets: readonly Asset[]): Asset | undefined {
  const available = record.assetIds
    .map((id) =>
      assets.find(
        (asset) =>
          asset.id === id && asset.kind === 'image' && !asset.missing && asset.projectId === null,
      ),
    )
    .filter((asset): asset is Asset => Boolean(asset));
  return (
    available.find((asset) => asset.id === record.coverAssetId) ??
    available.find((asset) => asset.id === record.masterAssetId) ??
    available.find((asset) => activeRecordAssetIds(record, assets).includes(asset.id)) ??
    available[0]
  );
}

export const turntableAngles = [
  'Front',
  'Front three-quarter',
  'Profile',
  'Back three-quarter',
  'Back',
] as const;

/** Quantize five evenly spaced views to real frame indices, including the first and final frame. */
export function fiveAngleFrames(frames: number, fps: number) {
  if (!Number.isInteger(frames) || frames < 5 || !Number.isFinite(fps) || fps <= 0)
    throw new Error('Turntable needs at least five decoded frames and a known frame rate.');
  return turntableAngles.map((label, index) => {
    const frame = Math.round((index * (frames - 1)) / 4);
    return { label, frame, seconds: frame / fps };
  });
}
