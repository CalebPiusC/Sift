import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const allowed = new Set(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']);
const serverSecret = /(SERVICE_ROLE|PAYSTACK.*SECRET|GEMINI.*KEY|GOOGLE.*API_KEY|SUPABASE_SECRET)/i;
export function checkPublicEnv(env) {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('NEXT_PUBLIC_')) continue;
    if (!allowed.has(name)) throw new Error(`Forbidden public environment variable: ${name}`);
    if (!value) continue;
    let role;
    try {
      role = JSON.parse(Buffer.from(value.split('.')[1] || '', 'base64url').toString()).role;
    } catch {}
    if (value.startsWith('sb_secret_') || role === 'service_role')
      throw new Error(`Server credential supplied as ${name}`);
    for (const [secretName, secretValue] of Object.entries(env)) {
      if (
        serverSecret.test(secretName) &&
        secretValue &&
        secretValue.length >= 8 &&
        secretValue === value
      )
        throw new Error(`Server credential copied into ${name}`);
    }
  }
}
export function checkSource(text, label) {
  for (const match of text.matchAll(/\bNEXT_PUBLIC_[A-Z0-9_]+\b/g)) {
    if (!allowed.has(match[0]))
      throw new Error(`Forbidden public environment reference in ${label}: ${match[0]}`);
  }
  // Secrets belong in /api, not web modules. This also catches computed string references.
  if (serverSecret.test(text)) throw new Error(`Server-secret reference in ${label}`);
  if (label.includes('next.config') && /\benv\s*:/.test(text))
    throw new Error('next.config env injection is forbidden; use the public allowlist');
}
export async function checkBrowserEnv(root, env = process.env) {
  checkPublicEnv(env);
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (['node_modules', '.next', 'tests'].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) || entry.name.startsWith('.env')) {
        checkSource(await readFile(file, 'utf8'), path.relative(root, file));
      }
    }
  }
  await walk(root);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkBrowserEnv(path.resolve('web'))
    .then(() => console.log('Browser environment allowlist passed.'))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
