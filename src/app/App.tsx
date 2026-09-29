import { useEffect, useRef, useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import {
  Sparkles,
  Crosshair,
  Layers,
  UserRound,
  Image,
  Play,
  SquareDashed,
  ArrowUpRight,
  Settings,
  MapPin,
  FolderOpen,
  History,
  Box,
  X,
  Minus,
  Square,
  PanelRightClose,
  PanelRightOpen,
  PanelLeftClose,
  PanelLeftOpen,
  GripVertical,
} from 'lucide-react';
import {
  bootstrap,
  checkConnection,
  guarded,
  refreshLibrary,
  patchDraft,
  subscribe,
  useJobs,
  useLibrary,
  useSettings,
  useShell,
} from '../stores';
import { modules, futureModules } from './registry';
import { Modal, Section } from '../components/ui';
import { QueuePanel } from '../components/QueuePanel';
import { ToolSwitcher } from './ToolSwitcher';
import { SettingsPanel } from '../components/SettingsPanel';
import { MovieSidebar } from '../modules/movie';
import {
  defaultWorkspaceLayout,
  readWorkspaceLayouts,
  saveWorkspaceLayouts,
  type WorkspaceLayout,
} from './layout';

function TitleBar() {
  const projectId = useShell((s) => s.projectId);
  const project = useLibrary((s) => s.projects.find((p) => p.id === projectId));
  const ready = useSettings((s) => s.readiness);
  return (
    <header className="titlebar">
      <div className="appmark">
        <span>O</span>
      </div>
      <div className="apptitle">
        OYAMA CreateSpace <span className="projectname">— {project?.name || 'Loading'}</span>
      </div>
      <div className="title-spacer" />
      <button className="connection" onClick={() => useShell.setState({ modal: 'settings' })}>
        <i className={ready?.connected ? '' : 'offline'} />
        {ready?.connected
          ? ready.mock
            ? 'Mock ComfyUI'
            : 'ComfyUI Connected'
          : 'ComfyUI Disconnected'}
      </button>
      <div className="win">
        <button aria-label="Minimize" onClick={() => void window.oyama.windowAction('minimize')}>
          <Minus size={12} />
        </button>
        <button aria-label="Maximize" onClick={() => void window.oyama.windowAction('maximize')}>
          <Square size={11} />
        </button>
        <button
          className="close"
          aria-label="Close window"
          onClick={() => void window.oyama.windowAction('close')}
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
function MenuBar({ resetLayout }: { resetLayout: () => void }) {
  const area = useShell((s) => s.area);
  const navigate = useShell((s) => s.navigate);
  const menuItems: Record<string, [string, () => void][]> = {
    File: [
      ['Projects…', () => navigate('projects')],
      [
        'Import media…',
        () =>
          void guarded(async () => {
            await window.oyama.importMedia({ projectId: useShell.getState().projectId });
            await refreshLibrary();
          }),
      ],
      ['Settings…', () => useShell.setState({ modal: 'settings' })],
      ['Exit', () => void window.oyama.windowAction('close')],
    ],
    Edit: [
      ['Undo text edit', () => document.execCommand('undo')],
      ['Redo text edit', () => document.execCommand('redo')],
    ],
    Create: [
      ['H3 Video', () => navigate('h3')],
      ['ZImage', () => navigate('zimage')],
      ['LTX 2.5 Video', () => navigate('ltx')],
      ['LTX Ripple', () => navigate('ripple')],
      ['Photo Edit', () => navigate('photo-edit')],
      ['Continue / Extend', () => navigate('continue')],
      ['Movie', () => navigate('movie')],
      ['Characters', () => navigate('characters')],
      ['Locations', () => navigate('locations')],
    ],
    View: [
      ['Reset workspace layout', resetLayout],
      ['Application log', () => navigate('logs')],
      ['Assets', () => navigate('assets')],
      ['Queue / History', () => useShell.setState({ inspectorTab: 'Queue' })],
      ['Connection details', () => useShell.setState({ inspectorTab: 'Info' })],
    ],
    Window: [
      ['Minimize', () => void window.oyama.windowAction('minimize')],
      ['Maximize / Restore', () => void window.oyama.windowAction('maximize')],
    ],
    Modules: [['Module catalog', () => useShell.setState({ modal: 'modules' })]],
    Help: [['About CreateSpace', () => useShell.setState({ modal: 'about' })]],
  };
  return (
    <nav className="menubar" aria-label="Application menu">
      {Object.entries(menuItems).map(([name, items]) => (
        <Menu.Root key={name}>
          <Menu.Trigger className="menuitem">{name}</Menu.Trigger>
          <Menu.Portal>
            <Menu.Content className="dropdown" sideOffset={4}>
              {items.map(([label, action]) => (
                <Menu.Item key={label} className="dropdown-item" onSelect={action}>
                  {label}
                </Menu.Item>
              ))}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      ))}
      <ToolSwitcher />
      <div className="workspace-modes">
        <button
          className={modules[area]?.definition.kind === 'generator' ? 'active' : ''}
          onClick={() => navigate('h3')}
        >
          Create
        </button>
        <button className={area === 'assets' ? 'active' : ''} onClick={() => navigate('assets')}>
          Assets
        </button>
        <button
          title="Workflow Lab is coming later"
          onClick={() => useShell.setState({ modal: 'modules' })}
        >
          Workflow
        </button>
      </div>
    </nav>
  );
}
function ToolRail() {
  const area = useShell((s) => s.area);
  const navigate = useShell((s) => s.navigate);
  const tools = [
    { title: 'Generate', icon: Sparkles, area: 'h3' },
    { title: 'Select assets', icon: Crosshair, area: 'assets' },
    { title: 'References', icon: Layers, area: 'assets' },
    { title: 'Character', icon: UserRound, area: 'characters' },
    { title: 'Image', icon: Image, area: 'zimage' },
    { title: 'Video', icon: Play, area: 'h3' },
    { title: 'Mask · coming later', icon: SquareDashed },
    { title: 'Upscale · coming later', icon: ArrowUpRight },
  ];
  return (
    <aside className="toolrail" aria-label="Tools">
      {tools.map((tool, i) => (
        <button
          key={tool.title}
          className={`tool ${area === tool.area ? 'active' : ''} ${i === 4 ? 'tool-separated' : ''}`}
          title={tool.title}
          aria-label={tool.title}
          onClick={() =>
            tool.area ? navigate(tool.area) : useShell.setState({ modal: 'modules' })
          }
        >
          <tool.icon size={16} />
        </button>
      ))}
      <button
        className="tool bottom"
        title="Settings"
        aria-label="Settings"
        onClick={() => useShell.setState({ modal: 'settings' })}
      >
        <Settings size={16} />
      </button>
    </aside>
  );
}
function NavigationPanel() {
  const area = useShell((s) => s.area);
  const navigate = useShell((s) => s.navigate);
  const item = (
    label: string,
    id: string,
    Icon: typeof Sparkles,
    badge?: string,
    action?: () => void,
  ) => (
    <button
      className={`navitem ${area === id ? 'active' : ''}`}
      key={label}
      onClick={action || (() => navigate(id))}
    >
      <Icon className="navicon" size={14} />
      {label}
      {badge && (
        <span className={`badge ${['H3', 'ON'].includes(badge) ? 'on' : ''}`}>{badge}</span>
      )}
    </button>
  );
  return (
    <aside className="leftpanel">
      <div className="paneltitle">CreateSpace</div>
      <div className="section">
        <div className="sectionhead">
          <span className="chev">▼</span> Create
        </div>
        {item('Generate', 'h3', Sparkles, 'CORE')}
        {item('Video', 'video', Play, 'H3', () => navigate('h3'))}
        {item('Image', 'zimage', Image, 'ON')}
        {item('LTX 2.5 Video', 'ltx', Play, 'ON')}
        {item('LTX Ripple', 'ripple', Play, 'ON')}
        {item('Photo Edit', 'photo-edit', Image, 'ON')}
        {item('Continue / Extend', 'continue', Play, 'ON')}
        {item('Movie', 'movie', Play)}
        {item('Characters', 'characters', UserRound)}
        {item('Locations', 'locations', MapPin)}
        {item('References', 'references', Layers, undefined, () => {
          patchDraft({ mode: 'reference', modeExplicit: true }, 'h3');
          navigate('h3');
          useShell.setState({ composerTab: 'References' });
        })}
      </div>
      <div className="section">
        <div className="sectionhead">
          <span className="chev">▼</span> Project
        </div>
        {item('Project Files', 'projects', FolderOpen)}
        {item('Application log', 'logs', History)}
        {item('Assets', 'assets', Layers)}
        {item('History', 'history', History, undefined, () =>
          useShell.setState({ inspectorTab: 'Queue' }),
        )}
        {item('Models', 'models', Box, undefined, () =>
          useShell.setState({ inspectorTab: 'Info' }),
        )}
      </div>
      <div className="section">
        <div className="sectionhead">
          <span className="chev">▼</span> Modules
        </div>
        {item('H3 Video', 'h3-module', Box, 'ON', () => navigate('h3'))}
        {item('ZImage', 'zimage-module', Box, 'ON', () => navigate('zimage'))}
        {item('LTX 2.5 Video', 'ltx-module', Box, 'ON', () => navigate('ltx'))}
        {item('LTX Ripple', 'ripple-module', Box, 'ON', () => navigate('ripple'))}
        {item('Photo Edit', 'photo-edit-module', Box, 'ON', () => navigate('photo-edit'))}
        {item('Continue / Extend', 'continue-module', Box, 'ON', () => navigate('continue'))}
        {['Upscale'].map((label) =>
          item(label, label, Box, 'LATER', () => useShell.setState({ modal: 'modules' })),
        )}
        {item('Prompt Tools', 'prompt-tools', Box, 'CORE', () => {
          navigate('h3');
          useShell.setState({ composerTab: 'Prompt' });
        })}
        <button className="moduleplus" onClick={() => useShell.setState({ modal: 'modules' })}>
          ＋ Add Module
        </button>
      </div>
    </aside>
  );
}
function DocumentTabs() {
  const { area, tabs, navigate } = useShell();
  const projectId = useShell((s) => s.projectId);
  const project = useLibrary((s) => s.projects.find((p) => p.id === projectId));
  return (
    <div className="doctabs">
      {tabs.map((id) => (
        <div key={id} className={`doctab ${id === area ? 'active' : ''}`}>
          <button onClick={() => navigate(id)}>
            <span className="tabdot" />
            {modules[id]?.definition.title}
            {modules[id]?.definition.kind === 'generator'
              ? ` — ${project?.name || 'Untitled'}`
              : ''}
          </button>
          {id !== 'h3' && (
            <button
              aria-label={`Close ${modules[id]?.definition.title} tab`}
              className="tabclose"
              onClick={() =>
                useShell.setState((s) => ({
                  tabs: s.tabs.filter((t) => t !== id),
                  area: s.area === id ? 'h3' : s.area,
                }))
              }
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
function WorkspaceHost({
  composerHeight,
  onComposerHeight,
}: {
  composerHeight: number;
  onComposerHeight: (height: number) => void;
}) {
  const area = useShell((s) => s.area);
  const module = modules[area] || modules.h3;
  const dragStart = useRef<number | null>(null);
  return (
    <main
      className={`center ${module.Composer ? '' : 'without-composer'}`}
      style={
        module.Composer
          ? { gridTemplateRows: `28px minmax(0, 1fr) 5px ${composerHeight}px` }
          : undefined
      }
    >
      <DocumentTabs />
      <module.Workspace />
      {module.Composer && (
        <div
          className="workspace-divider horizontal"
          role="separator"
          aria-label="Resize composer"
          aria-orientation="horizontal"
          tabIndex={0}
          onPointerDown={(event) => {
            dragStart.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragStart.current !== null) {
              onComposerHeight(
                Math.max(120, Math.min(500, composerHeight + dragStart.current - event.clientY)),
              );
              dragStart.current = event.clientY;
            }
          }}
          onPointerUp={() => {
            dragStart.current = null;
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              onComposerHeight(
                Math.max(120, Math.min(500, composerHeight + (event.key === 'ArrowUp' ? 16 : -16))),
              );
            }
          }}
        />
      )}
      {module.Composer && <module.Composer />}
    </main>
  );
}
function Inspector({
  movieSidebarWidth,
  onMovieResize,
}: {
  movieSidebarWidth: number;
  onMovieResize: (width: number) => void;
}) {
  const area = useShell((s) => s.area);
  const tab = useShell((s) => s.inspectorTab);
  const ready = useSettings((s) => s.readiness);
  const module = modules[area];
  if (area === 'movie') return <MovieSidebar width={movieSidebarWidth} onResize={onMovieResize} />;
  return (
    <aside className="rightpanel">
      <div className="panel-tabs">
        {['Properties', 'Queue', 'Info'].map((t) => (
          <button
            key={t}
            className={t === tab ? 'active' : ''}
            onClick={() => useShell.setState({ inspectorTab: t })}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Queue' ? (
        <QueuePanel />
      ) : tab === 'Info' ? (
        <>
          <Section title="Connection">
            <p className="muted">{ready?.message || 'Checking connection…'}</p>
            <button className="smallbtn" onClick={() => void guarded(checkConnection)}>
              Refresh connection
            </button>
          </Section>
          <Section title="Models">
            {Object.entries(ready?.models || {}).map(([kind, names]) => (
              <div className="model-list" key={kind}>
                <b>{kind}</b>
                {names
                  .filter((n) => /minimax|qwen3vl|fasth3|ltx-2\.5|gemma.*ltx/i.test(n))
                  .map((n) => (
                    <p key={n}>{n}</p>
                  ))}
              </div>
            ))}
          </Section>
        </>
      ) : module?.Inspector ? (
        <module.Inspector />
      ) : (
        <Section title="Workspace">
          <p className="muted">{module?.definition.description}</p>
          <p className="muted">
            Records are saved locally. Global characters and locations can be attached to any
            project.
          </p>
        </Section>
      )}
    </aside>
  );
}
function StatusBar() {
  const jobs = useJobs((s) => s.jobs);
  const readiness = useSettings((s) => s.readiness);
  const version = useSettings((s) => s.version);
  return (
    <footer className="status">
      <span>
        Queue{' '}
        <strong>
          {
            jobs.filter((j) =>
              ['preparing', 'submitting', 'queued', 'running', 'recovering'].includes(j.status),
            ).length
          }
        </strong>
      </span>
      {readiness?.devices.length ? (
        readiness.devices.map((d) => (
          <span key={d.index}>
            GPU {d.index}{' '}
            <strong>{d.name.replace(/^cuda:\d+ | : cudaMallocAsync|NVIDIA GeForce /g, '')}</strong>
            <span className="bar" title={`${(d.vram_free / 1024 ** 3).toFixed(1)} GB free`}>
              <i
                style={{
                  width: `${Math.max(0, Math.min(100, (1 - d.vram_free / d.vram_total) * 100))}%`,
                }}
              />
            </span>
          </span>
        ))
      ) : (
        <span>
          GPU <strong>Unavailable</strong>
        </span>
      )}
      <span>
        Modules <strong>{Object.keys(modules).length}</strong>
      </span>
      <span className="push">
        CreateSpace Core <strong>{version}</strong>
      </span>
    </footer>
  );
}
function AppDialogs() {
  const modal = useShell((s) => s.modal);
  const version = useSettings((s) => s.version);
  return (
    <Modal
      open={!!modal}
      onClose={() => useShell.setState({ modal: null })}
      title={
        modal === 'settings'
          ? 'Settings'
          : modal === 'modules'
            ? 'Internal Modules'
            : 'About OYAMA CreateSpace'
      }
    >
      {modal === 'settings' ? (
        <SettingsPanel />
      ) : modal === 'modules' ? (
        <div className="module-catalog">
          {Object.values(modules).map((m) => (
            <div className="catalog-row" key={m.definition.id}>
              <strong>{m.definition.title}</strong>
              <span className="badge on">AVAILABLE</span>
            </div>
          ))}
          {futureModules.map((name) => (
            <div className="catalog-row" key={name}>
              <span>{name}</span>
              <span className="badge">COMING LATER</span>
            </div>
          ))}
          <p className="muted">Modules are bundled with CreateSpace releases.</p>
        </div>
      ) : (
        <>
          <p>
            Version <strong>{version}</strong>
          </p>
          <p className="muted">
            A modular desktop workspace for ComfyUI.
            <br />
            Designed from the OYAMA CreateSpace Adobe Style mockup.
            <br />
            Bundled FFmpeg / ffprobe are separate GPLv3 programs; license and build notices are
            included in media-tools resources.
          </p>
        </>
      )}
    </Modal>
  );
}
export function App() {
  const area = useShell((s) => s.area);
  const [layouts, setLayouts] = useState(readWorkspaceLayouts);
  const layout = layouts[area] || defaultWorkspaceLayout;
  const resizeSide = useRef<{ side: 'left' | 'right'; x: number } | null>(null);
  const updateLayout = (patch: Partial<WorkspaceLayout>) =>
    setLayouts((current) => ({
      ...current,
      [area]: { ...(current[area] || defaultWorkspaceLayout), ...patch },
    }));
  const resetLayout = () => updateLayout(defaultWorkspaceLayout);
  const ready = useShell((s) => s.ready);
  const error = useShell((s) => s.error);
  useEffect(() => {
    saveWorkspaceLayouts(layouts);
  }, [layouts]);
  useEffect(() => {
    const report = (message: string) =>
      void window.oyama
        .reportRendererLog({ level: 'error', message: message.slice(0, 8000) })
        .catch(() => {});
    const errorListener = (event: ErrorEvent) => report(event.error?.stack || event.message);
    const rejectionListener = (event: PromiseRejectionEvent) =>
      report(
        event.reason instanceof Error
          ? event.reason.stack || event.reason.message
          : String(event.reason),
      );
    window.addEventListener('error', errorListener);
    window.addEventListener('unhandledrejection', rejectionListener);
    const off = subscribe();
    void guarded(async () => {
      await bootstrap();
      await checkConnection();
    });
    const timer = setInterval(() => void guarded(checkConnection), 30000);
    return () => {
      off();
      window.removeEventListener('error', errorListener);
      window.removeEventListener('unhandledrejection', rejectionListener);
      clearInterval(timer);
    };
  }, []);
  return (
    <div className="app">
      <TitleBar />
      <MenuBar resetLayout={resetLayout} />
      {ready ? (
        <div
          className="body"
          style={{
            gridTemplateColumns: `var(--tool) ${layout.leftOpen ? `min(${layout.leftWidth}px, calc((100vw - var(--tool) - 370px) / ${Number(layout.leftOpen) + Number(layout.rightOpen)}))` : '0px'} ${layout.leftOpen ? '5px' : '0px'} minmax(0, 1fr) ${layout.rightOpen ? '5px' : '0px'} ${layout.rightOpen ? `min(${layout.rightWidth}px, calc((100vw - var(--tool) - 370px) / ${Number(layout.leftOpen) + Number(layout.rightOpen)}))` : '0px'}`,
          }}
        >
          <ToolRail />
          <div
            className="workspace-dock left-dock"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const dragged = event.dataTransfer.getData('application/x-oyama-dock');
              if (
                ['navigation', 'inspector'].includes(dragged) &&
                dragged !== (layout.swapSides ? 'inspector' : 'navigation')
              )
                updateLayout({ swapSides: !layout.swapSides });
            }}
          >
            <button
              className="dock-collapse left"
              aria-label={layout.leftOpen ? 'Collapse left panel' : 'Restore left panel'}
              onClick={() => updateLayout({ leftOpen: !layout.leftOpen })}
            >
              {layout.leftOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
            </button>
            {layout.leftOpen && (
              <>
                <button
                  className="dock-grip"
                  aria-label={`Move ${layout.swapSides ? 'inspector' : 'navigation'} to opposite side`}
                  title="Drag to the opposite dock, or click to swap"
                  draggable
                  onDragStart={(event) =>
                    event.dataTransfer.setData(
                      'application/x-oyama-dock',
                      layout.swapSides ? 'inspector' : 'navigation',
                    )
                  }
                  onClick={() => updateLayout({ swapSides: !layout.swapSides })}
                >
                  <GripVertical size={13} />
                </button>
                {layout.swapSides ? (
                  <Inspector
                    movieSidebarWidth={layout.leftWidth}
                    onMovieResize={(leftWidth) => updateLayout({ leftWidth })}
                  />
                ) : (
                  <NavigationPanel />
                )}
              </>
            )}
          </div>
          <div
            className="workspace-divider vertical"
            role="separator"
            aria-label="Resize left panel"
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={(event) => {
              resizeSide.current = { side: 'left', x: event.clientX };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (resizeSide.current?.side === 'left') {
                updateLayout({
                  leftWidth: Math.max(
                    180,
                    Math.min(600, layout.leftWidth + event.clientX - resizeSide.current.x),
                  ),
                });
                resizeSide.current.x = event.clientX;
              }
            }}
            onPointerUp={() => {
              resizeSide.current = null;
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                updateLayout({
                  leftWidth: Math.max(
                    180,
                    Math.min(600, layout.leftWidth + (event.key === 'ArrowRight' ? 16 : -16)),
                  ),
                });
              }
            }}
          />
          <WorkspaceHost
            composerHeight={layout.composerHeight}
            onComposerHeight={(composerHeight) => updateLayout({ composerHeight })}
          />
          <div
            className="workspace-divider vertical"
            role="separator"
            aria-label="Resize right panel"
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={(event) => {
              resizeSide.current = { side: 'right', x: event.clientX };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (resizeSide.current?.side === 'right') {
                updateLayout({
                  rightWidth: Math.max(
                    220,
                    Math.min(600, layout.rightWidth + resizeSide.current.x - event.clientX),
                  ),
                });
                resizeSide.current.x = event.clientX;
              }
            }}
            onPointerUp={() => {
              resizeSide.current = null;
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                updateLayout({
                  rightWidth: Math.max(
                    220,
                    Math.min(600, layout.rightWidth + (event.key === 'ArrowLeft' ? 16 : -16)),
                  ),
                });
              }
            }}
          />
          <div
            className="workspace-dock right-dock"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const dragged = event.dataTransfer.getData('application/x-oyama-dock');
              if (
                ['navigation', 'inspector'].includes(dragged) &&
                dragged !== (layout.swapSides ? 'navigation' : 'inspector')
              )
                updateLayout({ swapSides: !layout.swapSides });
            }}
          >
            <button
              className="dock-collapse right"
              aria-label={layout.rightOpen ? 'Collapse right panel' : 'Restore right panel'}
              onClick={() => updateLayout({ rightOpen: !layout.rightOpen })}
            >
              {layout.rightOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
            </button>
            {layout.rightOpen && (
              <>
                <button
                  className="dock-grip"
                  aria-label={`Move ${layout.swapSides ? 'navigation' : 'inspector'} to opposite side`}
                  title="Drag to the opposite dock, or click to swap"
                  draggable
                  onDragStart={(event) =>
                    event.dataTransfer.setData(
                      'application/x-oyama-dock',
                      layout.swapSides ? 'navigation' : 'inspector',
                    )
                  }
                  onClick={() => updateLayout({ swapSides: !layout.swapSides })}
                >
                  <GripVertical size={13} />
                </button>
                {layout.swapSides ? (
                  <NavigationPanel />
                ) : (
                  <Inspector
                    movieSidebarWidth={layout.rightWidth}
                    onMovieResize={(rightWidth) => updateLayout({ rightWidth })}
                  />
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="loading">Opening your workspace…</div>
      )}
      <StatusBar />
      <AppDialogs />
      {error && (
        <div className="error-toast" role="alert">
          <strong>Action could not complete</strong>
          <p>{error}</p>
          <button className="smallbtn" onClick={() => useShell.setState({ error: null })}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
