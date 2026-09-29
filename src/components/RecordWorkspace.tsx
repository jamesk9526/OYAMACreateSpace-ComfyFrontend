import { useState } from 'react';
import { MapPin, Plus, UserRound } from 'lucide-react';
import type { LibraryRecord } from '../../shared/domain';
import { guarded, refreshLibrary, useLibrary } from '../stores';
import { Empty, Field, Modal } from './ui';
export function RecordWorkspace({ kind }: { kind: LibraryRecord['kind'] }) {
  const allRecords = useLibrary((s) => s.records);
  const records = allRecords.filter((r) => r.kind === kind);
  const assets = useLibrary((s) => s.assets);
  const [editing, setEditing] = useState<LibraryRecord | null>(null);
  const [confirm, setConfirm] = useState(false);
  const title = kind === 'character' ? 'Characters' : 'Locations';
  const Icon = kind === 'character' ? UserRound : MapPin;
  return (
    <div className="library-workspace">
      <header className="workspace-heading">
        <div>
          <h1>{title}</h1>
          <p>A global library, available in every project.</p>
        </div>
        <button
          className="smallbtn"
          onClick={() =>
            setEditing({ id: crypto.randomUUID(), kind, name: '', description: '', assetIds: [] })
          }
        >
          <Plus size={13} /> New {kind}
        </button>
      </header>
      {!records.length ? (
        <Empty title={`No ${title.toLowerCase()} yet`}>
          Add a name, description and reference media, then attach it in Create.
        </Empty>
      ) : (
        <div className="record-list">
          {records.map((record) => (
            <button
              key={record.id}
              className="record-row"
              onClick={() => {
                setEditing(record);
                setConfirm(false);
              }}
            >
              <Icon size={20} />
              <span>
                <strong>{record.name}</strong>
                <small>{record.description || 'No description'}</small>
              </span>
              <span className="badge">{record.assetIds.length} REFERENCES</span>
            </button>
          ))}
        </div>
      )}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Edit ${kind}`}
        description="Changes apply wherever this reusable record is attached."
      >
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void guarded(async () => {
                await window.oyama.saveRecord(editing);
                await refreshLibrary();
                setEditing(null);
              });
            }}
          >
            <Field label="Name">
              <input
                className="control"
                required
                maxLength={100}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <textarea
                className="record-description"
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder={
                  kind === 'character'
                    ? 'Appearance, wardrobe, personality, voice…'
                    : 'Environment, lighting, atmosphere…'
                }
              />
            </Field>
            <Field label="Reference media">
              <div className="reference-list">
                {editing.assetIds.map((id) => (
                  <button
                    type="button"
                    className="chip"
                    key={id}
                    onClick={() =>
                      setEditing({ ...editing, assetIds: editing.assetIds.filter((a) => a !== id) })
                    }
                  >
                    {assets.find((a) => a.id === id)?.name || 'Missing asset'} ×
                  </button>
                ))}
              </div>
            </Field>
            <button
              type="button"
              className="smallbtn"
              onClick={() =>
                void guarded(async () => {
                  const files = await window.oyama.importMedia({ projectId: null });
                  await refreshLibrary();
                  setEditing((v) =>
                    v ? { ...v, assetIds: [...v.assetIds, ...files.map((a) => a.id)] } : v,
                  );
                })
              }
            >
              ＋ Import reference
            </button>
            <div className="modal-actions">
              <button
                type="button"
                className="smallbtn danger"
                onClick={() => {
                  if (!confirm) setConfirm(true);
                  else
                    void guarded(async () => {
                      await window.oyama.removeRecord(editing.id);
                      await refreshLibrary();
                      setEditing(null);
                    });
                }}
              >
                {confirm ? 'Confirm delete' : 'Delete'}
              </button>
              <button className="generate">Save {kind}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
