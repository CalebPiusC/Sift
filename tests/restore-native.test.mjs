import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { b0Fixture } from './b0-fixtures.mjs';

test('cold physical backup restores full schema, receipts and encrypted records into isolated cluster', async () => {
  const bin = await import(`@embedded-postgres/linux-${process.arch}`);
  const root = await mkdtemp(path.join(tmpdir(), 'sift-restore-'));
  const source = path.join(root, 'source'),
    backup = path.join(root, 'backup'),
    restored = path.join(root, 'restored');
  const socket = net.createServer();
  await new Promise((r) => socket.listen(0, '127.0.0.1', r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  const command = (file, args) => execFileSync(file, args, { stdio: 'pipe' });
  const start = (dir) =>
    command(bin.pg_ctl, [
      '-D',
      dir,
      '-l',
      path.join(root, 'server.log'),
      '-o',
      `-p ${port} -c listen_addresses=127.0.0.1 -c log_min_error_statement=panic -c log_parameter_max_length_on_error=0`,
      '-w',
      'start',
    ]);
  const stop = (dir) => command(bin.pg_ctl, ['-D', dir, '-m', 'fast', '-w', 'stop']);
  let live;
  let db;
  try {
    command(bin.initdb, [
      '-D',
      source,
      '-U',
      'postgres',
      '--auth=trust',
      '--encoding=UTF8',
      '--locale=C',
    ]);
    start(source);
    live = source;
    db = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' });
    await db.connect();
    await db.query(await readFile('tests/bootstrap.sql', 'utf8'));
    for (const f of (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort())
      await db.query(await readFile('supabase/migrations/' + f, 'utf8'));
    const matrix = JSON.parse(await readFile('docs/backend/role-matrix.json', 'utf8'));
    const fixture = await b0Fixture(db, matrix);
    // Snapshot is taken only after stopping writes and all worker/provider activity.
    await db.query('select b9_global_pause(true)');
    const before = (
      await db.query('select count(*)::int n,sum(total_kobo)::text total from receipts')
    ).rows[0];
    const ciphertext = (
      await db.query('select ciphertext from channel_tokens where vendor_id=$1', [fixture.vendor])
    ).rows[0].ciphertext;
    await db.end();
    db = null;
    stop(source);
    live = null;
    await cp(source, backup, { recursive: true });
    await cp(backup, restored, { recursive: true });
    start(restored);
    live = restored;
    db = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' });
    await db.connect();
    assert.deepEqual(
      (await db.query('select count(*)::int n,sum(total_kobo)::text total from receipts')).rows[0],
      before,
    );
    assert.deepEqual(
      (await db.query('select ciphertext from channel_tokens where vendor_id=$1', [fixture.vendor]))
        .rows[0].ciphertext,
      ciphertext,
    );
    await db.query('set role selvora_service');
    await db.query("select set_config('app.vendor_id',$1,false)", [fixture.vendor]);
    assert.equal(
      (await db.query('select b9_ai_paused($1) paused', [fixture.vendor])).rows[0].paused,
      true,
    );
    assert.equal((await db.query('select count(*)::int n from customers')).rows[0].n, 1);
    await db.query("select set_config('app.vendor_id','',false)");
    assert.equal((await db.query('select count(*)::int n from customers')).rows[0].n, 0);
  } finally {
    if (db) await db.end();
    if (live) stop(live);
    await rm(root, { recursive: true, force: true });
  }
});
