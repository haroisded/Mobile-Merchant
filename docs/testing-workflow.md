# Testing & Debugging Workflow Protocol

This document governs what happens after a page or feature is coded: how it is reviewed, tested,
fixed and recorded. It works alongside [`device-testing.md`](./device-testing.md), which covers
emulator mechanics. This file covers orchestration: which reviews and cases run, where every finding
is written, how fixes are planned and re-verified, and what is remembered permanently.

Do not create `test.md` / `Tests.md` files in Feature/Page directories inside System-Context. That
instruction is fully replaced by the system below (temp-fold during the run, System-Test-History after
it).

## Rules

1. **Every source writes to one file.** Fallow, `/ponytail-review`, the skill review and the device
   Flow all log to `.claude/context/temp-fold/findings-<name>.md`. Nothing is fixed while findings are
   being collected. §2–§4.
2. **Collect, then plan, then act, then re-test**, and repeat until a round adds nothing new. §5.
3. **Nothing is fixed on sight.** Not a static finding before the Flow, not a device bug in the middle
   of it. A fix happens in the act step, from a written plan.
4. **Screen every finding against [`false-positives.md`](./false-positives.md) before it is planned.**
   A registered one is marked and left alone.
5. **Scope is this pass's diff.** Code that predates the pass and breaks a newly adopted rule is
   backlog, not a finding. §2.4.
6. **Every Category gets an Authentication Compatibility assessment.** §11.
7. **The agent never commits.** The human checkpoints with git. §8.

### The whole pipeline

```
BEFORE CODE   an Expo API or package involved?  → docs/expo.md gate
              frontend work                     → layout.md, visual-language.md, typography.md,
                                                  then the React Native / Expo skills for the rest
CODE          the page or feature
AFTER CODE    this file:
                collect   fallow-review + /ponytail-review   (§2.1, §2.2)
                          skill review                      (§2.3)
                          device Flow                       (§4)
                          all → findings-<name>.md          (§3)
                plan  →  act  →  re-test  →  repeat         (§5)
                close     System-Test-History, clean temp-fold, "finished"
```

---

## 1. Definitions

- **Flow** — a continuous device test session covering every case of one or more categories for a
  specific Feature/Page, run without stopping until finished.
- **Category** — a grouping of related cases (e.g. "Input Validation," "Network Failure Handling,"
  "CRUD Operations").
- **Case variant** — which *kind* of case is being run. A Category is covered in all three:
  - **Test-Case** — the behaviour as specified.
  - **Edge-Case** — the boundaries of it.
  - **Authentication-Compatibility Case** — what the behaviour does across a Sign-in, Sign-out or
    Delete-account event. Mandatory to assess on every Category, tested wherever relevant. §11 is
    the rule for both halves of that sentence.
- **Collector** — anything that produces findings: `fallow-review`, `/ponytail-review`, the skill
  review, the device Flow.
- **Finding** — one entry in the findings file: a bug, a review comment or a rule violation, from any
  collector.
- **Round** — one pass of collect → plan → act → re-test.
- **Bug** — a finding caused by the codebase or the Feature/Page itself.
- **External Factor Failure** — any failure not caused by app code (emulator instability, a
  third-party service being down, unrelated network issues, etc.). It does not become a finding; it
  goes to the circuit breaker (§6).

---

## 2. Review collectors

After the code is written, three reviews run over it. Their output goes into the findings file (§3)
alongside the device Flow's. They are collectors, not gates: **nothing they report is fixed before
the Flow runs.** §5 decides what gets fixed, in what order.

### 2.1 `fallow-review`

Invoke the `fallow-review` skill on the code this pass changed. It is graph-grounded and diff-scoped:
it ranks what to look at by blast radius, subtracts the deterministic concerns — unused code,
complexity, duplication, styling — from the loop, and frames the consequential structural decisions
(new public-API contracts, coupling and boundary crossings, new dependencies) as judgment questions.

It is a closed loop, so run it as one: fetch the walkthrough guide, return a judgment, and let fallow
post-validate that judgment against the live graph. **A judgment it rejects as stale or hallucinated
is not a result.** Correct it and return it again; never write a rejected judgment into the findings
file.

