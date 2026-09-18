# instruction_mds/

Rules for building in this repo. Each file is **Rules first**, then numbered sections holding the
detail those rules point at.

**Read the Rules block. Read a section only when you need its detail or intend to override the
rule.** Never read a whole file for context — see [`context-policy.md`](./context-policy.md).

## Order for a new page or feature

| Step | Read |
| --- | --- |
| Get oriented | [`context-policy.md`](./context-policy.md) — git, `system-context.txt`, the graph |
| Schema and access | [`tenancy.md`](./tenancy.md), [`migrations.md`](./migrations.md) |
| Where files go | [`structure.md`](./structure.md) |
| Queries and forms | [`data-layer.md`](./data-layer.md) |
| Anything Expo-touching | [`expo.md`](./expo.md) — gate before code |
| Building the screen | [`layout.md`](./layout.md), [`typography.md`](./typography.md), [`visual-language.md`](./visual-language.md) |
| Planning and after code | [`testing-workflow.md`](./testing-workflow.md) — the human tests on the device, the agent never touches it |
| Writing the tester's script | [`acceptance-tests.md`](./acceptance-tests.md) — `.claude/tests/<feature>.md` |
| Reviewing for performance | [`optimization.md`](./optimization.md) — gated, loads only when the diff triggers it |
| Keeping a pass cheap | [`token-budget.md`](./token-budget.md) |
| Reacting to a tool finding | [`false-positives.md`](./false-positives.md) |

## Precedence

1. A rule in `instruction_mds/` beats a skill, a tool finding, or a mockup.
2. A mockup beats silence — where `instruction_mds/` says nothing, follow the mockup and add the
   missing row in the same pass.
3. A new contradiction between a skill and a doc gets a row in the doc that owns the rule. Never a
   quiet change to the code.

## Gated skill loading

`optimization.md` §1 is the one table that loads a review skill, and only when its trigger matches the
diff. Skill descriptions are kept narrow so they do not stack — [`token-budget.md`](./token-budget.md) §2.
