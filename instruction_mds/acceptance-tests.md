# Acceptance tests

How the agent writes `.claude/tests/<feature>.md` — the script a human tester follows on a real phone or
tablet. The testers are people who will use the POS, not developers.

## Rules

1. **One file per page or feature: `.claude/tests/<feature>.md`, kebab-case, committed.** When the feature
   changes, rewrite its file in the same pass. Never a second file for the same feature.
2. **Written for a shop owner, not a developer.** No code, file, table, API, query or error-class
   names. Name what is on the screen, in the words the screen uses ("tap **Save**", "the product list").
3. **Every test uses the template in §1 exactly**, numbered from 1 within the file. No result or
   feedback fields — testers report a failure by its test number.
4. **Cover every group in §2, in that order.** A group that cannot apply gets one line saying why —
   a skipped group with no reason is indistinguishable from a forgotten one.
5. **Steps are single actions.** One tap, one typed value, one thing to look at. A step that says
   "set up a product" is two tests' worth of ambiguity.
6. **Expected output is something a person can see.** Text on screen, a screen that opens, an item
   that appears or disappears. Never "the row is written" — say where the tester sees it.
7. **Test data is made through the app.** Two sample records per feature (§3), created in the test
   steps, never assumed to exist.
8. **Results come back in `.claude/tests/test-report/<feature>-test-report.md`, never in the test file.** The
   tester writes it; the agent reads it and fixes from it (§4).

---

## 1. Template

```markdown
# <Feature> — acceptance tests

## Test 1 - Title: <what a tester would call it>

### What will be tested?
<one or two sentences>

### What do you need before starting?
- <signed in as …, on the … screen, internet on, …>

### Steps
1. <one action>
2. <one action>

### What's the expected output?
- <what the tester sees>
```

## 2. Groups

**1. Normal use.** The feature doing its job, start to finish.

**2. Mistakes and edge cases.** Empty required fields, very long text, zero and negative numbers,
duplicate names, double-tapping a button, pressing the phone's Back button mid-form, cancelling a
dialog.

**3. Accounts.** Anything that shows or changes a merchant's data:

| Case | What the tester checks |
| --- | --- |
| Sign out while on the screen | App returns to sign-in, nothing freezes |
| Sign back in as the same person | Their items are still there |
| Sign in as a **different** person | **None of the first person's items appear, even for a moment** — the most important test in the file |
| Delete the account while it has items | Lands on sign-in; signing up again starts empty |

**4. Outside the app.** Things that happen to the phone, not the app:

| Situation | What the tester checks |
| --- | --- |
| Internet drops in the middle of saving | A clear "offline" message, not an endless spinner; the save lands once internet returns, or the tester is told it did not |
| Airplane mode on, then open the screen | Offline message instead of a blank screen or spinner |
| Battery dies (or the phone is switched off) mid-action | After restart the tester is still signed in, and the item is either saved or clearly not — never half-saved |
| App swiped away from recent apps, then reopened | Still signed in, back where expected |
| Phone call or notification arrives mid-form | Returning to the app keeps what was typed |
| App left in the background for 10+ minutes | Coming back still works without signing in again |
| Phone storage almost full | The app still opens and saves |
| Phone's clock set wrong (a few minutes off) | Google sign-in may fail — note what message appears |
| Phone and tablet | The wide layout on a tablet (side panels, tables) and the narrow one on a phone |

## 3. Sample records

Two records, each through the full cycle, as separate numbered tests:

```
Record 1: create → edit → view → delete
Record 2: create → edit → view → delete
```

The cap is on records, not on groups — groups 2–4 still apply to the feature.

## 4. The report that comes back

The tester answers in a separate file, one per feature:

```
.claude/tests/<feature>.md                              the script — written by the agent
.claude/tests/test-report/<feature>-test-report.md      the answers — written by the tester
.claude/tests/test-report/images/test-<n>-related.jpg   a screenshot, when one says it faster
```

The report repeats each test's number and title, then a status and a feedback line. A **blank status
means not yet run** — not a pass, and not a failure. Say so when handing the report back, and list
which numbers are still owed rather than treating the file as complete.

The agent reads this file and works from it ([`testing-workflow.md`](./testing-workflow.md) rule 5).
It does not write into it, does not tick anything off in it, and does not reproduce the failure on a
device — it traces the reported steps through the code.

## 5. Rejected

- **A `Result` / pass-fail field in each test.** Testers report failures by number; a field in a
  committed file turns into stale ticks from an old run.
- **One `tests.md` for the whole app.** Grows without limit and forces a tester to scroll past every
  other feature. Replaced by one file per feature.
