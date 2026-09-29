import { draftKey, patchDraft, useDrafts, useShell } from '../stores';
import { moduleDefaults } from '../modules/registry';

const tools = [
  { category: 'video', moduleId: 'h3', field: 'mode', value: 'text', label: 'H3 · Text to Video' },
  {
    category: 'video',
    moduleId: 'h3',
    field: 'mode',
    value: 'image',
    label: 'H3 · Image to Video',
  },
  { category: 'video', moduleId: 'h3', field: 'mode', value: 'reference', label: 'H3 · Ref2VA' },
  {
    category: 'video',
    moduleId: 'ltx',
    field: 'mode',
    value: 'text',
    label: 'LTX 2.5 · Text to Video',
  },
  {
    category: 'video',
    moduleId: 'ltx',
    field: 'mode',
    value: 'image',
    label: 'LTX 2.5 · Image to Video',
  },
  { category: 'video', moduleId: 'ripple', label: 'LTX Ripple · Video Edit' },
  { category: 'video', moduleId: 'continue', label: 'Continue / Extend' },
  { category: 'image', moduleId: 'zimage', label: 'ZImage · Generate' },
  { category: 'image', moduleId: 'photo-edit', label: 'Photo Edit · FireRed' },
];
export function ToolSwitcher() {
  const area = useShell((s) => s.area);
  const projectId = useShell((s) => s.projectId);
  const values =
    useDrafts((s) => s.drafts[draftKey(projectId, area)]?.values) || moduleDefaults(area);
  const selected = tools.find(
    (tool) => tool.moduleId === area && (!tool.field || tool.value === values[tool.field]),
  );
  const category = selected?.category || '';
  const select = (index: number) => {
    const tool = tools[index];
    if (!tool) return;
    if (tool.field)
      patchDraft(
        { [tool.field]: tool.value, ...(tool.moduleId === 'h3' ? { modeExplicit: true } : {}) },
        tool.moduleId,
      );
    useShell.getState().navigate(tool.moduleId);
    useShell.setState({ inspectorTab: 'Properties', composerTab: 'Prompt' });
  };
  return (
    <div className="tool-switcher" aria-label="Tool switcher">
      <select
        className="control"
        aria-label="Tool category"
        value={category}
        onChange={(e) => select(tools.findIndex((tool) => tool.category === e.target.value))}
      >
        <option value="" disabled>
          Tools
        </option>
        <option value="video">Video</option>
        <option value="image">Image</option>
      </select>
      <select
        className="control"
        aria-label="Tool mode"
        value={selected ? String(tools.indexOf(selected)) : ''}
        onChange={(e) => select(Number(e.target.value))}
      >
        <option value="" disabled>
          Choose tool / mode
        </option>
        {['video', 'image'].map((group) => (
          <optgroup key={group} label={group === 'video' ? 'Video' : 'Image'}>
            {tools.map((tool, index) =>
              tool.category === group ? (
                <option key={tool.label} value={index}>
                  {tool.label}
                </option>
              ) : null,
            )}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
