# Testing workflow

What the agent does before and after a page or feature is coded. **The human tests on the device;
the agent does not.** The agent's side is code quality — review, optimization, the practices — and
writing the acceptance tests the human runs ([`acceptance-tests.md`](./acceptance-tests.md)).

## Rules

1. **Never touch the emulator or a device unless the human allows it in this session.** No `adb`,
   `emulator`, `expo run:*`, `npm run android`, `npx expo start`, no screenshots, no UI dumps, no
   starting or driving the app. `.claude/settings.json` puts these commands behind a permission
   prompt; a prompt the human has not approved means stop, not retry another way.
2. **During planning, before code, list what only a device can prove** — auth transitions, offline,
   back navigation, tablet layout, anything outside the app (battery, network, interruptions). Those
   become the acceptance tests. Anything the code itself can settle — a mutation with no `onError`, a
   race between two writes, a missing loading state — is fixed in the plan, not handed to a tester.
3. **After code, run the static checks** (§1). Screen every finding against
   [`false-positives.md`](./false-positives.md) before acting on it. **Never run `fallow fix`.**
4. **Write or refresh `.claude/tests/<feature>.md`** per [`acceptance-tests.md`](./acceptance-tests.md), in the
   same pass as the code it tests.
5. **A reported failure is fixed from the report** (§2). The human names the test number and what
   they saw; the agent reproduces it from the code, not from the device.
6. **Scope is this pass's diff.** Code predating the pass is backlog — named to the human, not fixed
   here. `graphify affected "<node>"` ([`context-policy.md`](./context-policy.md) §3) answers what a
   change touches.
7. **The permanent record is the commit** ([`context-policy.md`](./context-policy.md) §2). **The agent
   never commits** — when §1 passes and the page or feature is finished, it writes the message, prints
   it, hands over the `git commit -F` line, and stops there.

---

## 1. After code

| Check | Command | Runs |
| --- | --- | --- |
| Lint | `npm run lint` | always — check the exit code, not the stderr text ([`false-positives.md`](./false-positives.md) §4) |
| Types | `npm run typecheck` | always |
| Static review | `node tools/fallow-verdict.mjs` | always — never `npx fallow review` directly ([`token-budget.md`](./token-budget.md) §1) |
| Over-engineering | `/ponytail-review` | always |
| Performance | the skill [`optimization.md`](./optimization.md) §1 names | only when its trigger matches the diff |

Fix what they find, re-run what found it, then write the tests. No findings file, no scratch loop —
the plan for a fix lives in the conversation.

Then, and only once all of that is green, prompt for the commit
([`context-policy.md`](./context-policy.md) §2). A failing check is not something to commit around.

## 2. When the human reports a failure

1. Read the test in `.claude/tests/<feature>.md`, and the tester's answer in
   `.claude/tests/test-report/<feature>-test-report.md` ([`acceptance-tests.md`](./acceptance-tests.md) §4).
   Trace its steps through the code.
2. Plan the fix; name the files it touches.
3. Apply it, re-run §1, and update any test whose steps or expected output changed.
4. Tell the human which test numbers to re-run.

**Circuit breaker.** Same failure (same symptom, same component) still reported after the 4th fix
attempt → stop fixing. Tell the human what the problem is, what was tried, and what would settle it —
often a log or a screen recording only they can capture, or permission to use the device (rule 1).

## 3. Rejected

- **The agent driving the emulator through `adb`** (the old device Flow). Every tap was a UI dump, a
  screenshot or a log read in context, in three variants per case, re-run each round — the largest
  token cost in the repo, for checks a human does in seconds. Removed 2026-09-18.
- **Scratch `flow-*.md` / `findings-*.md` files and the silent collect → plan → act → re-test loop.**
  They existed to coordinate the device Flow; without it, a fix plan fits in the conversation.
- **`npm run test:flow`.** Named as the loop's script, never written.
