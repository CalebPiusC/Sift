import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const read = (file) => readFile(file, 'utf8');

test('API template documents every Settings field, including intentionally unset optional rates', async () => {
  const source = await read('api/app/config.py');
  const fields = [...source.matchAll(/^    ([a-z][a-z0-9_]*):/gm)].map((m) => m[1].toUpperCase());
  const template = await read('api/.env.example');
  for (const field of fields)
    assert.match(template, new RegExp(`^(?:# )?${field}=`, 'm'), `${field} documented`);
  assert.match(template, /^PIPELINE_ENABLED=false$/m);
  assert.match(template, /^DATABASE_URL=postgresql:\/\/selvora_pipeline:/m);
});

test('sample frontend template needs no account and all app env reads are documented', async () => {
  const template = await read('web/.env.example');
  for (const name of [
    'DATA_MODE',
    'API_ORIGIN',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ])
    assert.match(template, new RegExp(`^${name}=`, 'm'));
  assert.match(template, /^DATA_MODE=mock$/m);
  assert.match(template, /^NEXT_PUBLIC_SUPABASE_URL=$/m);
  assert.match(template, /^NEXT_PUBLIC_SUPABASE_ANON_KEY=$/m);
});

test('only template env files are tracked; real env variants are ignored at all app levels', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0');
  assert.deepEqual(
    files.filter(
      (p) => /(^|\/)\.env(?:\.|$)/.test(p) && !p.endsWith('/.env.example') && p !== '.env.example',
    ),
    [],
  );
  for (const dir of ['', 'api/', 'web/', 'nested/app/']) {
    for (const name of ['.env', '.env.local', '.env.production', '.env.production.local'])
      execFileSync('git', ['check-ignore', '--no-index', '-q', dir + name]);
  }
});

test('environment templates contain blank credentials, not usable keys', async () => {
  for (const file of ['.env.example', 'api/.env.example', 'web/.env.example']) {
    const text = await read(file);
    assert.doesNotMatch(
      text,
      /-----BEGIN .*PRIVATE KEY|\b(?:sk_live|sk_test|sb_secret)_[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9_-]+\.eyJ/,
    );
    for (const line of text.split('\n')) {
      const match = line.match(/^([A-Z_]*(?:KEY|SECRET|TOKEN|PEPPER|BEARER))=(.*)$/);
      if (match) assert.equal(match[2], '', `${file}: ${match[1]} must be blank`);
    }
  }
});

test('sensitive paths assign repository owner and contribution guides distinguish required branch settings', async () => {
  const owners = await read('.github/CODEOWNERS');
  for (const path of [
    '/supabase/',
    '/api/app/auth.py',
    '/api/app/commerce/',
    '/api/app/billing/',
    '/api/app/replies/',
    '/.github/',
  ])
    assert.ok(owners.includes(`${path} @CalebPiusC`), path);
  const guide = await read('CONTRIBUTING.md');
  assert.match(guide, /Require review from Code Owners/);
  assert.match(guide, /self-approval/);
  assert.match(await read('.github/pull_request_template.md'), /What is real vs sample/);
  assert.match(await read('README.md'), /## Getting started in 30 minutes/);
});
