# Token budget

Three places a diff's token cost balloons independent of the diff's size, and the fix for each. This
file exists because none of the other `instruction_mds/` files own this concern on their own —
[`testing-workflow.md`](./testing-workflow.md) owns the review steps, this file owns their cost.

## Rules

1. **A tool that can emit a large payload is wrapped in a script before it touches context.** Only
   the script's stdout enters context, never the tool's raw output.
2. **A skill's description is the only thing that decides whether it fires.** Narrow it until skills
   that could fire on the same diff don't all fire together. Never merge two skills into one to cut
   the count — that produces a broader, less predictable trigger, which is the opposite of the fix.
3. **A retrieval call that can return unbounded results carries a fixed budget**, the way
   `graphify query "<question>" --budget 2000` already does in
   [`context-policy.md`](./context-policy.md). That one is correct as written — it is the reference
   example for this rule, not something to touch.

---

## 1. Static review output

**Problem.** `npx fallow review --gate all --format json` returns the full gate report, uncapped,
straight into context — about 15 KB on every run, regardless of how small the diff is.

**Fix.** Wrap the call. The agent runs the script, never fallow directly:

```
node tools/fallow-verdict.mjs        # top 5 findings
node tools/fallow-verdict.mjs 20     # top 20
```

It runs `fallow review --gate all --format json` itself, parses the report, and prints on the order of:

```
fallow: FAIL (3 findings, top 5 shown, 12 changed files)
1. [error] unused_exports src/screens/product-list/index.tsx:42 formatRow
2. [warn] complexity src/screens/product-form/index.tsx:18 ProductForm
unused deps: 13 — registered, false-positives.md §1
```

Full gate coverage is kept — nothing is skipped, every finding counts toward the verdict and the
total — it only stops the raw JSON from landing in context. Exit code 1 on a fail verdict.

It runs the audit brief rather than `--walkthrough-guide`: the guide carries fallow's decision
surface and judgment contract but none of the dead-code, complexity or duplication findings. When the
brief emits a decision, the script prints its signal ids, and the `fallow-review` skill handles that
decision.

If `/ponytail-review` ever grows an equivalent verbose/JSON mode, wrap it the same way before that
mode is turned on.

## 2. Stacked skill loads

**Problem.** More than one skill's description can match the same diff. A diff touching lists,
navigation and rendering fires `react-native-best-practices`, `vercel-react-native-skills` and
`vercel-react-best-practices` in the same pass, each loading its own `SKILL.md`.

**Fix.** Narrow each skill's description until they no longer overlap on the same diff. Write the
description as the exact situation, not the general topic:

- Write: *"Use when a diff changes FlatList/FlashList props, item renderers, or list keys."*
- Not: *"Helps with React Native lists."*

The narrowed descriptions in use, and how to re-apply them after `npx skills update`, are in
[`TOOLING.md`](../TOOLING.md#narrowed-skill-descriptions).

**Verify before trusting a narrowed description:** start a fresh session, give the agent a task that
should match, and confirm the intended skill loads — and only that one. A skill that silently stops
firing is a correctness regression that looks like a token saving; catch it here, not in production.

**Do not merge `react-native-best-practices` and `vercel-react-native-skills` into one file.** A
merged skill's description covers both skills' ground, so it matches more diffs, not fewer — the
stacking problem gets worse.

**Do not add "load skill X" reminders to these docs.** A reminder is a second trigger on top of the
description. The one gate table is [`optimization.md`](./optimization.md) §1.

## 3. Bounded retrieval

[`context-policy.md`](./context-policy.md)'s `graphify query "<question>" --budget 2000` already caps
what a single retrieval can return. Nothing here needs to change. Keep it as the pattern: any future
retrieval call that could return an unbounded result gets the same treatment — a fixed budget, stated
in the command itself, not left to the tool's default.
