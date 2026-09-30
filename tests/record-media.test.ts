import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Asset, LibraryRecord } from '../shared/domain';
import { activeRecordAssetIds, fiveAngleFrames, recordCover } from '../shared/record-media';

it('uses approved identity images and falls back to the master when a selection goes stale', () => {
  const master = randomUUID();
  const angle = randomUUID();
  const asset = (id: string, missing = false): Asset => ({
    id,
    projectId: null,
    name: `${id}.png`,
    kind: 'image',
    mime: 'image/png',
    url: `oyama://media/${id}`,
    createdAt: '',
    missing,
  });
  const record: LibraryRecord = {
    id: randomUUID(),
    kind: 'character',
    name: 'Mara',
    description: '',
    assetIds: [master, angle],
    masterAssetId: master,
    approvedAssetIds: [angle],
  };
  expect(activeRecordAssetIds(record, [asset(master), asset(angle)])).toEqual([angle]);
  expect(activeRecordAssetIds(record, [asset(master), asset(angle, true)])).toEqual([master]);
  expect(activeRecordAssetIds(record, [asset(master, true), asset(angle, true)])).toEqual([]);
});

it('samples five distinct real frames including the first and last', () => {
  expect(fiveAngleFrames(39, 24).map((sample) => sample.frame)).toEqual([0, 10, 19, 29, 38]);
  expect(fiveAngleFrames(39, 24)[4].seconds).toBeCloseTo(38 / 24);
  expect(() => fiveAngleFrames(4, 24)).toThrow('at least five');
});

it('uses an explicit valid cover, then master, then approved image and skips missing media', () => {
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const assets: Asset[] = ids.map((id) => ({
    id,
    projectId: null,
    name: id,
    kind: 'image',
    mime: 'image/png',
    url: `oyama://media/${id}`,
    createdAt: '',
  }));
  const record: LibraryRecord = {
    id: randomUUID(),
    kind: 'character',
    name: 'Mara',
    description: '',
    assetIds: ids,
    masterAssetId: ids[1],
    approvedAssetIds: [ids[2]],
    coverAssetId: ids[0],
  };
  expect(recordCover(record, assets)?.id).toBe(ids[0]);
  expect(recordCover({ ...record, coverAssetId: null }, assets)?.id).toBe(ids[1]);
  expect(recordCover({ ...record, coverAssetId: null, masterAssetId: null }, assets)?.id).toBe(
    ids[2],
  );
  expect(
    recordCover(
      record,
      assets.map((asset) => ({ ...asset, missing: true })),
    ),
  ).toBeUndefined();
});
