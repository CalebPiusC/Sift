# Contributing to Selvora

Start with [Getting started in 30 minutes](README.md#getting-started-in-30-minutes).
You can run the sample workspace without accounts, Docker, API credentials or
provider access. Sample data is fictional and changes reset on refresh.

## Local setup

Use Node 22.12+ (Node 22 LTS recommended), npm, Python 3.11+ and Git. Run commands
from the repository root unless shown otherwise:

```sh
npm ci
python3 -m venv .venv
# macOS/Linux:
. .venv/bin/activate
# PowerShell alternative: .venv\Scripts\Activate.ps1
python -m pip install -e './api[test]'
cp web/.env.example web/.env.local
npm run dev
```

Open http://localhost:3000. Leave `DATA_MODE=mock` and the Supabase fields empty.
PowerShell: use `Copy-Item` instead of `cp` if needed. The API and Docker are
optional for sample mode; see README for their separate setup. Never reuse
production credentials or copy production customer data into fixtures.

## Ownership, branches and pull requests

- Agree on **one owner per phase** before coding. Record owner, scope and shared
  file changes in the issue. See [working with two people](docs/working-with-two-people.md).
- Use **one task branch and one PR per phase**, with focused commits. Suggested
  branch format: `phase-name/short-description`, e.g. `b7-extras/notification-history`
  or `contributor-setup/onboarding`. Do not combine unrelated phases in one PR.
- Arena-managed sessions are an exception to the naming convention: their
  `arena/...` branch is fixed. Do not rename it or create/switch branches in that
  session; use a descriptive PR title instead.
- Fetch before starting and before pushing. Never force-push or rewrite shared
  branch history. If another person pushed conflicting changes, stop and agree
  how to integrate them; do not overwrite their work.
- Open against `main`; link the phase issue and request the relevant reviewer.
  Keep secrets, generated backups and private acceptance evidence out of Git.
- Do not merge with failing checks. Review failure logs and fix or explicitly
  resolve their cause with the owner; a passing sample demo is not live acceptance.

## Tests and checks

With the virtual environment activated:

```sh
npm run test:contributor-setup
npm run test:all
npm run build
(cd api && python -m pytest -q && ruff check . && ruff format --check .)
# Pipeline, payment, kill-switch or operational changes:
npm run test:readiness
```

`test:all` does not replace Python/native pipeline readiness tests. Native database
checks use disposable local clusters; they need no hosted account. Use Linux/WSL2
for the full Redis/native PostgreSQL/restore suite; the restore fixture is
Linux-specific. For frontend-only checks, `npm test` and `npm run typecheck` are
useful quick checks, not substitutes for CI.

For visual changes, run the relevant `test:ui`/`test:layout` commands against a
running sample production build; see [responsive layout](docs/responsive-layout.md).
Record commands, results and any checks you could not run in the PR.

When changing contracts or schema, regenerate and inspect the appropriate docs:

```sh
npm run docs:contract
npm run docs:backend
```

Do not edit an already-applied migration: add a new ordered migration, coordinate
its filename, test blank and upgrade paths, and update the permission matrix and
fixtures when necessary. Do not reset a colleague's or hosted database.

## Commit messages

Use small commits with an imperative subject:

```text
docs(contributing): explain sample setup
feat(extras): persist notification read state
fix(payments): reject mismatched webhook amounts
test(replies): cover impersonation requests
```

Format: `type(scope): short description`; types include `feat`, `fix`, `docs`,
`test`, `refactor`, `chore`, `ci`. Add a body for the reason, migration/rollback
impact and limitations. Reference the issue/phase. Never put tokens, customer
identities, private message text or provider payloads in commit messages.

## PR checklist

- [ ] One phase, named owner, linked issue and clear scope.
- [ ] Tests pass; list exact commands/results and any unrun/live checks.
- [ ] No secrets, real `.env` files, PII, backups or private evidence in the diff.
- [ ] Docs and applicable environment templates/generated inventories updated.
- [ ] Explicit **what is real vs sample** and what remains unverified.
- [ ] Tenant/role, webhook, payment and reply safety behavior preserved/tested.
- [ ] Migration/rollout/rollback notes included when applicable.
- [ ] Code-owner review obtained for sensitive files; no failing required checks.

## Required reviews: repository owner action

`.github/CODEOWNERS` assigns `@CalebPiusC` to migrations, security-sensitive
backend code, payments/billing and the reply engine. CODEOWNERS alone does not
block merging. After this PR is merged, the repository owner must configure a
branch rule/ruleset for `main` in **Settings → Rules → Rulesets** (or branch
protection):

1. Require a pull request before merging and at least one approval.
2. Enable **Require review from Code Owners**.
3. Dismiss stale approvals when new commits are pushed and require checks to pass.
4. Block force pushes/deletions and restrict bypasses, including administrators
   if that is the intended policy. Verify the rule with the second contributor.

Keep the CODEOWNERS file on the base branch and retain the owner's write access.
GitHub does not allow self-approval; owner-authored sensitive changes need another
trusted reviewer/co-owner under an agreed policy, not a pretend owner approval.
Branch settings could not be inspected in this session (HTTP 403); enforcement
has not been verified or enabled by this PR.
