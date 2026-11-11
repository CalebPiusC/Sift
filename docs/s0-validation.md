# S0 validation record

This record accompanies the [status matrix](status-matrix.md). Source tests are
coverage evidence, not proof of a hosted/live-provider run or release approval.

## Baseline observed before S0

The contributor-setup phase ran `npm run test:all`: 123 frontend tests passed and
2 failed in `web/tests/orders-ui.test.tsx` (five-second order-flow timeout and a
later missing Restock button). A single-worker retry also failed. The subsequent
separately executed database/native/PWA/security/typecheck/contract/backend suites
and production build passed. Do not claim the baseline full suite is green.

## S0 checks

Executed for S0:

- Editable API install: initially failed (setuptools discovered app + evals). Added
  explicit app-only package discovery; `.venv/bin/pip install -e './api[test]'`
  then succeeded. This fixes the documented local setup, not a product feature.
- `npm run test:inventory`: 4 documentation/coverage checks passed (also included
  in the backend suite).
- `npm run test:backend`: **835/835 passed** after correcting the manifest test
  for the existing read-only POST receipt resolver (no state mutation/key required).
- `PATH="$PWD/.venv/bin:$PATH" npm run test:readiness`: **138 Python tests + 2
  native acceptance/restore tests passed**. Provider boundaries remain fake.
- `npm run test:security`: **8/8 passed**; `npm run test:contract` passed.
- `.venv/bin/ruff check api` and format check passed; `npm run build` passed.
- Diagnostic frontend rerun with `--maxWorkers=1 --testTimeout=15000`: **124/125
  passed, 1 failed** (variant restock UI could not find Restock button). The normal
  test timeout/config was NOT changed to hide failures. Full suite remains red.
- `git diff --check` passed. Production/live-provider acceptance was not attempted.

 No provider
accounts/credentials or customer data are used. Native demos use real disposable
PostgreSQL/Redis and mocked provider boundaries; a cold physical restore is not
hosted PITR or the deployed backup scripts.

S0's reproducibility test checks exact route inventory, generated matrix coverage,
status values, referenced source files and conservative live/release columns.
Neither static route existence nor this documentation check exercises S1/S2.
