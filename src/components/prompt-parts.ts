export type PromptPart = { id: string; category: string; title: string; text: string };
const groups: Record<string, [string, string][]> = {
  'Camera movement': [
    ['Slow push in', 'The camera slowly pushes toward the subject, maintaining steady focus.'],
    [
      'Gentle pull back',
      'The camera gently pulls back, gradually revealing the surrounding environment.',
    ],
    [
      'Track alongside',
      'A smooth tracking shot follows alongside the subject at a constant distance.',
    ],
    ['Follow from behind', 'The camera follows behind the subject with smooth, measured movement.'],
    [
      'Orbit the subject',
      'The camera slowly orbits the subject, keeping them centered in the frame.',
    ],
    ['Pan left', 'The camera pans slowly to the left, revealing the scene with a level horizon.'],
    ['Pan right', 'The camera pans slowly to the right, revealing the scene with a level horizon.'],
    ['Tilt up', 'The camera tilts upward from the foreground to reveal the subject and skyline.'],
    ['Tilt down', 'The camera tilts gently down toward the subject and foreground details.'],
    [
      'Crane reveal',
      'A smooth rising crane shot reveals the scale of the surrounding environment.',
    ],
    ['Low dolly', 'A low, smooth dolly shot glides past foreground details toward the subject.'],
    [
      'Handheld observation',
      'Subtle handheld camera movement gives the scene an intimate, observational feel.',
    ],
    [
      'Locked camera',
      'The camera remains locked in place while the subject moves naturally within the frame.',
    ],
    [
      'Rack focus',
      'Focus shifts gradually from the foreground detail to the subject in the background.',
    ],
    [
      'Through the doorway',
      'The camera glides through a doorway, revealing the subject in the room beyond.',
    ],
  ],
  'Shot framing': [
    [
      'Wide establishing shot',
      'A wide establishing shot introduces the setting and the subject within it.',
    ],
    [
      'Medium shot',
      'A medium shot frames the subject from the waist up, with clear gestures and surroundings.',
    ],
    [
      'Close-up',
      'A close-up emphasizes the subject’s expression, with a softly blurred background.',
    ],
    [
      'Extreme detail',
      'An extreme close-up reveals fine texture, small movements, and intricate surface details.',
    ],
    [
      'Over the shoulder',
      'An over-the-shoulder composition shows the subject looking toward the scene ahead.',
    ],
    [
      'Low angle',
      'A low-angle composition gives the subject a strong presence against the environment.',
    ],
    [
      'Eye level',
      'An eye-level composition presents the subject naturally with balanced perspective.',
    ],
    [
      'Top down',
      'A top-down composition arranges the subject and surrounding objects into a clear visual pattern.',
    ],
    [
      'Symmetrical frame',
      'A symmetrical composition places the subject centrally between balanced architectural lines.',
    ],
    [
      'Foreground layers',
      'Soft foreground elements frame the subject and create depth in the scene.',
    ],
  ],
  'Scene starters': [
    [
      'Quiet morning interior',
      'Early morning light enters a quiet room as the subject begins an ordinary daily ritual.',
    ],
    [
      'Rainy city evening',
      'On a rain-soaked city street at dusk, reflections shimmer beneath passing footsteps.',
    ],
    [
      'Forest clearing',
      'In a secluded forest clearing, filtered sunlight moves across leaves and soft ground.',
    ],
    [
      'Coastal sunrise',
      'At sunrise on a quiet coast, gentle waves roll toward the shore beneath a pale sky.',
    ],
    [
      'Desert journey',
      'Across a vast desert landscape, the subject moves beneath a clear sky and distant dunes.',
    ],
    [
      'Mountain overlook',
      'At a mountain overlook, the subject pauses before layered ridgelines and drifting clouds.',
    ],
    [
      'Cafe conversation',
      'In a small cafe, the subjects share a quiet moment amid warm light and everyday activity.',
    ],
    [
      'Workshop detail',
      'Inside a practical workshop, careful hands work on a small object surrounded by familiar tools.',
    ],
    [
      'Night market',
      'A lively night market surrounds the subject with illuminated stalls, steam, and passing visitors.',
    ],
    [
      'Empty station',
      'In a nearly empty station, the subject waits beneath cool lights as the distant platform recedes.',
    ],
    [
      'Garden moment',
      'In a peaceful garden, the subject moves among flowers while leaves stir in a light breeze.',
    ],
    [
      'Studio product reveal',
      'On a clean studio surface, the object is revealed gradually against a simple background.',
    ],
    [
      'Kitchen ritual',
      'In a welcoming kitchen, the subject prepares a simple meal with deliberate, familiar movements.',
    ],
    [
      'Library discovery',
      'Between tall library shelves, the subject discovers an object of interest and pauses to examine it.',
    ],
    [
      'Snowy exterior',
      'In a quiet snow-covered landscape, small movements and visible breath bring the scene to life.',
    ],
  ],
  Lighting: [
    [
      'Soft window light',
      'Soft window light wraps around the subject with gentle shadows and natural skin tones.',
    ],
    [
      'Golden hour',
      'Warm golden-hour sunlight creates long shadows and soft highlights along the subject’s edges.',
    ],
    [
      'Overcast daylight',
      'Diffused overcast daylight gives the scene even illumination and restrained contrast.',
    ],
    [
      'Practical lamps',
      'Warm practical lamps illuminate the room, with believable falloff into the surrounding shadows.',
    ],
    [
      'Cool moonlight',
      'Cool moonlight softly outlines the subject against a subdued night environment.',
    ],
    [
      'Rim light',
      'A subtle rim light separates the subject from the background without overpowering the scene.',
    ],
    [
      'Neon reflections',
      'Colored neon reflections play across nearby surfaces while the subject remains clearly visible.',
    ],
    [
      'Soft studio light',
      'Large soft studio lights reveal the subject’s form and texture with controlled reflections.',
    ],
    [
      'Dappled sunlight',
      'Dappled sunlight filters through foliage, creating gentle shifting patterns across the scene.',
    ],
    [
      'Candlelit room',
      'Candlelight creates warm, gently flickering highlights and deep, intimate shadows.',
    ],
  ],
  'Subject motion': [
    [
      'Natural walk',
      'The subject walks at a relaxed pace, with natural weight shifts and consistent direction.',
    ],
    [
      'Look and react',
      'The subject notices something off-screen, turns their gaze, and reacts with a subtle expression.',
    ],
    [
      'Careful hand action',
      'The subject performs a careful hand movement, maintaining clear contact with the object.',
    ],
    [
      'Pause and breathe',
      'The subject pauses, breathes naturally, and makes small, believable posture adjustments.',
    ],
    [
      'Turn toward camera',
      'The subject turns gradually toward the camera, keeping their appearance consistent throughout.',
    ],
    [
      'Gentle object rotation',
      'The object rotates slowly, revealing its shape, texture, and reflections from different angles.',
    ],
    [
      'Wind in fabric',
      'A light breeze moves loose fabric and hair while the subject remains steady.',
    ],
    [
      'Sit down',
      'The subject lowers into a seated position with natural balance and believable body movement.',
    ],
    [
      'Reach and lift',
      'The subject reaches for the object, grips it securely, and lifts it with believable weight.',
    ],
    [
      'Background activity',
      'Subtle background activity continues independently while the main subject remains the focus.',
    ],
  ],
  'Audio and dialogue': [
    [
      'Quiet room ambience',
      'Quiet room ambience accompanies the scene, with subtle movement sounds and no speech.',
    ],
    [
      'Outdoor atmosphere',
      'Natural outdoor ambience includes a light breeze and distant environmental sounds.',
    ],
    [
      'City atmosphere',
      'Distant traffic and soft pedestrian activity create a restrained city soundscape.',
    ],
    [
      'Ocean sound',
      'Gentle surf and a light coastal breeze accompany the scene without music or dialogue.',
    ],
    ['Rain sound', 'Soft rainfall and occasional droplets on nearby surfaces accompany the scene.'],
    [
      'Footsteps',
      'Footsteps remain synchronized with the subject’s movement and the surface underfoot.',
    ],
    [
      'Object handling',
      'Subtle contact and handling sounds match the visible interaction with the object.',
    ],
    [
      'Single speaker',
      'One visible speaker delivers the written dialogue naturally; other subjects remain silent.',
    ],
    ['No music', 'Use environmental sound only, with no background music.'],
    [
      'Gentle instrumental',
      'A restrained instrumental underscore supports the scene beneath its environmental sounds.',
    ],
  ],
  'Style and texture': [
    [
      'Natural realism',
      'Natural proportions, believable materials, and restrained color produce a realistic scene.',
    ],
    [
      'Documentary feel',
      'An observational documentary feel emphasizes ordinary details and unforced behavior.',
    ],
    [
      'Soft film texture',
      'Subtle film grain, gentle highlight rolloff, and restrained contrast shape the image.',
    ],
    [
      'Clean product photography',
      'Precise edges, readable materials, and controlled reflections emphasize the product.',
    ],
    [
      'Rich material detail',
      'Fine surface texture and small imperfections make the materials feel tactile.',
    ],
    [
      'Muted palette',
      'A restrained, muted color palette maintains a calm and cohesive atmosphere.',
    ],
    ['Warm palette', 'Warm earth tones and soft highlights give the scene a welcoming atmosphere.'],
    [
      'Graphic composition',
      'Clear silhouettes, intentional negative space, and simple forms guide the composition.',
    ],
  ],
  'Continuity and editing': [
    [
      'Preserve identity',
      'Preserve the subject’s facial features, hairstyle, clothing, and distinctive details throughout the shot.',
    ],
    [
      'Preserve environment',
      'Keep the layout, background objects, lighting direction, and time of day consistent.',
    ],
    [
      'Continue the action',
      'Continue the source action smoothly, preserving movement direction, pace, and camera position.',
    ],
    [
      'Change only the target',
      'Apply the requested change only to the specified subject or object; preserve surrounding details.',
    ],
    [
      'Consistent object',
      'Maintain the object’s geometry, materials, markings, and scale throughout its movement.',
    ],
    [
      'Single continuous shot',
      'Present the action as a single continuous shot with no cuts or abrupt transitions.',
    ],
    [
      'Stable background',
      'Keep stationary background elements stable as the camera and subject move.',
    ],
    [
      'No text overlays',
      'Keep the image free of captions, watermarks, logos, and other text overlays.',
    ],
  ],
};
export const promptParts: PromptPart[] = Object.entries(groups).flatMap(
  ([category, parts], group) =>
    parts.map(([title, text], index) => ({ id: `${group}-${index}`, category, title, text })),
);
export const promptCategories = Object.keys(groups);
export type PromptTrigger = { start: number; end: number; query: string };
export function promptTrigger(
  value: string,
  start: number,
  end = start,
): PromptTrigger | undefined {
  if (start !== end) return;
  const match = /(?:^|\s)(\/\/([^/\n]{0,80}))$/.exec(value.slice(0, start));
  if (!match) return;
  return { start: start - match[1].length, end: start, query: match[2].trim() };
}
export function searchPromptParts(query: string, category = 'All'): PromptPart[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return promptParts.filter(
    (part) =>
      (category === 'All' || part.category === category) &&
      words.every((word) =>
        `${part.title} ${part.category} ${part.text}`.toLocaleLowerCase().includes(word),
      ),
  );
}
export function insertPromptPart(value: string, trigger: PromptTrigger, text: string) {
  const suffix = value.slice(trigger.end);
  const inserted = text + (suffix.startsWith(' ') || suffix.startsWith('\n') ? '' : ' ');
  return {
    value: value.slice(0, trigger.start) + inserted + suffix,
    cursor: trigger.start + inserted.length,
  };
}
