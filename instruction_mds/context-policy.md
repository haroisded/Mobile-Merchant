# Context policy

How an agent gets context in this repo, and what it is not allowed to read to get it. This file
exists to keep a pass cheap: context is fetched on demand from queryable sources, never by reading
history documents.

## Rules

1. **History comes from git, not from markdown.** `git log`, `git show`, `git diff` are the history
   record. Do not write, read or maintain per-pass history files.
2. **System context comes from one file plus the graph.** Read `.claude/context/system-context.txt`
   for the summary. For anything more specific, query the knowledge graph — never `grep`/`find` your
   way across the repo to orient.
3. **The graph updates itself.** `graphify hook install` (one-time, human's terminal) fires
   `graphify update .` automatically on every commit. Nothing to run mid-pass, nothing for the agent
   to remember.
4. **Read the Rules block of an `instruction_mds/` file, not the whole file.** Read a numbered
   section only when overriding the rule it explains, or when the rule points at it by number.
5. **Load a skill only when its trigger applies** ([`expo.md`](./expo.md) rule 1). Do not load a
   skill to confirm a rule an `instruction_mds/` file already states. Token cost of tools, skills and
   retrieval is [`token-budget.md`](./token-budget.md).
6. **Do not open `.claude/context/Documentations-for-AI-Agents/` unless a rule names the file.**
   Those are reference volumes, not reading material.
7. **`/clear` between tasks, `/compact` mid-task.** Long context costs more per turn even when
   cached.
8. **Be deliberate about subagents.** Each one runs its own requests. Configure a cheaper model for
   simple subagents in the agent's frontmatter.

---

## 1. Where context lives

| Question | Source |
| --- | --- |
| What changed, when, and why | `git log` / `git show` |
| What this system is, end to end | `.claude/context/system-context.txt` |
| Where a thing is implemented, what calls what | `graphify query "<question>"`, `graphify explain "<node>"`, `graphify affected "<node>"` |
| What was decided about a convention | the `instruction_mds/` file that owns it |
| What a mockup draws | `.claude/context/UI Reference/` — read-only |
| What a tool's finding means here | [`false-positives.md`](./false-positives.md) |

Nothing else is a context source. If an answer is not in one of these, it is not written down, and
writing it down means updating the owning `instruction_mds/` file — not creating a new document.

## 2. Commit as the history record

A finished page or feature ends in one commit, scoped to that page or feature. The commit message
carries what a history file used to:

```
<page or feature>: <what shipped>

- what was built
- what was verified, and on what
- what was deliberately left out, and why
- anything still open
```

The human makes the commit. The agent finishes the work and leaves the tree ready.

This replaces per-pass history markdown entirely. Do not recreate it under another name.

## 3. graphify

Claude's default way to answer "how does X work" is to grep for strings and read whole files to
orient, which burns thousands of tokens before the first useful sentence. The graph answers the same
question from an index — tool: [`graphify`](https://github.com/Graphify-Labs/graphify), tree-sitter
AST parsing.

**One-time setup, run by the human, not the agent:**

```bash
uv tool install graphifyy          # or: pipx install graphifyy
graphify claude install            # writes a CLAUDE.md section + a PreToolUse hook that
                                    # nudges Claude to check the graph before Glob/Grep
graphify update .                  # builds the graph — AST only, no LLM, no token cost
graphify hook install              # post-commit + post-checkout hooks — keeps it in sync
                                    # automatically from here on
```

`graphify extract .` is the alternative first-build command — same AST pass plus an LLM backend for
semantic community naming. It costs tokens against whichever backend it's pointed at
(`--backend gemini|kimi|claude|openai|deepseek|ollama`). Use `update`, not `extract`, unless the
richer labeling is worth that cost — `update` is the default for this repo.

**What the agent runs, every pass** — all read-only, all against the existing `graph.json`:

| Command | Use it for |
| --- | --- |
| `graphify query "<question>" --budget 2000` | The general case — BFS traversal, capped at 2000 tokens by default. Lower `--budget` for a narrow question |
| `graphify explain "<node>"` | One symbol and its immediate neighbors, plain language |
| `graphify affected "<node>"` | Reverse traversal — what a change to this node touches. Run this instead of guessing scope by hand ([`testing-workflow.md`](./testing-workflow.md) rule 6) |
| `graphify god-nodes` | The most-connected nodes — a fast first orientation on an unfamiliar area, cheaper than `query` with a vague question |

**Never build or update the graph itself.** `graphify hook install` means it is never stale by more
than one commit, with zero agent-side steps. If the hook is not installed on a given machine, say so
and ask the human to run it — do not run `graphify update` as a workaround, and never call
`graphify extract` on the agent's own initiative — that spends real LLM tokens against a backend the
agent did not choose.

## 4. Reading `instruction_mds/`

Every file in `instruction_mds/` is Rules first, then numbered sections.

- **Default:** read the Rules block. It is the instruction.
- **Read a section** when following the rule requires the detail it holds (a constant, a code shape,
  a command) or when you intend to override the rule.
- **Never read a whole `instruction_mds/` file to "get context".** That is what §1 is for.

| File | Owns |
| --- | --- |
| [`structure.md`](./structure.md) | Which directories exist, what goes in each |
| [`data-layer.md`](./data-layer.md) | Supabase calls, Zod, TanStack Query |
| [`layout.md`](./layout.md) | Widths, columns, spacing, the wide/narrow threshold |
| [`typography.md`](./typography.md) | The nine text variants |
| [`visual-language.md`](./visual-language.md) | Colour, corners, icons, Paper piece per pattern |
| [`expo.md`](./expo.md) | The skill gate, SDK pinning, skill overrides |
| [`tenancy.md`](./tenancy.md) | `merchant_id`, RLS policy shape |
| [`migrations.md`](./migrations.md) | Migration and revert pairing |
| [`testing-workflow.md`](./testing-workflow.md) | Before/after code; the agent never touches the device |
| [`acceptance-tests.md`](./acceptance-tests.md) | How `tests/<feature>.md` is written for human testers |
| [`optimization.md`](./optimization.md) | Performance review and the one skill gate table |
| [`token-budget.md`](./token-budget.md) | Wrapped tool output, narrow skill triggers, bounded retrieval |
| [`false-positives.md`](./false-positives.md) | Tool findings that are wrong here |
| [`context-policy.md`](./context-policy.md) | This file |

## 5. Skills

98 skills are installed and their descriptions cost tokens in every turn. Two rules follow:

- **Prune what this repo does not use.** A skill that has never been loaded on this project is cost
  with no return. Review the list periodically with `/context`.
- **Load a skill for its trigger, not for reassurance.** The `instruction_mds/` files already state
  this repo's decisions; a skill read that only confirms one is wasted. Where a skill contradicts a
  doc, the doc wins and the contradiction is registered, never fixed in code.

Heavy skills can be scoped down or pinned to a cheaper model in their frontmatter. Skills that overlap
on the same diff get narrower descriptions, never a merge — [`token-budget.md`](./token-budget.md) §2.

## 6. Not used here

**No `System-Context/` directory, no per-page history markdown, no `Tests.md` in a page directory,
no index file listing where code lives.** Git, the graph and the single system-context file replace
all of them. The one exception is `tests/<feature>.md` at the root: it is written for human testers,
not as agent context, and the agent does not read it to orient ([`acceptance-tests.md`](./acceptance-tests.md)). An index nothing checks is an index that rots, and a table that has quietly started
lying is worse than no table.
