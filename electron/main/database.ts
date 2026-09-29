import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type {
  Asset,
  Bootstrap,
  Draft,
  Job,
  LibraryRecord,
  MediaProbe,
  Project,
  Settings,
} from '../../shared/domain';
import {
  draftSchema,
  livePreviewDefaults,
  recordSchema,
  settingsSchema,
} from '../../shared/domain';
import {
  continuationScriptSchema,
  reconcileScript,
  type ContinuationScript,
  type ContinuationScriptInput,
} from '../../shared/continuation';
import { continueSchema } from '../../src/modules/continue/definition';
import {
  emptyMovieTimeline,
  movieTimelineSchema,
  type MovieTimeline,
} from '../../shared/movie-timeline';

const mediaTypes: Record<string, [Asset['kind'], string]> = {
  '.png': ['image', 'image/png'],
  '.jpg': ['image', 'image/jpeg'],
  '.jpeg': ['image', 'image/jpeg'],
  '.webp': ['image', 'image/webp'],
  '.mp4': ['video', 'video/mp4'],
  '.webm': ['video', 'video/webm'],
  '.mov': ['video', 'video/quicktime'],
  '.wav': ['audio', 'audio/wav'],
  '.mp3': ['audio', 'audio/mpeg'],
  '.flac': ['audio', 'audio/flac'],
  '.ogg': ['audio', 'audio/ogg'],
};
type JsonRow = { data: string };
export class Store {
  readonly db: Database.Database;
  constructor(readonly root: string) {
    mkdirSync(root, { recursive: true });
    this.db = new Database(path.join(root, 'createspace.sqlite'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    const version = this.db.pragma('user_version', { simple: true }) as number;
    if (version > 6) throw new Error('This library belongs to a newer CreateSpace version.');
    if (!version)
      this.db.transaction(() => {
        this.db.exec(`
        CREATE TABLE projects(id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE assets(id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), file TEXT NOT NULL, data TEXT NOT NULL);
        CREATE TABLE records(id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE record_assets(record_id TEXT REFERENCES records(id) ON DELETE CASCADE, asset_id TEXT REFERENCES assets(id), PRIMARY KEY(record_id,asset_id));
        CREATE TABLE project_records(project_id TEXT REFERENCES projects(id), record_id TEXT REFERENCES records(id), PRIMARY KEY(project_id,record_id));
        CREATE TABLE drafts(project_id TEXT REFERENCES projects(id), module_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(project_id,module_id));
        CREATE TABLE jobs(id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), data TEXT NOT NULL);
        CREATE TABLE settings(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
        PRAGMA user_version=1;
      `);
      })();
    if (version < 2)
      this.db.transaction(() => {
        this.db.exec(`
        CREATE TABLE asset_derivations(
          asset_id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
          parent_asset_id TEXT NOT NULL REFERENCES assets(id),
          operation TEXT NOT NULL CHECK(operation IN ('frame','clip')),
          data TEXT NOT NULL
        );
        PRAGMA user_version=2;
      `);
      })();
    if (version < 3)
      this.db.transaction(() => {
        this.db.exec(`
          ALTER TABLE asset_derivations RENAME TO asset_derivations_v2;
          CREATE TABLE asset_derivations(
            asset_id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
            parent_asset_id TEXT NOT NULL REFERENCES assets(id),
            operation TEXT NOT NULL CHECK(operation IN ('frame','clip','continue')),
            data TEXT NOT NULL
          );
          INSERT INTO asset_derivations SELECT * FROM asset_derivations_v2;
          DROP TABLE asset_derivations_v2;
          PRAGMA user_version=3;
        `);
      })();
    if (version < 4)
      this.db.transaction(() => {
        this.db
          .exec(`CREATE TABLE continuation_scripts(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), data TEXT NOT NULL);
        CREATE TABLE continuation_beats(id TEXT NOT NULL, script_id TEXT NOT NULL REFERENCES continuation_scripts(id) ON DELETE CASCADE, position INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(script_id,id));
        PRAGMA user_version=4;`);
      })();
    if (version < 5)
      this.db.transaction(() => {
        this.db.exec(`
          ALTER TABLE asset_derivations RENAME TO asset_derivations_v4;
          CREATE TABLE asset_derivations(
            asset_id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
            parent_asset_id TEXT NOT NULL REFERENCES assets(id),
            operation TEXT NOT NULL CHECK(operation IN ('frame','clip','continue','ripple')),
            data TEXT NOT NULL
          );
          INSERT INTO asset_derivations SELECT * FROM asset_derivations_v4;
          DROP TABLE asset_derivations_v4;
          PRAGMA user_version=5;
        `);
      })();
    if (version < 6)
      this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE movie_timelines(
            project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
            data TEXT NOT NULL
          );
          PRAGMA user_version=6;
        `);
      })();
    if (!this.db.prepare('SELECT id FROM projects LIMIT 1').get())
      this.createProject('Untitled Project');
    if (!this.db.prepare('SELECT id FROM settings').get())
      this.saveSettings({
        comfyUrl: 'http://127.0.0.1:8188',
        mockScenario: 'success',
        livePreview: livePreviewDefaults,
      });
  }
  private rows<T>(table: 'projects' | 'assets' | 'records' | 'drafts' | 'jobs'): T[] {
    return (
      this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid DESC`).all() as JsonRow[]
    ).map((row) => JSON.parse(row.data) as T);
  }
  snapshot(version: string, mock: boolean): Bootstrap {
    return {
      projects: this.rows<Project>('projects'),
      assets: this.rows<Asset>('assets').map((a) => ({
        ...a,
        ...(a.generationContext
          ? {
              generationContext: {
                ...a.generationContext,
                available: existsSync(this.contextFile(a.projectId, a.generationContext.jobId)),
              },
            }
          : {}),
        missing: !existsSync(this.assetPath(a.id)),
      })),
      records: this.rows<LibraryRecord>('records'),
      drafts: this.rows<Draft>('drafts'),
      jobs: this.rows<Job>('jobs'),
      settings: this.settings(),
      version,
      mock,
    };
  }
  continuationScripts(projectId: string): ContinuationScript[] {
    this.project(projectId);
    return (
      this.db
        .prepare('SELECT data FROM continuation_scripts WHERE project_id=? ORDER BY rowid DESC')
        .all(projectId) as JsonRow[]
    ).map((row) => JSON.parse(row.data) as ContinuationScript);
  }
  continuationScript(id: string): ContinuationScript {
    const row = this.db.prepare('SELECT data FROM continuation_scripts WHERE id=?').get(id) as
      JsonRow | undefined;
    if (!row) throw new Error('Continue script not found.');
    return JSON.parse(row.data) as ContinuationScript;
  }
  saveBeatResult(
    scriptId: string,
    beatId: string,
    beatRevision: number,
    result: { jobId: string; assetIds: string[]; deliveredDuration: number },
  ): ContinuationScript {
    return this.db.transaction(() => {
      const script = this.continuationScript(scriptId);
      const beat = script.beats.find((item) => item.id === beatId);
      if (!beat || beat.revision !== beatRevision) return script;
      beat.result = result;
      beat.stale = false;
      this.db
        .prepare('UPDATE continuation_scripts SET data=? WHERE id=?')
        .run(JSON.stringify(script), scriptId);
      this.db
        .prepare('UPDATE continuation_beats SET data=? WHERE script_id=? AND id=?')
        .run(JSON.stringify(beat), scriptId, beatId);
      return script;
    })();
  }
  saveContinuationScript(raw: ContinuationScriptInput): ContinuationScript {
    const input = continuationScriptSchema.parse(raw);
    this.project(input.projectId);
    const source = this.asset(input.sourceVideo);
    if (
      source.kind !== 'video' ||
      source.missing ||
      (source.projectId && source.projectId !== input.projectId)
    )
      throw new Error('Choose a managed video from this project or global library.');
    const settings: Record<string, unknown> = continueSchema.parse({
      ...input.settings,
      prompt: '',
      sourceVideo: input.sourceVideo,
      firstFrame: null,
    });
    delete settings.dialoguePolicy;
    delete settings.audioCarry;
    input.settings = settings;
    return this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT data FROM continuation_scripts WHERE id=?')
        .get(input.id) as JsonRow | undefined;
      const previous = row ? (JSON.parse(row.data) as ContinuationScript) : undefined;
      const script = reconcileScript(previous, input);
      this.db
        .prepare(
          'INSERT INTO continuation_scripts VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        )
        .run(script.id, script.projectId, JSON.stringify(script));
      this.db.prepare('DELETE FROM continuation_beats WHERE script_id=?').run(script.id);
      const insert = this.db.prepare('INSERT INTO continuation_beats VALUES(?,?,?,?)');
      script.beats.forEach((beat, index) =>
        insert.run(beat.id, script.id, index, JSON.stringify(beat)),
      );
      return script;
    })();
  }
  project(id: string): Project {
    const row = this.db.prepare('SELECT data FROM projects WHERE id=?').get(id) as
      JsonRow | undefined;
    if (!row) throw new Error('Project not found');
    return JSON.parse(row.data);
  }
  createProject(name: string): Project {
    const project = { id: randomUUID(), name, createdAt: new Date().toISOString() };
    this.db.prepare('INSERT INTO projects VALUES(?,?)').run(project.id, JSON.stringify(project));
    return project;
  }
  renameProject(id: string, name: string) {
    const project = { ...this.project(id), name };
    this.db.prepare('UPDATE projects SET data=? WHERE id=?').run(JSON.stringify(project), id);
    return project;
  }
  settings(): Settings {
    const row = this.db.prepare('SELECT data FROM settings WHERE id=1').get() as JsonRow;
    return settingsSchema.parse(JSON.parse(row.data));
  }
  saveSettings(value: Settings) {
    const data = settingsSchema.parse(value);
    this.db.prepare('INSERT OR REPLACE INTO settings VALUES(1,?)').run(JSON.stringify(data));
    return data;
  }
  saveDraft(value: Draft) {
    const draft = draftSchema.parse(value);
    this.project(draft.projectId);
    this.db.transaction(() => {
      this.db
        .prepare('INSERT OR REPLACE INTO drafts VALUES(?,?,?)')
        .run(draft.projectId, draft.moduleId, JSON.stringify(draft));
      for (const key of ['characterIds', 'locationIds']) {
        const ids = draft.values[key];
        if (!Array.isArray(ids)) continue;
        for (const id of ids) {
          if (typeof id !== 'string') throw new Error('Invalid attachment');
          this.record(id);
          this.db
            .prepare('INSERT OR IGNORE INTO project_records VALUES(?,?)')
            .run(draft.projectId, id);
        }
      }
    })();
  }
  draft(projectId: string, moduleId: string): Draft | undefined {
    const row = this.db
      .prepare('SELECT data FROM drafts WHERE project_id=? AND module_id=?')
      .get(projectId, moduleId) as JsonRow | undefined;
    return row ? draftSchema.parse(JSON.parse(row.data)) : undefined;
  }
  movieTimeline(projectId: string): MovieTimeline {
    this.project(projectId);
    const row = this.db
      .prepare('SELECT data FROM movie_timelines WHERE project_id=?')
      .get(projectId) as JsonRow | undefined;
    return row ? movieTimelineSchema.parse(JSON.parse(row.data)) : emptyMovieTimeline(projectId);
  }
  saveMovieTimeline(value: MovieTimeline): MovieTimeline {
    const timeline = movieTimelineSchema.parse(value);
    this.project(timeline.projectId);
    const ids = new Set<string>();
    for (const clip of timeline.clips) {
      if (ids.has(clip.id)) throw new Error('Timeline clip IDs must be unique.');
      ids.add(clip.id);
      const asset = this.asset(clip.assetId);
      if (asset.projectId !== timeline.projectId)
        throw new Error('Timeline media must belong to this project.');
      if ((asset.kind === 'audio') !== (clip.track === 'audio'))
        throw new Error('Place audio on Audio 1 and images or video on Video 1.');
      if (
        asset.kind !== 'image' &&
        asset.media?.duration &&
        clip.sourceStart + clip.duration > asset.media.duration + 1 / timeline.fps
      )
        throw new Error('Timeline trim exceeds source media duration.');
    }
    this.db
      .prepare(
        'INSERT INTO movie_timelines VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET data=excluded.data',
      )
      .run(timeline.projectId, JSON.stringify(timeline));
    return timeline;
  }
  record(id: string): LibraryRecord {
    const row = this.db.prepare('SELECT data FROM records WHERE id=?').get(id) as
      JsonRow | undefined;
    if (!row) throw new Error('Attached library record no longer exists');
    return recordSchema.parse(JSON.parse(row.data));
  }
  saveRecord(value: LibraryRecord) {
    const record = recordSchema.parse(value);
    for (const id of record.assetIds) {
      if (this.asset(id).projectId !== null)
        throw new Error(
          'Reusable records need global library media. Import from this record editor.',
        );
    }
    this.db.transaction(() => {
      this.db
        .prepare('INSERT INTO records VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
        .run(record.id, JSON.stringify(record));
      this.db.prepare('DELETE FROM record_assets WHERE record_id=?').run(record.id);
      for (const id of record.assetIds)
        this.db.prepare('INSERT OR IGNORE INTO record_assets VALUES(?,?)').run(record.id, id);
    })();
    return record;
  }
  removeRecord(id: string) {
    for (const draft of this.rows<Draft>('drafts')) {
      if (
        ['characterIds', 'locationIds'].some(
          (key) =>
            Array.isArray(draft.values[key]) && (draft.values[key] as unknown[]).includes(id),
        )
      )
        throw new Error('Detach this record from project drafts before deleting it.');
    }
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM project_records WHERE record_id=?').run(id);
      this.db.prepare('DELETE FROM records WHERE id=?').run(id);
    })();
  }
  asset(id: string): Asset {
    const row = this.db.prepare('SELECT data FROM assets WHERE id=?').get(id) as
      JsonRow | undefined;
    if (!row) throw new Error('Asset not found');
    const asset: Asset = JSON.parse(row.data);
    if (asset.generationContext)
      asset.generationContext.available = existsSync(
        this.contextFile(asset.projectId, asset.generationContext.jobId),
      );
    return asset;
  }
  private contextFile(projectId: string | null, jobId: string) {
    if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId) || !/^[0-9a-f-]{36}$/i.test(jobId))
      throw new Error('Invalid managed generation context.');
    return path.join(this.root, 'contexts', projectId, `${jobId}.safetensors`);
  }
  contextPath(assetId: string) {
    const asset = this.asset(assetId);
    if (!asset.generationContext?.available)
      throw new Error('Saved H3 context is missing. Use trailing frames or regenerate the source.');
    return this.contextFile(asset.projectId, asset.generationContext.jobId);
  }
  async saveGenerationContext(job: Job, assets: Asset[], source: string) {
    const target = this.contextFile(job.projectId, job.id);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
    const context: NonNullable<Asset['generationContext']> = {
      format: 'h3-av/1',
      jobId: job.id,
      width: Number(job.snapshot.width),
      height: Number(job.snapshot.height),
      frames: Number(job.snapshot.renderFrames || job.snapshot.contextRenderFrames),
    };
    this.db.transaction(() => {
      for (const output of assets) {
        const asset = this.asset(output.id);
        if (asset.projectId !== job.projectId || asset.kind !== 'video')
          throw new Error('Context must belong to its generated video project.');
        this.db
          .prepare('UPDATE assets SET data=? WHERE id=?')
          .run(JSON.stringify({ ...asset, generationContext: context }), asset.id);
      }
    })();
  }
  saveMediaProbe(id: string, media: MediaProbe): Asset {
    const asset = { ...this.asset(id), media };
    this.db.prepare('UPDATE assets SET data=? WHERE id=?').run(JSON.stringify(asset), id);
    return asset;
  }
  saveImageDimensions(id: string, dimensions: { width: number; height: number }): Asset {
    const asset = { ...this.asset(id), dimensions };
    if (
      asset.kind !== 'image' ||
      ![dimensions.width, dimensions.height].every((value) => Number.isInteger(value) && value > 0)
    )
      throw new Error('Invalid image dimensions.');
    this.db.prepare('UPDATE assets SET data=? WHERE id=?').run(JSON.stringify(asset), id);
    return asset;
  }
  registerDerivation(
    childId: string,
    parentId: string,
    derivation: NonNullable<Asset['derivation']>,
  ): Asset {
    const child = this.asset(childId);
    const parent = this.asset(parentId);
    if (parent.projectId && child.projectId !== parent.projectId)
      throw new Error('Derived media must stay in the source project.');
    const asset = { ...child, parentAssetId: parentId, derivation };
    this.db.transaction(() => {
      this.db
        .prepare('INSERT INTO asset_derivations VALUES(?,?,?,?)')
        .run(childId, parentId, derivation.operation, JSON.stringify(derivation));
      this.db.prepare('UPDATE assets SET data=? WHERE id=?').run(JSON.stringify(asset), childId);
    })();
    return asset;
  }
  assetPath(id: string) {
    const row = this.db.prepare('SELECT file FROM assets WHERE id=?').get(id) as
      { file: string } | undefined;
    if (!row) throw new Error('Asset not found');
    const resolved = path.resolve(this.root, row.file);
    if (!resolved.startsWith(path.resolve(this.root) + path.sep))
      throw new Error('Invalid managed asset path');
    return resolved;
  }
  async importFile(
    source: string,
    projectId: string | null,
    displayName = path.basename(source),
  ): Promise<Asset> {
    if (projectId) this.project(projectId);
    const extension = path.extname(displayName).toLowerCase();
    const type = mediaTypes[extension];
    if (!type) throw new Error('Unsupported media type');
    const stat = await fs.stat(source);
    if (!stat.isFile() || stat.size > 4 * 1024 ** 3)
      throw new Error('Choose a media file smaller than 4 GB');
    const id = randomUUID();
    const relative = path.join('media', projectId || 'library', id + extension);
    const target = path.join(this.root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
    const asset: Asset = {
      id,
      projectId,
      name: displayName,
      kind: type[0],
      mime: type[1],
      url: `oyama://media/${id}`,
      createdAt: new Date().toISOString(),
    };
    try {
      this.db
        .prepare('INSERT INTO assets VALUES(?,?,?,?)')
        .run(id, projectId, relative, JSON.stringify(asset));
    } catch (error) {
      await fs.unlink(target);
      throw error;
    }
    return asset;
  }
  async promoteAsset(id: string): Promise<Asset> {
    const asset = this.asset(id);
    if (asset.projectId === null) return asset;
    return this.importFile(this.assetPath(id), null, asset.name);
  }
  async promoteAssetToRecord(
    id: string,
    kind: LibraryRecord['kind'],
  ): Promise<{ asset: Asset; record: LibraryRecord }> {
    const asset = await this.promoteAsset(id);
    const baseName = path.parse(asset.name).name.trim().slice(0, 100);
    const record: LibraryRecord = {
      id: randomUUID(),
      kind,
      name: baseName || (kind === 'character' ? 'New Character' : 'New Location'),
      description: '',
      assetIds: [asset.id],
    };
    return { asset, record: this.saveRecord(record) };
  }
  saveJob(job: Job) {
    const { preview: _preview, ...persisted } = job;
    this.db
      .prepare('INSERT INTO jobs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
      .run(job.id, job.projectId, JSON.stringify(persisted));
  }
  jobs() {
    return this.rows<Job>('jobs');
  }
  close() {
    this.db.close();
  }
}
