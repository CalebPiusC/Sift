import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
export async function nativeDatabase() {
  const dir = await mkdtemp(path.join(tmpdir(), 'selvora-b0-'));
  const server = net.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const bin = await import(`@embedded-postgres/${platform}-${process.arch}`);
  let running = false;
  try {
    execFileSync(
      bin.initdb,
      ['-D', dir, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C'],
      { stdio: 'pipe' },
    );
    execFileSync(
      bin.pg_ctl,
      [
        '-D',
        dir,
        '-l',
        path.join(dir, 'server.log'),
        '-o',
        `-p ${port} -c listen_addresses=127.0.0.1 -c log_min_error_statement=panic -c log_parameter_max_length_on_error=0`,
        '-w',
        'start',
      ],
      { stdio: 'pipe' },
    );
    running = true;
    const pool = new pg.Pool({
      host: '127.0.0.1',
      port,
      user: 'postgres',
      database: 'postgres',
      max: 8,
    });
    return {
      pool,
      async close() {
        await pool.end();
        execFileSync(bin.pg_ctl, ['-D', dir, '-m', 'fast', '-w', 'stop'], { stdio: 'pipe' });
        await rm(dir, { recursive: true, force: true });
      },
    };
  } catch (e) {
    if (running)
      execFileSync(bin.pg_ctl, ['-D', dir, '-m', 'fast', '-w', 'stop'], { stdio: 'pipe' });
    await rm(dir, { recursive: true, force: true });
    throw e;
  }
}
export function recovering(client) {
  return {
    query: async (sql, params) => {
      await client.query('savepoint b0_statement');
      try {
        const r = await client.query(sql, params);
        await client.query('release savepoint b0_statement');
        return r;
      } catch (e) {
        await client.query('rollback to savepoint b0_statement');
        await client.query('release savepoint b0_statement');
        throw e;
      }
    },
  };
}
export const migrationBody = (s) => s.replace(/^begin;\s*/, '').replace(/commit;\s*$/, '');
