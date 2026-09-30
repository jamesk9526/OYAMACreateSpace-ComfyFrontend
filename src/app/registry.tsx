import type { ComponentType } from 'react';
import type { ModuleDefinition } from '../../shared/modules';
import { h3Definition } from '../modules/h3/definition';
import { H3Composer, H3Inspector } from '../modules/h3/ui';
import { zImageDefinition } from '../modules/zimage/definition';
import { ZImageComposer, ZImageInspector } from '../modules/zimage/ui';
import { ltxDefinition } from '../modules/ltx/definition';
import { LtxComposer, LtxInspector } from '../modules/ltx/ui';
import { rippleDefinition } from '../modules/ripple/definition';
import { RippleComposer, RippleInspector, RippleWorkspace } from '../modules/ripple/ui';
import { photoEditDefinition } from '../modules/photo-edit/definition';
import { continueDefinition } from '../modules/continue/definition';
import { ContinueComposer, ContinueInspector, ContinueWorkspace } from '../modules/continue/ui';
import {
  PhotoEditComposer,
  PhotoEditInspector,
  PhotoEditWorkspace,
} from '../modules/photo-edit/ui';
import { ProjectsWorkspace } from '../modules/projects';
import { AssetsWorkspace } from '../modules/assets';
import { CharactersWorkspace } from '../modules/characters';
import { LocationsWorkspace } from '../modules/locations';
import { WardrobeWorkspace } from '../modules/wardrobe';
import { PreviewPanel } from '../components/PreviewPanel';
import { LogsWorkspace, LogsInspector } from '../modules/logs';
import { MovieWorkspace } from '../modules/movie';
import { ModelingWorkspace, ModelingComposer, ModelingInspector } from '../modules/modeling';
import { modelingDefinition } from '../modules/modeling/definition';
export interface WorkspaceModule {
  definition: ModuleDefinition;
  Workspace: ComponentType;
  Composer?: ComponentType;
  Inspector?: ComponentType;
}
const definition = (id: string, title: string): ModuleDefinition => ({
  id,
  title,
  kind: 'workspace',
  capabilities: [],
  description: title,
});
export const modules: Record<string, WorkspaceModule> = {
  modeling: {
    definition: modelingDefinition,
    Workspace: ModelingWorkspace,
    Composer: ModelingComposer,
    Inspector: ModelingInspector,
  },
  logs: {
    definition: definition('logs', 'Application log'),
    Workspace: LogsWorkspace,
    Inspector: LogsInspector,
  },
  h3: {
    definition: h3Definition,
    Workspace: PreviewPanel,
    Composer: H3Composer,
    Inspector: H3Inspector,
  },
  zimage: {
    definition: zImageDefinition,
    Workspace: PreviewPanel,
    Composer: ZImageComposer,
    Inspector: ZImageInspector,
  },
  ltx: {
    definition: ltxDefinition,
    Workspace: PreviewPanel,
    Composer: LtxComposer,
    Inspector: LtxInspector,
  },
  ripple: {
    definition: rippleDefinition,
    Workspace: RippleWorkspace,
    Composer: RippleComposer,
    Inspector: RippleInspector,
  },
  'photo-edit': {
    definition: photoEditDefinition,
    Workspace: PhotoEditWorkspace,
    Composer: PhotoEditComposer,
    Inspector: PhotoEditInspector,
  },
  projects: { definition: definition('projects', 'Projects'), Workspace: ProjectsWorkspace },
  continue: {
    definition: continueDefinition,
    Workspace: ContinueWorkspace,
    Composer: ContinueComposer,
    Inspector: ContinueInspector,
  },
  assets: { definition: definition('assets', 'Assets'), Workspace: AssetsWorkspace },
  characters: {
    definition: definition('characters', 'Characters'),
    Workspace: CharactersWorkspace,
  },
  locations: { definition: definition('locations', 'Locations'), Workspace: LocationsWorkspace },
  wardrobe: { definition: definition('wardrobe', 'Wardrobe'), Workspace: WardrobeWorkspace },
  movie: {
    definition: definition('movie', 'Movie'),
    Workspace: MovieWorkspace,
  },
};
export const futureModules = ['Flux', 'WAN', 'Qwen', 'Upscale', 'Workflow Lab'];
