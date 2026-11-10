import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPublicEnv, checkSource, checkBrowserEnv } from '../scripts/check-browser-env.mjs';
test('only public Supabase configuration can be bundled', async () => {
  await checkBrowserEnv('web', {});
  checkPublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-key',
  });
  for (const name of [
    'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_PAYSTACK_SECRET_KEY',
    'NEXT_PUBLIC_GEMINI_API_KEY',
  ]) {
    assert.throws(() => checkPublicEnv({ [name]: 'secret' }), /Forbidden/);
    assert.throws(() => checkSource(`process.env.${name}`, 'client.tsx'), /Forbidden/);
  }
});
test('server keys cannot hide under the allowed anon key name or next.config env', () => {
  const jwt = `e30.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.sig`;
  for (const key of [jwt, 'sb_secret_private'])
    assert.throws(
      () => checkPublicEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: key }),
      /Server credential/,
    );
  assert.throws(
    () =>
      checkPublicEnv({
        GEMINI_API_KEY: 'private-gemini',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'private-gemini',
      }),
    /copied/,
  );
  assert.throws(
    () => checkSource('const x=process.env.GEMINI_API_KEY', 'client.tsx'),
    /Server-secret/,
  );
  assert.throws(
    () => checkSource('export default {env:process.env}', 'next.config.ts'),
    /injection/,
  );
});
test('actual Next production build fails before compiling a forbidden public secret', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  await assert.rejects(
    promisify(execFile)('npm', ['run', 'build', '-w', 'web'], {
      env: { ...process.env, NEXT_PUBLIC_GEMINI_API_KEY: 'synthetic-must-not-bundle' },
      timeout: 30000,
    }),
    (error) =>
      error.code !== 0 &&
      error.stderr.includes('Forbidden public environment variable: NEXT_PUBLIC_GEMINI_API_KEY'),
  );
});
