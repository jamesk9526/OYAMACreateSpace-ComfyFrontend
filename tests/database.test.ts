import { expect, it } from 'vitest';
import { buildSync } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

it('upgrades v4 lineage without losing existing rows and accepts Ripple derivations', () => {
  const require = createRequire(import.meta.url);
  const root = path.resolve('artifacts/unit-migrations', randomUUID());
  fs.mkdirSync(root, { recursive: true });
  const bundle = path.join(root, 'database.cjs');
  buildSync({
    entryPoints: ['electron/main/database.ts'],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['better-sqlite3'],
  });
  const script = `
    const assert = require('node:assert/strict');
    const { Store } = require(${JSON.stringify(bundle)});
    const root = ${JSON.stringify(root)};
    let store = new Store(root);
    const project = store.db.prepare('SELECT id FROM projects LIMIT 1').get().id;
    for (const id of ['source', 'old', 'new']) store.db.prepare('INSERT INTO assets VALUES(?,?,?,?)').run(id, project, id + '.mp4', JSON.stringify({ id, projectId: project }));
    store.db.exec("DROP TABLE movie_timelines; ALTER TABLE asset_derivations RENAME TO asset_derivations_v5; CREATE TABLE asset_derivations(asset_id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,parent_asset_id TEXT NOT NULL REFERENCES assets(id),operation TEXT NOT NULL CHECK(operation IN ('frame','clip','continue')),data TEXT NOT NULL); DROP TABLE asset_derivations_v5; PRAGMA user_version=4;");
    const old = JSON.stringify({ operation: 'continue', jobId: 'existing-job', start: 0, end: 3 });
    store.db.prepare('INSERT INTO asset_derivations VALUES(?,?,?,?)').run('old', 'source', 'continue', old);
    store.close();
    store = new Store(root);
    assert.equal(store.db.pragma('user_version', { simple: true }), 6);
    assert.equal(store.db.prepare('SELECT data FROM asset_derivations WHERE asset_id=?').get('old').data, old);
    store.db.prepare('INSERT INTO asset_derivations VALUES(?,?,?,?)').run('new', 'source', 'ripple', JSON.stringify({ operation: 'ripple' }));
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM asset_derivations').get().n, 2);
    assert.deepEqual(store.db.pragma('foreign_key_check'), []);
    assert.throws(() => store.db.prepare('UPDATE asset_derivations SET operation=? WHERE asset_id=?').run('invalid', 'new'), /CHECK constraint/);
    const movieAssetId = require('node:crypto').randomUUID();
    const movieClipId = require('node:crypto').randomUUID();
    store.db.prepare('INSERT INTO assets VALUES(?,?,?,?)').run(movieAssetId, project, 'movie.mp4', JSON.stringify({ id: movieAssetId, projectId: project, kind: 'video' }));
    const timeline = { projectId: project, fps: 24, snap: true, clips: [{ id: movieClipId, assetId: movieAssetId, track: 'video', start: 1.25, duration: 3.5, sourceStart: 0, volume: 1, muted: false, locked: false }] };
    store.saveMovieTimeline(timeline);
    assert.deepEqual(store.movieTimeline(project), timeline);
    assert.throws(() => store.saveMovieTimeline({ ...timeline, clips: [{ ...timeline.clips[0], track: 'audio' }] }), /Place audio/);
    store.close();
    console.log('v4 lineage retained; Ripple accepted; foreign keys and operation checks intact');
  `;
  const output = execFileSync(require('electron'), ['-e', script], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    windowsHide: true,
  });
  expect(output).toContain('v4 lineage retained');
});