**On this machine, plain `npx fallow review` does not run.** It fails with
`Error: could not create a temporary worktree for base ref '<sha>'`, and so does
`--base <ref> --diff-stdin`. Git itself makes worktrees here without complaint, so this is fallow's
own step, not a broken repo — the base-snapshot attribution pass, which is what separates findings
this pass introduced from findings it inherited. Pass `--gate all` to skip that pass:

```bash
npx fallow review --gate all                                       # the human-readable brief
npx fallow review --gate all --walkthrough-guide --format json     # the agent-contract guide
```

Verified 2026-09-17 on fallow 3.26.0: the guide comes back carrying `digest`, `direction`,
`graph_snapshot_hash`, `change_anchors`, `agent_schema` and `injection_note`, exactly as the loop
above needs.

The cost of `--gate all` is the reason attribution existed: **every finding in a changed file is
reported, inherited ones included.** That is what §2.4 is for — read the findings against this pass's
diff yourself and leave the rest alone. Do not treat the larger list as this pass's work. Drop the
flag and re-check the moment a fallow version creates its worktree here.

**Read [`false-positives.md`](./false-positives.md) before logging anything either tool reports.**
Three things it will save you, all measured on a full scan of this repo:

- **14 unused-dependency findings, 11 of them wrong.** Expo wires most packages through autolinking,
  `app.json` config plugins and peers, none of which are imports.
- **7 of 10 duplication clone groups are in generated or vendored code** — `src/lib/database.types.ts`
  and `tools/oxlint/anti-slop/**`. Not ours to refactor.
- **`fallow health` grades the repo D, and half that penalty is the dependencies above.** Cite the
  findings, never the grade.

**Never run `fallow fix` in this repo.** Every one of those dependency findings is
`auto_fixable: true`; the fixer cannot tell them from the real ones, and applying it strips
`react-native-reanimated`, `react-native-web` and `react-native-gesture-handler` out of
`package.json` and reports success. Fix by hand, in the act step.

A finding that is *not* registered is not thereby false. The same scan produced **18 genuine findings
in our own code**, and every one of them goes into the findings file.

### 2.2 `/ponytail-review`

Run `/ponytail-review` on the same diff. It complements fallow rather than repeating it: fallow ranks
risk and blast radius, ponytail-review hunts complexity — what to delete, reinvented standard
library, speculative abstractions, dead flexibility.

This is the command, not the mode. The ponytail *mode* is already on in every session through its
SessionStart hook ([TOOLING.md](../TOOLING.md)), so it governs the code being reviewed and cannot be
a step in a sequence. The command is the step.

### 2.3 Skill review

Read the diff against the installed React Native skills and log what they flag:

