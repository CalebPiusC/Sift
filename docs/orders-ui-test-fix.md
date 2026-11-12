# Orders UI test timing investigation

## Baseline

On 2026-11-10 fetched latest main, SHA `71e161c70121281ef96c79341181672b47bcb16d`, exported it with `git archive` to a clean directory outside this checkout, and installed dependencies independently with `npm ci`.

Same default command: `npm run test -w web -- tests/orders-ui.test.tsx`.
Result: 2 passed, 2 failed in 13.55s: lifecycle exceeded 5000ms; restock could not find its button. Both are pre-existing on main, not introduced by S0.

## Causes and controlled experiments

These are test-harness timing failures, not evidence of a missing restock feature or broken stock calculation.

- Lifecycle: the sample client's `run` deliberately sleeps 100ms for every resource load and mutation. The lifecycle test chains many mutations and revision-triggered reloads while querying a large document with duplicate responsive order lists. With only artificial client latency removed, all four original test flows passed; lifecycle took 2805ms under the unchanged 5000ms limit. No domain method or assertion was stubbed.
- Restock: the original test also failed when run alone, ruling out interference from the first timeout. An intermediate inspection found the stock region present but still displaying `Loading workspace…`. Waiting on a document-wide `findByRole` for Restock was fragile while the paid-order/catalogue loads settled. Narrowing the query to the stock region alone made the isolated test pass **with the original 100ms client latency**, in 3729ms. Thus the missing button error was a timing/query-scope problem, not an unavailable action. The region-scoped wait first awaits the paid-order stock region, then awaits its button.

## Fix

The test file partially wraps only the sample client factory with `latencyMs: 0`, its existing supported option. The real DataProvider, subscriptions, async promises, seed data, payment/stock/revision logic, receipts, and React rendering remain in use. Production code and default sample latency are unchanged. Restock queries are scoped to their owning stock region. All original assertions are retained, including variant stock 1→6, total stock 9, payment verification, receipt immutability and delivery lifecycle.

No timeout increases, configuration changes, removed tests, permanent skips, or retries. Isolated diagnostic commands used Vitest's `-t` selection only; the acceptance runs below ran everything.

## Acceptance validation

Three consecutive, unmodified `npm run test -w web` executions:

| Run | Files | Tests | Duration |
| --- | --- | --- | --- |
| 1 | 19 passed | 125 passed | 67.44s |
| 2 | 19 passed | 125 passed | 65.29s |
| 3 | 19 passed | 125 passed | 67.55s |

Also passed: `npm run typecheck -w web`, `npm run test:security`, `git diff --check`. Diagnostics were restored byte-for-byte to the validated final test file. These checks do not establish live-provider or launch readiness; S1/S2 remain unimplemented.
