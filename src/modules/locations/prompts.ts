import type { LibraryRecord } from '../../../shared/domain';

export function locationReferencePrompt(record: LibraryRecord): string {
  return [
    `Wide establishing reference image of ${record.name}.`,
    record.description,
    record.environment && `Environment: ${record.environment}.`,
    record.timeOfDay && `Time of day: ${record.timeOfDay}.`,
    record.lighting && `Lighting: ${record.lighting}.`,
    record.atmosphere && `Atmosphere: ${record.atmosphere}.`,
    record.accuracyNotes && `Preserve these landmarks and details: ${record.accuracyNotes}.`,
    'One coherent environment with a clear spatial layout, no people, labels, text or watermark.',
  ]
    .filter(Boolean)
    .join(' ');
}
