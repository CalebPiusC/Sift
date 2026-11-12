import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { nativeDatabase } from './helpers/native-database.mjs';
import { b0Fixture } from './b0-fixtures.mjs';

test('S1 settings API uses restricted PostgreSQL with tenant/member isolation and safe retries', async () => {
  const server = await nativeDatabase();
  try {
    await server.pool.query(await readFile('tests/bootstrap.sql', 'utf8'));
    for (const file of (await readdir('supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await server.pool.query(await readFile(`supabase/migrations/${file}`, 'utf8'));
    const matrix = JSON.parse(await readFile('docs/backend/role-matrix.json', 'utf8'));
    const own = await b0Fixture(server.pool, matrix);
    const other = await b0Fixture(server.pool, matrix);
    const uninitialized = { vendor: randomUUID(), member: randomUUID() };
    await server.pool.query(
      "INSERT INTO vendors(id,vendor_id,business_name,business_type,tone) VALUES($1,$1,'Uninitialized fixture','products','friendly')",
      [uninitialized.vendor],
    );
    await server.pool.query(
      "INSERT INTO vendor_members(id,vendor_id,user_id,role) VALUES($1,$2,$3,'owner')",
      [uninitialized.member, uninitialized.vendor, own.users.owner],
    );
    await server.pool.query(
      'CREATE ROLE s1_runner LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS; GRANT selvora_service TO s1_runner',
    );
    const result = await promisify(execFile)('.venv/bin/python', ['tests/helpers/s1-settings.py'], {
      env: {
        ...process.env,
        PYTHONPATH: 'api',
        B2_FIXTURE: JSON.stringify({ own, other, uninitialized }),
        DATABASE_URL: `postgresql://s1_runner@127.0.0.1:${server.pool.options.port}/postgres`,
      },
      timeout: 60000,
    });
    console.log(result.stdout);
  } finally {
    await server.close();
  }
});
