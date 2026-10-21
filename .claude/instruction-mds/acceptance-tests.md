# Acceptance tests

How the agent writes `.claude/tests/<screen>.md` — the script a human tester follows on a real phone or
tablet. The testers are people who will use the POS, not developers.

## Rules

1. **One file per screen — `.claude/tests/<screen>.md`, kebab-case, gitignored** with every directory
   under `.claude/` but `instruction_mds/` (the human's call, 2026-10-08; rejected: committing them,
   the rule until then). No
   file per pair of screens. A test that crosses screens goes in the file of the screen where its
   expected output is checked. §0 says how to pick.
2. **A change gets new tests, never a rewrite of old ones.** Add the new tests to the end of the right
   file (or a new file), numbered on from its last test. A test whose behaviour the change replaced
   keeps its steps; it gets one line under its title, `> Retired by <file> Test <n>.` — or
   `> Retired: <why>, and nothing replaces this test.` — and nothing else. The human asked for this on 2026-10-01: a tester's report never names a test whose steps
   changed under it.
3. **Written for a shop owner, not a developer.** No code, file, table, API, query or error-class
   names. Name what is on the screen, in the words the screen uses ("tap **Save**", "the list of
   systems").
4. **Every test uses the template in §1 exactly**, numbered from 1 within the file and never renumbered. No result or
   feedback fields — testers report a failure by its test number.
5. **Cover every group in §2, in that order.** A group that cannot apply gets one line saying why —
   a skipped group with no reason is indistinguishable from a forgotten one.
6. **Steps are single actions, each one findable.** One tap, one typed value, one thing to look at —
   and say where it is on the screen. A step that says "set up a system" is two tests' worth of
   ambiguity. §1.1 says how much to write.
7. **Expected output is something a person can see, described so a stranger could find it.** Text on
   screen, a screen that opens, an item that appears or disappears — named with where it is and what
   it looks like. Never "the row is written", and never "the dialog closes" without saying which
   dialog. §1.1.
8. **Test data is made through the app.** Two sample records per screen that creates them (§3), created in the test
   steps, never assumed to exist.
9. **Results come back in `.claude/tests/test-report/<file>-test-report.md`, never in the test file.** The
   tester writes it; the agent reads it and fixes from it (§4).

---

## 0. Which file

| The test is about | File | Example |
| --- | --- | --- |
| one screen, or one sheet or dialog opened from it | `<screen>.md`, named for the screen as the side menu names it | `systems.md` |
| the side menu, or anything else every screen shares | a file named for that piece | `side-menu.md` |
| something that passes between screens — a link, Back between them, data made on one and shown on another | the file of the screen where the expected output is checked | a system created on the **Home** tab whose name shows in the side menu → `side-menu.md` |

- Before adding a file, check `.claude/tests/` for the one that already covers that screen.
- A screen renamed in the app keeps its file's tests; new tests go in a file under the new name, and
  the old file's intro says where its screen went.

## 1. Template

```markdown
# <Screen> — acceptance tests

Covers <what on this screen>.

## Test 1 - Title: <what a tester would call it>

### What will be tested?
<two or three sentences: which screen, what the tester does there, and what a pass proves>

### What do you need before starting?
- <signed in as …, on the … screen, internet on, …>

### Steps
1. <one action, with where it is on the screen>
2. <one action, with where it is on the screen>

### What's the expected output?
- <where to look, and what is there — readable without the steps>
```

### 1.1 How to write each section

The tester is a shop owner running the script for the first time. They have not seen the screen
before, and they do not know what this test was written to catch. Write every section for that
person.

**What will be tested?** Two or three sentences, no more. Name the screen, say what the tester is
about to do in plain words, and say what a pass proves — the thing the shop would lose if it broke.
No background, no history of the feature.

> ❌ Removing a system needs its name typed.
>
> ✅ On the **Home** tab, you will remove a system with its red **Remove** button. A pass means the
> system is deleted for good, and only after its name is typed to confirm, so a stray tap can never
> lose a shop's data.

**Steps.** Still one action per step (rule 6), but each step says where the thing is and what it
looks like: at the top, at the bottom, in the side menu, the **⋮** button at the right of a row, a
switch, a field labelled **System name**. Use the exact words the screen shows, in bold. Give typed
values in `code`. When a tap opens a new screen or dialog, say what opens in the same step, so the
tester knows they are in the right place before the next one:

> ❌ 2. Tap **Remove**.
>
> ✅ 2. Tap the red **Remove** button on the system's card. A panel titled **Remove Corner Cafe?**
> rises from the bottom.

**What's the expected output?** Each bullet must make sense to someone who skipped the steps. Never
presume the tester knows what you mean:

- Say **where** to look first — which screen, which part of it (the top of the page, the **Active
  Systems** list, the side menu) — then **what** is there, with the exact text in bold.
- Never refer to something by a word the tester has not been shown: not "the dialog", "the card",
  "the badge", "the line" on its own. Name it: "the **Remove Corner Cafe?** panel", "the round badge
  at the top of the side menu".
- Explain a term the first time it appears ("a system — one shop's own set of records"); after that
  the short form is fine.
- Say what does **not** happen when that is the point of the test ("no second **Double Tap Test**
  card appears").
- When a step number matters, lead with it: "After step 4, …".

> ❌ The system is created.
>
> ✅ The **Name your system** page closes by itself, and under **Active Systems** on the **Home** tab
> a card named **Corner Cafe** is there, with **Edit** and **Remove** buttons under it.

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

The tester answers in a separate file, one per test file:

```
.claude/tests/<file>.md                                the script — written by the agent
.claude/tests/test-report/<file>-test-report.md        the answers — written by the tester
.claude/tests/test-report/images/test-<n>-related.jpg   a screenshot, when one says it faster
```

The report repeats each test's number and title, then a status and a feedback line. A **blank status
means not yet run** — not a pass, and not a failure. Say so when handing the report back, and list
which numbers are still owed rather than treating the file as complete.

The agent reads this file and works from it ([`testing-workflow.md`](./testing-workflow.md) rule 5).
It does not write into it, does not tick anything off in it, and does not reproduce the failure on a
device — it traces the reported steps through the code.

The one exception: when the human lets the agent run the tests on a device that session
([`testing-workflow.md`](./testing-workflow.md) rule 1), the agent writes the report itself, in the
same shape. **PASS** carries no feedback unless a tester would really need it, **FAIL** always
carries a short one, and a test it did not run stays blank (the human's call, 2026-10-08).

## 5. Rejected

- **A `Result` / pass-fail field in each test.** Testers report failures by number; a field in a
  committed file turns into stale ticks from an old run.
- **One `tests.md` for the whole app.** Grows without limit and forces a tester to scroll past every
  other feature.
- **One file per feature, rewritten in place when the feature changes** (the rule until 2026-10-01).
  A feature spans several screens, so its file mixed them, and a rewrite changed tests a tester was
  already running. Replaced by rules 1 and 2.
- **A file per relationship between screens, `<screen-a>-<screen-b>.md`** (2026-10-01 to 2026-10-04).
  Every pair of screens grew its own file and its own tests, far more than a tester could run. The
  human removed it on 2026-10-04; a cross-screen test now goes in one screen's file (rule 1).
