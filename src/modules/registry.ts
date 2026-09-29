import type { ModuleDefinition } from '../../shared/modules';
import { h3Definition } from './h3/definition';
import { zImageDefinition } from './zimage/definition';
import { ltxDefinition } from './ltx/definition';
import { rippleDefinition } from './ripple/definition';
import { photoEditDefinition } from './photo-edit/definition';
import { continueDefinition } from './continue/definition';

export const generatorDefinitions: Record<string, ModuleDefinition> = {
  h3: h3Definition,
  zimage: zImageDefinition,
  ltx: ltxDefinition,
  ripple: rippleDefinition,
  'photo-edit': photoEditDefinition,
  continue: continueDefinition,
};

export function moduleDefaults(moduleId: string): Record<string, unknown> {
  return { ...(generatorDefinitions[moduleId]?.defaults || {}) };
}
