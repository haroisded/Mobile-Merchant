# Testing & Debugging Workflow Protocol

This document governs how Flows are run, tracked, and recorded. It works alongside
[`device-testing.md`](./device-testing.md), which covers emulator/device interaction mechanics —
this file covers orchestration: what to test, in what order, how bugs get logged and fixed, and what
gets remembered permanently.

Do not create `test.md` / `Tests.md` files in Feature/Page directories inside System-Context. That
instruction is fully replaced by the system below (temp-fold during the run, System-Test-History after
it).

---

## 1. Definitions

- **Flow** — a continuous test session covering all test cases and edge cases of one or more
  categories for a specific Feature/Page, run without stopping until finished.
- **Category** — a grouping of related test cases/edge cases (e.g. "Input Validation," "Network
  Failure Handling," "CRUD Operations").
- **Bug** — any deviation from expected behavior caused by the codebase or the Feature/Page itself.
- **External Factor Failure** — any failure not caused by app code (emulator instability, a
  third-party service being down, unrelated network issues, etc.).

---

## 2. Temporary Working Files (`temp-fold`)

Location: `.claude/context/temp-fold`

At the start of a Flow for a Feature/Page, create exactly two files:

- `flow-<feature-or-page-name>.md` — tracks which categories/test cases/edge cases have been tested
  this run, so nothing is repeated within the same run.
- `bug-report-<feature-or-page-name>.md` — logs every bug found during the run, with enough detail to
  reproduce and fix it (steps, expected vs. actual, file/location if known).

These are scratch files scoped to the current run only. They are not the permanent record — that's
System-Test-History (§6).

### Resuming an interrupted run

Before creating new files, check whether `flow-*.md` / `bug-report-*.md` already exist for the
Feature/Page about to be tested. If they do, treat this as **resuming**, not starting fresh: read
them, pick up from where they left off. Only create new files if none exist yet.

---

## 3. The Flow Loop

1. Pick the next untested category/test case/edge case (check `flow-*.md` to avoid repeating anything
   already covered this run).
2. Execute it.
3. If a bug is found → log it in `bug-report-*.md`, mark the case tested in `flow-*.md`, and move on
   to the next case. Do **not** stop to fix it mid-flow — fixing happens in a separate pass (§4). This
   is what keeps the process from slowing to a crawl.
4. Repeat until every category/test case/edge case assigned to this Flow has been tested.

---

## 4. Bug-Fix Loop (runs after the Flow finishes)

This is what lets a bug that introduces a new set of problems get handled without derailing the Flow
itself.

1. Once the Flow completes, read `bug-report-*.md`.
2. Fix each logged bug.
3. **Re-verify before closing anything.** After fixing a bug, re-run the *exact* test case that
   originally exposed it. Only mark it resolved if that re-run passes. If it still fails, leave it
   logged and keep iterating — a fix is not assumed correct until it's re-tested.
4. If a fix introduces or exposes a new bug, append it to `bug-report-*.md`. This is expected and is
   exactly why the file stays open until nothing new shows up.
5. Repeat steps 2–4 until every bug is resolved **and** a full pass turns up nothing new.
6. **Before deleting anything**, append a condensed summary to the relevant System-Test-History file
   (§6) — one line per bug: what broke, root cause if known, what fixed it. This is the only place
   that detail survives, so don't skip it.
7. Delete `flow-*.md` and `bug-report-*.md` from temp-fold.
8. Move on to the next Flow per the governing instructions.

---

## 5. External Factor Circuit Breaker

For failures that aren't caused by app code (emulator, third-party service, environment, etc.):

- Attempt a fix as normal first.
- **Fingerprint the problem** before counting failures: two failures count as *the same* problem only
  if they share the same error/exception signature **and** the same failing service or component. A
  different error from the same service, or the same error from a different cause, starts a new
  counter — don't lump unrelated failures together, and don't let trivial wording differences reset a
  real one.
- Track failed attempts per fingerprinted problem.
  - Resolved before the 4th attempt → continue the Flow normally, no interruption.
  - Still unresolved at 4 fails → stop the process for that Flow and prompt the user directly with:
    what the problem is, what was tried, and what they need to do (e.g. "restart the emulator,"
    "check the API key," "service X appears to be down").
- This breaker is per fingerprinted problem, not global — an unrelated external issue gets its own
  counter.

---

## 6. System-Test-History (permanent record)

Location: `.claude/context/System-Test-History`

- One file per completed Feature/Page pass: `test-<3-digit-number>-<feature-or-page-name>.md` (e.g.
  `test-001-login-flow.md`, `test-002-user-profile.md`). Number and name, so files are identifiable
  without opening them.
- A new file is created (number incremented) only when every Flow instructed for a given
  Feature/Page has finished.
- Each file lists every category/test case/edge case that was tested and fixed, with a short
  description of the problem and how it was resolved (pulled from the bug-report summaries in §4.6).

**Scope note:** System-Test-History prevents re-testing the same thing twice *within a first coverage
pass*. It is **not** a skip-list for regression testing. If the code behind a tested Feature/Page
changes later, the relevant cases must be re-tested — an existing entry in History is not grounds to
skip them.

---

## 7. Safety Checkpoint

After a Flow completes cleanly (bug-fix loop empty, temp-fold cleaned, System-Test-History updated),
the checkpoint before the next Flow is a git commit scoped to that Feature/Page's fixes. **On this
project the human makes it:** they do git operations themselves, so the agent never commits — it
finishes the Flow and leaves the working tree for the human to checkpoint.

---

## 8. Silent Operation

- Do not output found bugs or planned fixes to the terminal/chat during the Flow or Bug-Fix Loop —
  that bookkeeping lives entirely in temp-fold and System-Test-History.
- Respond with **"finished"** only once every Flow is complete, all bugs are resolved, temp-fold is
  cleaned, and System-Test-History is updated.
- Exception: the External Factor Circuit Breaker (§5) and any other blocking issue that needs user
  input must still be surfaced. Silence never overrides that.

---

## 9. CRUD Testing Limit

For CRUD-related features, test with **2 sample records**, each run through the full Create → Read →
Update → Delete cycle. Do not keep generating additional sample records beyond the 2nd — two
iterations is enough to confirm the cycle works and to catch record-to-record issues (e.g. ID
collisions, state bleeding between records) without wasting time on repetitive coverage.

Example, for a "Product" feature:

```
Iteration 1: create product1 → update product1 → read product1 → delete product1
Iteration 2: create product2 → update product2 → read product2 → delete product2
```

Each operation within an iteration (create/update/read/delete) is still its own test case and still
follows the normal Flow Loop (§3) and Bug-Fix Loop (§4) — this section only caps how many sample
records get cycled through, not how thoroughly each operation is tested.

---

## 10. File Naming Convention

- `flow-<feature-or-page-name>.md` / `bug-report-<feature-or-page-name>.md` in temp-fold — kebab-case,
  matching the Feature/Page being tested.
- `test-<3-digit-number>-<feature-or-page-name>.md` in System-Test-History — zero-padded, incremented
  per completed Feature/Page pass.
