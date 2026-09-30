import { useState } from 'react';
import { MapPin, Plus, UserRound } from 'lucide-react';
import type { Asset, LibraryRecord } from '../../shared/domain';
import {
  activeRecordAssetIds,
  fiveAngleFrames,
  recordCover,
  turntableAngles,
} from '../../shared/record-media';
import { characterMasterPrompt, characterTurntablePrompt } from '../modules/characters/prompts';
import { locationReferencePrompt } from '../modules/locations/prompts';
import { AssetThumbnail, LibraryImageGenerator } from './LibraryImageGenerator';
import {
  draftKey,
  guarded,
  patchDraft,
  refreshLibrary,
  useDrafts,
  useJobs,
  useLibrary,
  useShell,
} from '../stores';
import { Empty, Field, Modal } from './ui';

type RecordKind = 'character' | 'location';

export function RecordWorkspace({ kind }: { kind: RecordKind }) {
  const libraryRecords = useLibrary((state) => state.records);
  const records = libraryRecords.filter((record) => record.kind === kind);
  const assets = useLibrary((state) => state.assets);
  const jobs = useJobs((state) => state.jobs);
  const projectId = useShell((state) => state.projectId);
  const [editing, setEditing] = useState<LibraryRecord | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const pendingImages = editing
    ? jobs.filter(
        (job) =>
          job.libraryImageTarget?.kind === 'record' &&
          job.libraryImageTarget.recordId === editing.id &&
          !job.libraryImageAssetId,
      )
    : [];
  const title = kind === 'character' ? 'Characters' : 'Locations';
  const Icon = kind === 'character' ? UserRound : MapPin;
  const outputs = (moduleId: string, outputKind: Asset['kind']) =>
    jobs
      .filter(
        (job) =>
          job.projectId === projectId && job.moduleId === moduleId && job.status === 'complete',
      )
      .flatMap((job) => job.assetIds)
      .map((id) =>
        assets.find((asset) => asset.id === id && asset.kind === outputKind && !asset.missing),
      )
      .filter((asset): asset is Asset => Boolean(asset));
  const save = async (record: LibraryRecord) => {
    await window.oyama.saveRecord(record);
    await refreshLibrary();
    setEditing(null);
  };
  const addOutput = (id: string, field: 'masterAssetId' | 'turntableAssetId') =>
    void guarded(async () => {
      if (!id || !editing) return;
      setBusy(true);
      try {
        if (field === 'masterAssetId') {
          await window.oyama.saveRecord(editing);
          const updated = await window.oyama.attachRecordImage({
            projectId,
            recordId: editing.id,
            assetId: id,
            purpose: 'master',
          });
          await refreshLibrary();
          setEditing(updated);
          return;
        }
        const asset = await window.oyama.promoteAsset(id);
        const updated: LibraryRecord = {
          ...editing,
          assetIds: [...new Set([...editing.assetIds, asset.id])],
          [field]: asset.id,
          angleSamples: undefined,
        };
        await window.oyama.saveRecord(updated);
        await refreshLibrary();
        setEditing(updated);
      } finally {
        setBusy(false);
      }
    });
  const createTurntable = () =>
    void guarded(async () => {
      if (!editing?.masterAssetId) return;
      await save(editing);
      const draft = await window.oyama.handoffAsset({
        assetId: editing.masterAssetId,
        projectId,
        targetModuleId: 'h3',
        targetField: 'firstFrame',
      });
      useDrafts.setState((state) => ({
        drafts: { ...state.drafts, [draftKey(projectId, 'h3')]: draft },
      }));
      patchDraft(
        {
          prompt: characterTurntablePrompt(editing),
          duration: 4,
          width: 512,
          height: 768,
          resolutionLock: null,
        },
        'h3',
      );
      useShell.getState().navigate('h3');
      useShell.setState({ composerTab: 'Prompt', inspectorTab: 'Properties' });
    });
  const extractAngles = () =>
    void guarded(async () => {
      if (!editing?.turntableAssetId) return;
      const record = editing;
      setBusy(true);
      try {
        const video = assets.find((asset) => asset.id === record.turntableAssetId);
        if (!video || video.missing) throw new Error('Turntable video is missing.');
        const media = await window.oyama.probeAsset(video.id);
        const fps = media.video?.fps;
        const frames = media.video?.frames;
        if (!fps || !frames)
          throw new Error('Turntable has no reliable frame count or frame rate.');
        const samples = fiveAngleFrames(frames, fps);
        const images: Asset[] = [];
        for (const sample of samples) {
          const frame = await window.oyama.extractFrame({
            assetId: video.id,
            seconds: sample.seconds,
            frame: sample.frame,
          });
          images.push(frame.projectId ? await window.oyama.promoteAsset(frame.id) : frame);
        }
        const updated: LibraryRecord = {
          ...record,
          assetIds: [...new Set([...record.assetIds, ...images.map((asset) => asset.id)])],
          angleSamples: samples.map((sample, index) => ({ ...sample, assetId: images[index].id })),
          approvedAssetIds: record.masterAssetId ? [record.masterAssetId] : [],
        };
        await window.oyama.saveRecord(updated);
        await refreshLibrary();
        setEditing(updated);
      } finally {
        setBusy(false);
      }
    });
  const selected = editing ? activeRecordAssetIds(editing, assets) : [];
  return (
    <div className="library-workspace">
      <header className="workspace-heading">
        <div>
          <h1>{title}</h1>
          <p>A global library, available in every project.</p>
        </div>
        <button
          className="smallbtn"
          onClick={() => {
            setConfirm(false);
            setEditing({
              id: crypto.randomUUID(),
              kind,
              name: '',
              description: '',
              assetIds: [],
              ...(kind === 'character'
                ? { identityNotes: '', voice: '' }
                : {
                    environment: '',
                    timeOfDay: '',
                    lighting: '',
                    atmosphere: '',
                    accuracyNotes: '',
                  }),
            });
          }}
        >
          <Plus size={13} /> New {kind}
        </button>
      </header>
      {!records.length ? (
        <Empty title={`No ${title.toLowerCase()} yet`}>
          Add a name, details and reference media, then attach it in Create.
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
              <AssetThumbnail asset={recordCover(record, assets)} className="record-cover" />
              <span>
                <strong>{record.name}</strong>
                <small>
                  {record.description ||
                    (kind === 'location' ? record.environment : record.identityNotes) ||
                    'No description'}
                </small>
              </span>
              <span className="badge">{activeRecordAssetIds(record, assets).length} ACTIVE</span>
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
        title={kind === 'character' ? 'Character Studio' : 'Edit location'}
        description="Changes apply wherever this reusable record is attached."
      >
        {editing && generatorOpen ? (
          <LibraryImageGenerator
            key={editing.id}
            target={{
              kind: 'record',
              recordId: editing.id,
              purpose: kind === 'character' ? 'master' : 'reference',
            }}
            prompt={
              kind === 'character'
                ? characterMasterPrompt(editing)
                : locationReferencePrompt(editing)
            }
            width={kind === 'character' ? 768 : 1344}
            height={kind === 'character' ? 1024 : 768}
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
              <Field label="Name">
                <input
                  className="control"
                  required
                  maxLength={100}
                  value={editing.name}
                  onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                />
              </Field>
              <Field
                label={kind === 'character' ? 'Appearance and outfit' : 'Location description'}
              >
                <textarea
                  className="record-description"
                  value={editing.description}
                  onChange={(event) => setEditing({ ...editing, description: event.target.value })}
                />
              </Field>
              {kind === 'character' ? (
                <>
                  <Field label="Identity details">
                    <textarea
                      className="record-description record-notes"
                      value={editing.identityNotes || ''}
                      onChange={(event) =>
                        setEditing({ ...editing, identityNotes: event.target.value })
                      }
                      placeholder="Stable face, hair, body proportions and details to retain"
                    />
                  </Field>
                  <Field label="Voice and manner">
                    <input
                      className="control"
                      value={editing.voice || ''}
                      onChange={(event) => setEditing({ ...editing, voice: event.target.value })}
                    />
                  </Field>
                  <div className="reference-list">
                    <button
                      type="button"
                      className="smallbtn"
                      disabled={busy || !editing.name.trim()}
                      onClick={() => setGeneratorOpen(true)}
                    >
                      Create master in ZImage
                    </button>
                    <div className="visual-output-picker" aria-label="Existing ZImage masters">
                      {outputs('zimage', 'image').map((asset) => (
                        <button
                          type="button"
                          key={asset.id}
                          title={`Use ${asset.name} as master`}
                          onClick={() => addOutput(asset.id, 'masterAssetId')}
                        >
                          <AssetThumbnail asset={asset} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="reference-list">
                    <button
                      type="button"
                      className="smallbtn"
                      disabled={busy || !editing.masterAssetId}
                      onClick={createTurntable}
                    >
                      Create H3 turntable
                    </button>
                    <div className="visual-output-picker" aria-label="Existing H3 turntables">
                      {outputs('h3', 'video').map((asset) => (
                        <button
                          type="button"
                          key={asset.id}
                          title={`Use ${asset.name} as turntable`}
                          onClick={() => addOutput(asset.id, 'turntableAssetId')}
                        >
                          <AssetThumbnail asset={asset} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="smallbtn"
                    disabled={busy || !editing.turntableAssetId}
                    onClick={extractAngles}
                  >
                    {busy ? 'Extracting…' : 'Extract five angles'}
                  </button>
                  {editing.angleSamples?.length === 5 && (
                    <p className="muted">
                      Five exact frames sampled from the turntable: {turntableAngles.join(' · ')}.
                      These names are intended poses; inspect each frame and approve matching views
                      below.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <Field label="Environment">
                    <textarea
                      className="record-description record-notes"
                      value={editing.environment || ''}
                      onChange={(event) =>
                        setEditing({ ...editing, environment: event.target.value })
                      }
                    />
                  </Field>
                  <div className="split">
                    <Field label="Time of day">
                      <input
                        className="control"
                        value={editing.timeOfDay || ''}
                        onChange={(event) =>
                          setEditing({ ...editing, timeOfDay: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Lighting">
                      <input
                        className="control"
                        value={editing.lighting || ''}
                        onChange={(event) =>
                          setEditing({ ...editing, lighting: event.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Atmosphere">
                    <input
                      className="control"
                      value={editing.atmosphere || ''}
                      onChange={(event) =>
                        setEditing({ ...editing, atmosphere: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Accuracy and continuity">
                    <textarea
                      className="record-description record-notes"
                      value={editing.accuracyNotes || ''}
                      onChange={(event) =>
                        setEditing({ ...editing, accuracyNotes: event.target.value })
                      }
                    />
                  </Field>
                </>
              )}
              <div className="field">
                <span className="field-label">Reference media</span>
                <div className="record-reference-grid">
                  {editing.assetIds.map((id) => {
                    const asset = assets.find((item) => item.id === id);
                    const checked = selected.includes(id);
                    return (
                      <div className={`record-reference ${checked ? 'selected' : ''}`} key={id}>
                        {asset?.kind === 'image' && !asset.missing ? (
                          <img src={asset.url} alt="" />
                        ) : (
                          <Icon size={20} />
                        )}
                        <label>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!asset || asset.missing || (checked && selected.length === 1)}
                            onChange={(event) =>
                              setEditing({
                                ...editing,
                                approvedAssetIds: event.target.checked
                                  ? [...new Set([...selected, id])]
                                  : selected.filter((value) => value !== id),
                              })
                            }
                          />{' '}
                          Use
                        </label>
                        <small>
                          {asset?.name || 'Missing asset'}
                          {id === editing.masterAssetId ? ' · master' : ''}
                          {id === editing.turntableAssetId ? ' · turntable' : ''}
                          {editing.angleSamples?.find((sample) => sample.assetId === id)
                            ? ` · ${editing.angleSamples.find((sample) => sample.assetId === id)!.label}`
                            : ''}
                        </small>
                        {asset?.kind === 'image' && !asset.missing && (
                          <button
                            type="button"
                            className="record-set-cover"
                            onClick={() => setEditing({ ...editing, coverAssetId: id })}
                          >
                            {editing.coverAssetId === id ? 'Cover ✓' : 'Set cover'}
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`Remove ${asset?.name || 'missing asset'}`}
                          onClick={() =>
                            setEditing({
                              ...editing,
                              assetIds: editing.assetIds.filter((value) => value !== id),
                              approvedAssetIds: selected.filter((value) => value !== id),
                              coverAssetId:
                                editing.coverAssetId === id ? null : editing.coverAssetId,
                              masterAssetId:
                                editing.masterAssetId === id ? null : editing.masterAssetId,
                              turntableAssetId:
                                editing.turntableAssetId === id ? null : editing.turntableAssetId,
                              angleSamples: editing.angleSamples?.some(
                                (sample) => sample.assetId === id,
                              )
                                ? undefined
                                : editing.angleSamples,
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
                {editing.assetIds.length > 0 && (
                  <small>
                    One available reference stays active. Missing selections fall back to{' '}
                    {kind === 'character'
                      ? 'the master image when available'
                      : 'another available reference'}
                    .
                  </small>
                )}
              </div>
              <button
                type="button"
                className="smallbtn"
                disabled={busy}
                onClick={() =>
                  void guarded(async () => {
                    const files = await window.oyama.importMedia({ projectId: null });
                    await refreshLibrary();
                    setEditing((record) =>
                      record
                        ? {
                            ...record,
                            assetIds: [
                              ...new Set([...record.assetIds, ...files.map((asset) => asset.id)]),
                            ],
                          }
                        : record,
                    );
                  })
                }
              >
                ＋ Import reference
              </button>
              {pendingImages.length > 0 && (
                <button type="button" className="smallbtn" onClick={() => setGeneratorOpen(true)}>
                  Review generated images ({pendingImages.length})
                </button>
              )}
              {kind === 'location' && (
                <button
                  type="button"
                  className="smallbtn"
                  disabled={!editing.name.trim()}
                  onClick={() => setGeneratorOpen(true)}
                >
                  Generate location image
                </button>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="smallbtn danger"
                  disabled={busy}
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
                <button className="generate" disabled={busy}>
                  Save {kind}
                </button>
              </div>
            </form>
          )
        )}
      </Modal>
    </div>
  );
}
