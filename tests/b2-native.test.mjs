import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { nativeDatabase } from './helpers/native-database.mjs';
import { b0Fixture } from './b0-fixtures.mjs';

test('B2 PostgreSQL + Redis: tenant APIs, duplicate history and worker kill/restart', async () => {
  const server = await nativeDatabase();
  try {
    await server.pool.query(await readFile('tests/bootstrap.sql', 'utf8'));
    for (const f of (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort())
      await server.pool.query(await readFile(`supabase/migrations/${f}`, 'utf8'));
    const matrix = JSON.parse(await readFile('docs/backend/role-matrix.json', 'utf8'));
    const own = await b0Fixture(server.pool, matrix);
    const other = await b0Fixture(server.pool, matrix);
    await server.pool.query(
      'CREATE ROLE b2_runner LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS; GRANT selvora_service TO b2_runner',
    );
    const result = await promisify(execFile)('.venv/bin/python', ['tests/helpers/b2-runtime.py'], {
      env: {
        ...process.env,
        PYTHONPATH: 'api',
        B2_FIXTURE: JSON.stringify({ own, other }),
        DATABASE_URL: `postgresql://b2_runner@127.0.0.1:${server.pool.options.port}/postgres`,
      },
      timeout: 60000,
    });
    console.log(result.stdout);
  } finally {
    await server.close();
  }
});
