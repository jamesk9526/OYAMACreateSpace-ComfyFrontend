export type WorkspaceLayout = {
  leftWidth: number;
  rightWidth: number;
  composerHeight: number;
  leftOpen: boolean;
  rightOpen: boolean;
  swapSides: boolean;
};

export const defaultWorkspaceLayout: WorkspaceLayout = {
  leftWidth: 218,
  rightWidth: 286,
  composerHeight: 196,
  leftOpen: true,
  rightOpen: true,
  swapSides: false,
};

const key = 'createspace.workspace-layouts.v1';
const bounded = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;

export function readWorkspaceLayouts(): Record<string, WorkspaceLayout> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    return Object.fromEntries(
      Object.entries(saved).map(([area, raw]) => {
        const value = raw && typeof raw === 'object' ? (raw as Partial<WorkspaceLayout>) : {};
        return [
          area,
          {
            leftWidth: bounded(value.leftWidth, 218, 180, 600),
            rightWidth: bounded(value.rightWidth, 286, 220, 600),
            composerHeight: bounded(value.composerHeight, 196, 120, 500),
            leftOpen: value.leftOpen !== false,
            rightOpen: value.rightOpen !== false,
            swapSides: value.swapSides === true,
          },
        ];
      }),
    );
  } catch {
    return {};
  }
}

export function saveWorkspaceLayouts(layouts: Record<string, WorkspaceLayout>) {
  localStorage.setItem(key, JSON.stringify(layouts));
}
