import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { recordSchema } from '../shared/domain';
import { wardrobePrompt } from '../src/modules/wardrobe/prompt';

it('keeps a wardrobe bound to an owned character and builds a consistent catalog prompt', () => {
  const record = recordSchema.parse({
    id: randomUUID(),
    kind: 'wardrobe',
    name: 'Travel coat',
    description: 'Long fitted coat and boots',
    assetIds: [],
    characterId: randomUUID(),
    colors: 'olive and black',
    materials: 'waxed cotton',
    visualStyle: 'photoreal',
  });
  const prompt = wardrobePrompt(record);
  expect(prompt).toContain('front, three-quarter front, and back');
  expect(prompt).toContain('waxed cotton');
  expect(prompt).toContain('olive and black');
  expect(prompt).toContain('No panels, labels, face, hair');
  expect(record.characterId).toBeTruthy();
});