| Skill | What it reviews | Read |
| --- | --- | --- |
| `react-native-best-practices` (Callstack) | FPS, re-renders, lists, TextInput, animations, bundle, TTI, memory | its `SKILL.md`, then the `references/` file the diff touches |
| `vercel-react-native-skills` | list performance, animation, navigation, UI patterns, state, rendering | `SKILL.md`, then the matching `rules/*.md` |
| `vercel-react-best-practices` | React-generic re-render, rendering and JS rules | `SKILL.md`; skip the web-only prefixes ([`false-positives.md` §8](./false-positives.md#8-skills--rules-this-repo-overrides)) |

A skill finding carries the **rule id** (`list-performance-item-memo`, `js-uncontrolled-components`),
**file:line**, and **evidence**. Performance findings follow
[`optimization.md`](./optimization.md): no memoization finding without a measured render or FPS
problem, and no API-specific fix without checking the installed library version.

**Frontend conventions are not re-litigated here.** Where a skill contradicts `docs/`, the doc wins,
and the standing contradictions are registered in `false-positives.md` §8. A new contradiction is
added there, never "fixed" in code.

**Until the Callstack plugin loads on this machine** ([TOOLING.md](../TOOLING.md)), its half of the
review reads the matching chapter of
`.claude/context/Documentations-for-AI-Agents/The_Ultimate_Guide_to_React_Native_Optimization__2025__with_alt_text.md`,
the same content. Say in the findings file which one was used.

### 2.4 Scope — this pass's diff, and nothing else

All three reviews are pointed at what this pass changed. A finding that predates the pass is
**recorded as `backlog` in the findings file and left alone.** The same goes for code that breaks a
rule adopted after it was written: a "Not yet in code" rule in `docs/` is a migration for a coding
pass of its own, not a finding against whatever pass happens to touch the file next. Widening review
to the whole repo turns every feature pass into a refactor, and a large feature would never finish
its loop.

The repo-wide equivalents exist and are deliberately not part of this flow: `/ponytail-audit` for
whole-repo bloat, `/ponytail-debt` for the `ponytail:` comments earlier passes left behind, and the
`fallow` skill for a full audit. Run those when asked to, not on the way to a Flow.

### 2.5 When a finding will not resolve

Reuse the circuit breaker in §6 rather than inventing a second one: fingerprint the finding, count
attempts against that fingerprint, and at 4 failed attempts stop and prompt the human with what the
finding is, what was tried, and what you need from them. §9 Silent Operation already exempts blocking
issues, so this surfaces correctly.

### Rejected: fixing static findings before the Flow

The previous version of this section made every fallow and ponytail finding a gate: all fixed, then
the Flow. The reasoning was that a fix after the Flow invalidates the cases that touched the file.
It lost because the loop in §5 re-tests those cases anyway, and a gate meant two separate fix passes
over the same files: one for the static findings, one for the device bugs. With one findings file,
one plan sees every source at once. A device bug and a ponytail comment on the same function become
one change instead of two edits that fight.

### Rejected: a separate `docs/pre-test-review.md`

Static analysis is not device testing, and a file of its own would have read more cleanly. It loses
because the ordering would then live in two places, and the order is the whole value of the flow.
This repo keeps a sequence and its ordering in one file on purpose: `system-revamp-status.txt` is
"BOTH the gate and the ordering authority."

---

## 3. Temporary Working Files (`temp-fold`)

Location: `.claude/context/temp-fold`

At the start of a pass's after-code work for a Feature/Page, create exactly two files:

- `flow-<feature-or-page-name>.md` — the device cases: which categories, test cases and edge cases
  have run this round, so nothing is repeated within it, and each Category's auth-relevance line
  (§11).
- `findings-<feature-or-page-name>.md` — **every** finding from every collector, and the plan for
  each round.

The findings file has one section per round:

```markdown
## Round 2

| # | Source | Fingerprint | Where | Finding | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | device: CRUD / edit product | edit-returns-to-list | ProductForm.tsx:88 | Save returns to list, not detail | steps 1–4, expected vs actual | fixed |
| 8 | skill: vercel-react-native-skills/list-performance-inline-objects | inline-style-row | product-list.tsx:140 | … | rule text + line | registered-false (§8) |

### Plan
1. #7 — … files, the change, which re-test proves it
```

- **Source** — `fallow` · `ponytail` · `skill: <skill>/<rule>` · `device: <category> / <case>`.
- **Fingerprint** — the §6 fingerprint, so a repeat across rounds is recognised as the same finding.
- **Status** — `open` → `planned` → `fixed` → `verified`; or `registered-false (<§>)`, `backlog`,
  `unresolved`.
- A device bug keeps the detail it needs to be reproduced and fixed: steps, expected vs actual,
  file/location if known.

These are scratch files scoped to the current pass only. They are not the permanent record — that's
System-Test-History (§7).

### Resuming an interrupted run

Before creating new files, check whether `flow-*.md` / `findings-*.md` already exist for the
Feature/Page about to be tested. If they do, treat this as **resuming**, not starting fresh: read
them, pick up at the last round and its last status. Only create new files if none exist yet.

---

## 4. The device Flow (a collector)

1. Pick the next untested case — any of the three variants in §1, including the
   Authentication-Compatibility ones (check `flow-*.md` to avoid repeating anything already covered
   this round).
2. Execute it.
3. If it fails → log a finding in `findings-*.md` (status `open`), mark the case tested in
   `flow-*.md`, and move on to the next case. Do **not** stop to fix it mid-Flow — this is what keeps
   the process from slowing to a crawl.
4. Repeat until every case assigned to this Flow has been tested, in all three variants. A Flow does
   not finish with a Category's auth relevance unexamined — §11.

---

## 5. The findings loop

This is what lets a fix that introduces a new problem get handled without derailing anything.

1. **Collect.** Run the collectors — §2.1, §2.2, §2.3, then the device Flow (§4) — each writing into
   this round's section of `findings-*.md`. Screen every entry against `false-positives.md` and the
   §2.4 scope as it is written, so the plan starts from real findings only.
2. **Plan.** Read the whole findings file. Write the round's **Plan**: the `open` findings in order,
   grouped where one change answers several, with the files each touches and the re-test that will
   prove each. Mark them `planned`.
3. **Act.** Apply the plan. Mark each `fixed` as its change lands. A planned item that turns out to
   be wrong goes back to `open` with a note, not silently dropped.
4. **Re-test**, scoped:
   - **fallow-review, `/ponytail-review` and the skill review re-run in full** on the pass's diff,
     which now includes the fixes. They are cheap, and a fix is new code.
   - **On the device, re-run the exact cases that produced findings, plus any case whose screen or
     code path touches a file the act step changed.**
   - A re-run that passes marks its finding `verified`. One that fails stays `fixed` → back to `open`
     with the new result, and counts an attempt against its fingerprint (§6).
   - Anything new the re-test finds is logged `open` in the next round.
5. **Repeat** 1–4 while any finding is `open`.
6. **Confirm.** When a round ends with nothing `open`, run **one full device Flow** — every case, all
   three variants. Clean → close. Anything new → log it and go back to 2.
7. **Close.**
   1. Before deleting anything, append the summary to System-Test-History (§7). This is the only
      place that detail survives, so don't skip it.
   2. Delete `flow-*.md` and `findings-*.md` from temp-fold.
   3. Move on to the next Flow per the governing instructions.

The loop ends on **a clean confirming Flow with nothing open**, never on a round count. The only
other exits are the circuit breaker (§6, §2.5) and a blocking issue the human must answer (§9).

---

## 6. External Factor Circuit Breaker

For failures that aren't caused by app code (emulator, third-party service, environment, etc.), and
for any finding that will not resolve (§2.5):

- Attempt a fix as normal first.
- **Fingerprint the problem** before counting failures: two failures count as *the same* problem only
  if they share the same error/exception signature **and** the same failing service or component. A
  different error from the same service, or the same error from a different cause, starts a new
  counter — don't lump unrelated failures together, and don't let trivial wording differences reset a
  real one.
- Track failed attempts per fingerprinted problem.
  - Resolved before the 4th attempt → continue normally, no interruption.
  - Still unresolved at 4 fails → stop the process for that Flow and prompt the user directly with:
    what the problem is, what was tried, and what they need to do (e.g. "restart the emulator,"
    "check the API key," "service X appears to be down"). A finding stopped here is marked
    `unresolved`.
- This breaker is per fingerprinted problem, not global — an unrelated external issue gets its own
  counter.

---

## 7. System-Test-History (permanent record)

Location: `.claude/context/System-Test-History`

- One file per completed Feature/Page pass: `test-<3-digit-number>-<feature-or-page-name>.md` (e.g.
  `test-001-login-flow.md`, `test-002-user-profile.md`). Number and name, so files are identifiable
  without opening them.
- A new file is created (number incremented) only when every Flow instructed for a given
  Feature/Page has finished.
- Each file lists every case that was tested, and every finding that was fixed — **from every
  source**: device, fallow, ponytail, skill review. One line each: what it was, root cause if known,
  what fixed it. Registered false positives and backlog items get a count per source, not a line
  each.
- **Every file carries an Authentication Compatibility section** — either the cases that were run, or
  the one line recording why the feature was not relevant to the auth flow (§11). A pass that leaves
  it out is not finished. Without it the variant is untraceable one pass later, which is exactly how
  the route-guard bullet in `device-testing.md` went unrun through the whole of `test-001`.

**Scope note:** System-Test-History prevents re-testing the same thing twice *within a first coverage
pass*. It is **not** a skip-list for regression testing. If the code behind a tested Feature/Page
changes later, the relevant cases must be re-tested — an existing entry in History is not grounds to
skip them.

---

## 8. Safety Checkpoint

After a Flow completes cleanly (findings loop closed, temp-fold cleaned, System-Test-History
updated), the checkpoint before the next Flow is a git commit scoped to that Feature/Page's fixes.
**On this project the human makes it:** they do git operations themselves, so the agent never commits
— it finishes the Flow and leaves the working tree for the human to checkpoint.

---

## 9. Silent Operation

- Do not output findings or planned fixes to the terminal/chat during the loop — that bookkeeping
  lives entirely in temp-fold and System-Test-History.
- Respond with **"finished"** only once the loop has closed (§5 step 7): every Flow complete, nothing
  open, temp-fold cleaned, and System-Test-History updated.
- Exception: the External Factor Circuit Breaker (§6), an unresolvable finding (§2.5) and any other
  blocking issue that needs user input must still be surfaced. Silence never overrides that.

---

## 10. CRUD Testing Limit

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
follows the normal device Flow (§4) and findings loop (§5) — this section only caps how many sample
records get cycled through, not how thoroughly each operation is tested.

The cap is on sample **records**, not on variants. Both iterations are still assessed for auth
relevance under §11, and one of the cases there — a record created under one account must not render
under the next — needs a record to exist, so it belongs to this cycle rather than beside it.

---

## 11. Authentication Compatibility

The third case variant (§1). This app is a Supabase auth scaffold: nearly every screen reads rows
scoped by `auth.uid()`, and the session is the one piece of state that outlives every screen. A
feature can be correct in isolation and still be wrong the moment the person using it changes.

### The rule

**Every Category is assessed for auth relevance.** A Category is relevant when the feature does any
of these:

- reads or writes rows scoped by `auth.uid()` or `merchant_id`,
- holds state that outlives a screen — a query cache entry, a store value, a form in progress,
- renders anything that came out of the query cache.

Relevant → run the cases below. Not relevant → record it, see *Recording a negative*.

### The cases

| Case | What it proves | The mechanism it tests |
| --- | --- | --- |
| Sign out while on the page, mid-request if you can arrange it | The guard flips and the whole `(app)` history goes with no `router.replace` anywhere; an in-flight query does not crash on the way out | [ARCHITECTURE.md](../ARCHITECTURE.md) — the route guard |
| Sign back in as the **same** user | The feature's rows are still there and still the caller's | the RLS policies — [tenancy.md §3](./tenancy.md) |
| Sign in as a **different** user | **No row belonging to the previous user renders, at any frame.** The highest-value case in the table | `QueryProvider` keyed on `session?.user.id` — [data-layer.md §6](./data-layer.md) |
| Delete account while the feature has rows | The cascade takes them, the app lands on sign-in, and nothing is orphaned | `public.delete_current_user()` — [ARCHITECTURE.md](../ARCHITECTURE.md) |
| A write attempted with no valid session | RLS refuses and `failureMessage` copy appears — never a PostgREST string | `src/lib/errors.ts` — [data-layer.md §5](./data-layer.md) |
| Offline, then sign out, then reconnect | A mutation queued under one account does not land under the next | `onlineManager` — [data-layer.md §5](./data-layer.md) |

Row three is the one to run first if you only run one. RLS does not protect you there: the previous
user's rows are already on the device and render before any request goes out. Nothing in
`System-Test-History` has ever verified that key holds.

### Recording a negative

A Category judged **not** relevant gets one line in the run's `flow-*.md` saying so and why, and that
line is carried into the System-Test-History file (§7).

This is the part that makes the rule survive. A conditional-mandatory rule with no recorded negative
is indistinguishable from having forgotten it — the same argument this repo already makes about an
index nothing checks. "Not relevant" is a finding; "nothing here" is a gap.

### Cross-reference, not duplication

The standing authorisation is already written down and is not repeated here:
[device-testing.md §2](./device-testing.md) covers the Google account chooser, sign-out and Delete
account — all of them allowed once the human has opened the emulator, with each irreversible action
named in the report. [device-testing.md §4](./device-testing.md) has the force-stop / relaunch
sequence these cases need. Two lists of auth checks would drift; there is one.

---

## 12. File Naming Convention

- `flow-<feature-or-page-name>.md` / `findings-<feature-or-page-name>.md` in temp-fold — kebab-case,
  matching the Feature/Page being tested.
- `test-<3-digit-number>-<feature-or-page-name>.md` in System-Test-History — zero-padded, incremented
  per completed Feature/Page pass.
