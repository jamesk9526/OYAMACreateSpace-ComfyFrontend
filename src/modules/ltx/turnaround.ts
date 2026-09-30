import { ltxNegative, type LtxSettings } from './definition';

/** Camera motion only. Generated geometry/pose consistency still needs visual review. */
export function turnaroundConditioning(settings: LtxSettings) {
  return {
    prompt: `${settings.prompt.trim()}\n\nA single continuous studio turntable shot. The camera makes exactly one smooth full 360-degree ${settings.orbitDirection} orbit around the subject, showing front, side, back, opposite side, and returning to the starting front view. The subject remains completely motionless in the exact same pose throughout. No limb, face, clothing or object movement. Preserve identity, proportions, materials and silhouette. Fixed camera height and distance, subject centered and fully in frame, constant scale, even neutral lighting and plain background. No cuts, zoom, tilt, camera shake or other objects. Silent scene.`,
    negative: [
      settings.negative === ltxNegative ? '' : settings.negative,
      'subject animation, walking, gestures, blinking, pose change, deforming geometry, changing proportions, flickering textures, camera cuts, zoom, shake, duplicate subject',
    ]
      .filter(Boolean)
      .join(', '),
  };
}
