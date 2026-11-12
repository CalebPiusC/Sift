# Native PostgreSQL harness validation

The harness previously released pooled clients without awaiting their socket shutdown. It now owns explicit pg.Client connections, including the query connection, with error listeners installed before connecting. Every end() is awaited before stopping PostgreSQL; recorded connection errors fail the after hook rather than being swallowed.

Acquisition, transaction setup and all 24 receipt tasks are drained even on failure. Nested finally blocks prevent rollback failure from bypassing cleanup. Receipt promise rejections are observed during lock polling and still propagated by Promise.all.

All five assertion calls were verified byte-for-byte unchanged using the TypeScript AST. The 24 lock waiters, vendor lock, 10-second polling deadline and 20-second statement timeout are unchanged. No skips, retries or timeout changes.

## Local results

Node v22.22.3. Twenty consecutive executions of `node --test tests/native-postgres.test.mjs`, each with a fresh real cluster:

| Run | Passed | Failed | Duration (ms) |
| --- | --- | --- | --- |
| 1 | 2 | 0 | 2972.063651 |
| 2 | 2 | 0 | 2868.676148 |
| 3 | 2 | 0 | 3115.751098 |
| 4 | 2 | 0 | 3054.441121 |
| 5 | 2 | 0 | 2896.726671 |
| 6 | 2 | 0 | 3076.307518 |
| 7 | 2 | 0 | 3035.884155 |
| 8 | 2 | 0 | 3130.208251 |
| 9 | 2 | 0 | 3099.873064 |
| 10 | 2 | 0 | 3316.323529 |
| 11 | 2 | 0 | 3223.632065 |
| 12 | 2 | 0 | 3037.119185 |
| 13 | 2 | 0 | 3176.053185 |
| 14 | 2 | 0 | 3139.25703 |
| 15 | 2 | 0 | 3052.763477 |
| 16 | 2 | 0 | 3100.236865 |
| 17 | 2 | 0 | 3090.840943 |
| 18 | 2 | 0 | 3063.460362 |
| 19 | 2 | 0 | 3152.469582 |
| 20 | 2 | 0 | 3122.686786 |

Limited-core run: `taskset -c 0 node --test tests/native-postgres.test.mjs`: 2 passed, 0 failed, 0 skipped/cancelled, 2368.076192 ms. CPU affinity is inherited by PostgreSQL and the child runner, limiting all 24 contenders to one logical CPU.

Local success is not CI acceptance. GitHub push and pull_request results are reported separately for the pushed commit.
