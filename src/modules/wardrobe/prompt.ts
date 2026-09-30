import type { LibraryRecord } from '../../../shared/domain';

/** A reusable catalog sheet prompt; the editable ZImage draft remains the render source. */
export function wardrobePrompt(record: LibraryRecord): string {
  return [
    `Single-image three-view wardrobe reference for ${record.name}.`,
    record.description,
    record.colors && `Colors and pattern: ${record.colors}.`,
    record.materials && `Materials and construction: ${record.materials}.`,
    `${record.visualStyle?.trim() || 'cinematic photorealism'}. Create one uninterrupted wide studio composition with exactly three equally sized full-length headless neutral dress forms in one horizontal row: front, three-quarter front, and back. Show the same complete outfit on each form. Keep every garment, layer, color, pattern, material, fit and item of footwear consistent. Show all footwear. Plain neutral backdrop, level camera, even light, sharp fabric detail. No panels, labels, face, hair, jewelry, accessories, handheld props, extra forms, or logos unless specified.`,
  ]
    .filter(Boolean)
    .join(' ');
}
