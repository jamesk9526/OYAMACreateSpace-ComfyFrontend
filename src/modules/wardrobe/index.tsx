import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { LibraryRecord } from '../../../shared/domain';
import { guarded, refreshLibrary, useJobs, useLibrary, useShell } from '../../stores';
import { Empty, Field, Modal } from '../../components/ui';
import { wardrobePrompt } from './prompt';
import { recordCover } from '../../../shared/record-media';
import { AssetThumbnail, LibraryImageGenerator } from '../../components/LibraryImageGenerator';

export function WardrobeWorkspace() {
  const records = useLibrary((state) => state.records);
  const assets = useLibrary((state) => state.assets);
  const jobs = useJobs((state) => state.jobs);
  const projectId = useShell((state) => state.projectId);
  const [editing, setEditing] = useState<LibraryRecord | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const pendingImages = editing
    ? jobs.filter(
        (job) =>
          job.libraryImageTarget?.kind === 'record' &&
          job.libraryImageTarget.recordId === editing.id &&
          !job.libraryImageAssetId,
      )
    : [];
  const wardrobes = records.filter((record) => record.kind === 'wardrobe');
  const characters = records.filter((record) => record.kind === 'character');
  const outputs = jobs
    .filter(
      (job) =>
        job.projectId === projectId && job.moduleId === 'zimage' && job.status === 'complete',
    )
    .flatMap((job) => job.assetIds)
    .map((id) =>
      assets.find((asset) => asset.id === id && asset.kind === 'image' && !asset.missing),
    )
    .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
  const save = async (record: LibraryRecord) => {
    await window.oyama.saveRecord(record);
    await refreshLibrary();
    setEditing(null);
  };
  return (
    <div className="library-workspace">
      <header className="workspace-heading">
        <div>
          <h1>Wardrobe</h1>
          <p>Reusable outfits and footwear for every project.</p>
        </div>
        <button
          className="smallbtn"
          onClick={() => {
            setConfirm(false);
            setEditing({
              id: crypto.randomUUID(),
              kind: 'wardrobe',
              name: '',
              description: '',
              assetIds: [],
              characterId: null,
              colors: '',
              materials: '',
              visualStyle: 'cinematic photorealism',
            });
          }}
        >
          <Plus size={13} /> New outfit
        </button>
      </header>
      {!wardrobes.length ? (
        <Empty title="No outfits yet">
          Create an outfit, add a reference image, or make a three-view sheet with ZImage.
        </Empty>
      ) : (
        <div className="record-list">
          {wardrobes.map((record) => (
            <button
              className="record-row"
              key={record.id}
              onClick={() => {
                setConfirm(false);
                setEditing(record);
              }}
            >
              <AssetThumbnail asset={recordCover(record, assets)} className="record-cover" />
              <span>
                <strong>{record.name}</strong>
                <small>{record.description || 'No outfit description'}</small>
              </span>
              <span className="badge">{record.assetIds.length} REFERENCES</span>
            </button>
          ))}
        </div>
      )}
      <Modal
        open={!!editing}
        onClose={() => {
          setEditing(null);
          setGeneratorOpen(false);
        }}
        title="Wardrobe creator"
        description="Garments and footwear stay separate from character identity and accessories."
      >
        {editing && generatorOpen ? (
          <LibraryImageGenerator
            key={editing.id}
            target={{ kind: 'record', recordId: editing.id, purpose: 'reference' }}
            prompt={wardrobePrompt(editing)}
            width={1344}
            height={768}
            onPrepare={async () => {
              await window.oyama.saveRecord(editing);
              await refreshLibrary();
            }}
            onUse={() => {
              const record = useLibrary.getState().records.find((item) => item.id === editing.id);
              if (record) setEditing(record);
              setGeneratorOpen(false);
            }}
            onBack={() => setGeneratorOpen(false)}
          />
        ) : (
          editing && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void guarded(() => save(editing));
              }}
            >
              <Field label="Outfit name">
                <input
                  className="control"
                  required
                  maxLength={100}
                  value={editing.name}
                  onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                />
              </Field>
              <Field label="Character binding">
                <select
                  className="control"
                  value={editing.characterId || ''}
                  onChange={(event) =>
                    setEditing({ ...editing, characterId: event.target.value || null })
                  }
                >
                  <option value="">Any character</option>
                  {characters.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Garments and footwear">
                <textarea
                  className="record-description"
                  value={editing.description}
                  onChange={(event) => setEditing({ ...editing, description: event.target.value })}
                />
              </Field>
              <Field label="Colors and pattern">
                <input
                  className="control"
                  value={editing.colors || ''}
                  onChange={(event) => setEditing({ ...editing, colors: event.target.value })}
                />
              </Field>
              <Field label="Materials and construction">
                <input
                  className="control"
                  value={editing.materials || ''}
                  onChange={(event) => setEditing({ ...editing, materials: event.target.value })}
                />
              </Field>
              <Field label="Visual style">
                <input
                  className="control"
                  value={editing.visualStyle || ''}
                  onChange={(event) => setEditing({ ...editing, visualStyle: event.target.value })}
                />
              </Field>
              <Field label="Approved reference images">
                <div className="reference-list">
                  {editing.assetIds.map((id) => (
                    <div className="wardrobe-reference" key={id}>
                      <AssetThumbnail asset={assets.find((asset) => asset.id === id)} />
                      <small>
                        {assets.find((asset) => asset.id === id)?.name || 'Missing image'}
                      </small>
                      <button
                        type="button"
                        onClick={() => setEditing({ ...editing, coverAssetId: id })}
                      >
                        {editing.coverAssetId === id ? 'Cover ✓' : 'Set cover'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            ...editing,
                            assetIds: editing.assetIds.filter((value) => value !== id),
                            approvedAssetIds: editing.approvedAssetIds?.filter(
                              (value) => value !== id,
                            ),
                            coverAssetId: editing.coverAssetId === id ? null : editing.coverAssetId,
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </Field>
              <div className="reference-list">
                <button
                  type="button"
                  className="smallbtn"
                  onClick={() =>
                    void guarded(async () => {
                      const files = await window.oyama.importMedia({ projectId: null });
                      await refreshLibrary();
                      setEditing((value) =>
                        value
                          ? {
                              ...value,
                              assetIds: [
                                ...new Set([
                                  ...value.assetIds,
                                  ...files
                                    .filter((file) => file.kind === 'image')
                                    .map((file) => file.id),
                                ]),
                              ],
                            }
                          : value,
                      );
                    })
                  }
                >
                  ＋ Import image
                </button>
                <div className="visual-output-picker" aria-label="Existing ZImage outputs">
                  {outputs.map((asset) => (
                    <button
                      type="button"
                      key={asset.id}
                      title={`Add ${asset.name}`}
                      onClick={() =>
                        void guarded(async () => {
                          await window.oyama.saveRecord(editing);
                          const record = await window.oyama.attachRecordImage({
                            projectId,
                            recordId: editing.id,
                            assetId: asset.id,
                            purpose: 'reference',
                          });
                          await refreshLibrary();
                          setEditing(record);
                        })
                      }
                    >
                      <AssetThumbnail asset={asset} />
                    </button>
                  ))}
                </div>
              </div>
              {pendingImages.length > 0 && (
                <button type="button" className="smallbtn" onClick={() => setGeneratorOpen(true)}>
                  Review generated images ({pendingImages.length})
                </button>
              )}
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
                <button
                  type="button"
                  className="smallbtn"
                  disabled={!editing.name.trim()}
                  onClick={() => setGeneratorOpen(true)}
                >
                  Generate sheet here
                </button>
                <button className="generate">Save outfit</button>
              </div>
            </form>
          )
        )}
      </Modal>
    </div>
  );
}
