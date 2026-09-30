import type { LibraryRecord } from '../../../shared/domain';

export function characterMasterPrompt(record: LibraryRecord): string {
  return [
    `Full-body master reference of ${record.name}.`,
    record.description,
    record.identityNotes && `Identity details to preserve: ${record.identityNotes}.`,
    'One person only, facing camera, head to toe visible including footwear. Neutral standing pose, level camera, even studio light, plain seamless background. Keep facial structure, hair, skin, build, proportions and outfit clear. No cropped limbs, extra people, labels, borders, watermark or text.',
  ]
    .filter(Boolean)
    .join(' ');
}

export function characterTurntablePrompt(record: LibraryRecord): string {
  return [
    `The same full-body character ${record.name} rotates smoothly in place from a front view through front three-quarter, profile and back three-quarter to a back view.`,
    record.description,
    record.identityNotes && `Preserve identity: ${record.identityNotes}.`,
    'One uninterrupted studio shot. Keep the face, hair, body proportions, outfit, colors and footwear identical throughout. Locked level camera, neutral backdrop, even lighting, full body visible. No cuts, extra people, costume changes, labels, text or watermark.',
  ]
    .filter(Boolean)
    .join(' ');
}
