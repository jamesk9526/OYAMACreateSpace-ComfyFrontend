import { expect, it } from 'vitest';
import {
  insertPromptPart,
  promptCategories,
  promptParts,
  promptTrigger,
  searchPromptParts,
} from '../src/components/prompt-parts';

it('recognizes a cursor-local slash query without opening for URLs or selected text', () => {
  expect(promptTrigger('A room. //slow push', 19)).toEqual({
    start: 8,
    end: 19,
    query: 'slow push',
  });
  expect(promptTrigger('//camera\n', 9)).toBeUndefined();
  expect(promptTrigger('https://example.com', 19)).toBeUndefined();
  expect(promptTrigger('A //pan', 7, 3)).toBeUndefined();
  const value = 'Before //rack After';
  const trigger = promptTrigger(value, 13)!;
  const inserted = insertPromptPart(value, trigger, 'Focus shifts.');
  expect(inserted.value).toBe('Before Focus shifts. After');
  expect(inserted.value.slice(inserted.cursor)).toBe(' After');
});
it('searches by words and category across a useful library with unique entries', () => {
  expect(promptCategories).toHaveLength(8);
  expect(promptParts.length).toBeGreaterThanOrEqual(80);
  expect(new Set(promptParts.map((part) => part.id)).size).toBe(promptParts.length);
  expect(searchPromptParts('slow push', 'Camera movement').map((part) => part.title)).toContain(
    'Slow push in',
  );
  expect(searchPromptParts('coast', 'Scene starters').map((part) => part.title)).toContain(
    'Coastal sunrise',
  );
  expect(searchPromptParts('zzzzzz')).toEqual([]);
  expect(searchPromptParts('', 'Lighting').every((part) => part.category === 'Lighting')).toBe(
    true,
  );
});
