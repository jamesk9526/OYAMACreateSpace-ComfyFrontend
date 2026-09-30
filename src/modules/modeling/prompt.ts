import type { ModelingSettings } from './definition';
export function modelingImagePrompt(
  s: Pick<ModelingSettings, 'mode' | 'look' | 'description'>,
): string {
  return [
    s.description.trim(),
    s.look === 'realistic'
      ? 'Realistic game art reference, physically plausible materials, detailed surface finish.'
      : 'Stylized animated game art reference, clear shapes, expressive design, clean colors.',
    s.mode === 'character'
      ? 'One complete character, full body head to feet, neutral A-pose, arms apart, unobstructed hands and feet, front view.'
      : 'One complete standalone game prop, centered, unobstructed silhouette, clear three-quarter view.',
    'Single subject only, isolated against a plain background, soft even studio lighting, no text, no collage, no cropped parts.',
  ]
    .filter(Boolean)
    .join('\n');
}
