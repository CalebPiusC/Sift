import { readFile, writeFile } from 'node:fs/promises';
export async function matrixDoc() {
  const matrix = JSON.parse(await readFile('docs/backend/role-matrix.json', 'utf8'));
  return (
    '# B0 table role matrix\n\nAuthoritative executable permissions: `role-matrix.json`; enforced by SQL policies AND grants. R=SELECT, I=INSERT, U=UPDATE, D=DELETE; —=denied. Every table × role × operation has a real SQL test (' +
    Object.keys(matrix).length * 16 +
    ' cases). All roles are tenant scoped; anonymous access is denied. Service means `selvora_service`, NOT Supabase `service_role`.\n\n| Table | Owner | Manager | Agent | Service | Notes |\n|---|---|---|---|---|---|\n' +
    Object.entries(matrix)
      .map(
        ([t, r]) =>
          `| ${t} | ${r.owner || '—'} | ${r.manager || '—'} | ${r.agent || '—'} | ${r.service || '—'} | ${r.note} |`,
      )
      .join('\n') +
    '\n\nHuman roles are active vendor_members resolved from auth.uid(), never editable JWT role claims. Member preferences/read markers/notifications are restricted to the caller’s own membership. A table write denied to a human may be performed by an authorized API transaction under the scoped service role; that is not a direct browser grant. Endpoint authorization is a separate required layer, specified in backend-roadmap.md.\n\nExisting controlled RPC exceptions: onboard_vendor creates a tenant/owner/config atomically; legacy confirm_vendor_payment and issue_receipt browser execution is revoked by B4 migration007; use the authorized payment-confirmation and receipt APIs instead. Receipt, event, payment, stock ledger, usage ledger and audit rows reject UPDATE/DELETE even for the bounded service role. DELETE is intentionally absent on core business records; use status/archive/retention design instead.\n\nDo not give authenticated, anon or service_role membership in selvora_service. A dedicated server login must be NOINHERIT/NOBYPASSRLS and explicitly SET LOCAL ROLE selvora_service plus SET LOCAL app.vendor_id per transaction after authorization. SQL validates the selected tenant on every row. Supabase’s bypass key has table privileges revoked; hosted owner/superuser can always alter security and is not an application role.\n'
  );
}
if (process.argv[1]?.endsWith('write-role-matrix.mjs'))
  await writeFile('docs/backend/role-matrix.md', await matrixDoc());
