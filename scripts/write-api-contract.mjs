import { readFile, writeFile } from 'node:fs/promises';
export async function contractDeclarations() {
  const types = await readFile('web/lib/data/types.ts', 'utf8');
  const interfaces = await readFile('web/lib/data/contract.ts', 'utf8');
  const settings = await readFile('web/lib/data/settings-types.ts', 'utf8');
  const catalogue = await readFile('web/lib/data/catalogue-types.ts', 'utf8');
  return `<!-- generated-contract:start -->\n\n### Types\n\n\`\`\`ts\n${types.trim()}\n\`\`\`\n\n### Interfaces\n\n\`\`\`ts\n${interfaces.trim()}\n\`\`\`\n\n### Catalogue additions\n\n\`\`\`ts\n${catalogue.trim()}\n\`\`\`\n\n### Settings additions\n\n\`\`\`ts\n${settings.trim()}\n\`\`\`\n\n<!-- generated-contract:end -->`;
}
if (process.argv[1]?.endsWith('write-api-contract.mjs')) {
  const file = 'docs/api-contract.md';
  const doc = await readFile(file, 'utf8');
  await writeFile(
    file,
    doc.replace(
      /<!-- generated-contract:start -->[\s\S]*?<!-- generated-contract:end -->/,
      await contractDeclarations(),
    ),
  );
}
