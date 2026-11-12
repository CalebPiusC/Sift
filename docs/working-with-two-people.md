# Working with two people

## Three rules

1. **One owner per phase.** The owner integrates the phase, maintains its issue
   checklist and opens its one PR. The other contributor reviews or takes a
   separately scoped phase. Pairing is welcome; simultaneous ownership is not.
2. **One branch per task.** Use `phase-name/short-description`. Do not share a
   working branch or mix unrelated phases. Arena sessions keep their assigned
   `arena/...` branch; do not rename/switch it to satisfy this naming convention.
3. **One PR per phase.** If a phase is too large, agree on separately named,
   independently reviewable subphases before splitting work. Never open two
   competing implementations of the same phase.

## Before starting

- Pull/fetch the latest `main` in your own clone. Outside Arena, create your task
  branch from that base. Inside Arena, use the assigned branch only.
- Put the owner, acceptance criteria, dependencies and planned shared-file edits
  in the issue. Make clear what is live, local-only or sample behavior.
- Agree ownership of hotspots: `api/app/main.py`, config/env templates, contracts,
  generated docs, package locks, migrations and common UI components.
- If your work needs the other person's unfinished change, wait for its PR or
  agree an explicit dependency; do not copy half of their unmerged implementation.

## While working

- Prefer separate modules over both editing a central file at once. Tell the
  other person before changing a shared interface.
- Never modify already-applied migrations. Reserve a unique next migration name
  together; check pending PRs, not just `main`. Test the combined migration order.
- Never hand-merge package lockfiles or generated schema reports. Integrate source
  changes, rerun the generating tool and inspect the output. Avoid broad unrelated
  formatting or dependency upgrades in a feature PR.
- Each person uses separate local env files, test accounts and databases. No
  shared production secret files, real customer fixtures or destructive resets.
- Commit small units using `type(scope): imperative description`; push normally.

## Integrating and resolving conflicts

1. Fetch before pushing and inspect remote changes. Never force-push, overwrite
   remote-only commits or rewrite a shared branch's history.
2. Outside Arena, normally merge updated `origin/main` into your task branch when
   required. In an Arena session, integrate only onto the current assigned branch;
   never switch/create another branch or push to `main`.
3. If another person pushed to your task branch unexpectedly, stop and coordinate
   before integrating. Resolve conflicting intent together; do not choose “ours”
   or “theirs” wholesale just to clear the conflict.
4. Regenerate docs/locks as needed and rerun tests on the combined result.
5. Request review, especially code-owner approval for migrations/security/payments/
   replies. Fix red CI before merging. Merge through the PR, not a direct main push.

## Handoff and review

The PR must state: what works, what is sample, tests run, provider tests not run,
manual rollout steps, unresolved risks and the next owner. See the PR template.
A green test double is not proof of live Gmail/Meta/Paystack delivery. Reviewers
check cross-tenant access, payment authority, once-only side effects, opt-outs,
kill switches and secret handling—not only UI screenshots.

Only an authorized repository administrator can enable required code-owner
review and branch rules. Follow the instructions in CONTRIBUTING.md; CODEOWNERS
by itself does not prevent a merge. Owner-authored PRs cannot self-approve.
