import { useState } from 'react';
import { FolderOpen, Plus } from 'lucide-react';
import { guarded, refreshLibrary, useLibrary, useShell } from '../../stores';
export function ProjectsWorkspace() {
  const projects = useLibrary((s) => s.projects);
  const activeId = useShell((s) => s.projectId);
  const [name, setName] = useState('');
  const [rename, setRename] = useState('');
  return (
    <div className="library-workspace">
      <header className="workspace-heading">
        <div>
          <h1>Projects</h1>
          <p>Keep each production’s drafts, references and renders together.</p>
        </div>
      </header>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void guarded(async () => {
            const p = await window.oyama.createProject(name);
            await refreshLibrary();
            useShell.getState().setProject(p.id);
            setName('');
          });
        }}
      >
        <input
          aria-label="New project name"
          className="control"
          placeholder="New project name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="smallbtn" disabled={!name.trim()}>
          <Plus size={13} /> Create project
        </button>
      </form>
      <div className="record-list">
        {projects.map((p) => (
          <button
            key={p.id}
            className={`record-row ${p.id === activeId ? 'selected' : ''}`}
            onClick={() => {
              useShell.getState().setProject(p.id);
              setRename(p.name);
            }}
          >
            <FolderOpen size={20} />
            <span>
              <strong>{p.name}</strong>
              <small>{new Date(p.createdAt).toLocaleDateString()}</small>
            </span>
            {p.id === activeId && <span className="badge on">ACTIVE</span>}
          </button>
        ))}
      </div>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void guarded(async () => {
            await window.oyama.renameProject(activeId, rename);
            await refreshLibrary();
            setRename('');
          });
        }}
      >
        <input
          className="control"
          aria-label="Rename active project"
          value={rename}
          placeholder="Rename active project"
          onChange={(e) => setRename(e.target.value)}
        />
        <button className="smallbtn" disabled={!rename.trim()}>
          Rename
        </button>
        <button
          type="button"
          className="smallbtn"
          onClick={() => useShell.getState().navigate('h3')}
        >
          Open Create
        </button>
      </form>
    </div>
  );
}
