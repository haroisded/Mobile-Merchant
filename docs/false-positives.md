# Known false positives

Tool findings that are wrong **in this repo**, and what to do when you meet one that is not listed.

Read it before reacting to output from `fallow`, `oxlint`, `/ponytail-review`, `/ponytail-audit`, the
Supabase CLI or MCP server, a skill review (`react-native-best-practices`,
`vercel-react-native-skills`, `vercel-react-best-practices`, the `expo-*` skills), or any other
analyser. The review collectors in
[`testing-workflow.md` §2](./testing-workflow.md) are where most of these arrive, but they arrive
outside a Flow too, which is why this is its own file.

**This file is written from output, not prediction.** Every row below was produced by a command that
actually ran here; the first version of §6 was a guess at what `/ponytail-audit` would say, and when
the audit ran it flagged none of it. That section now records what happened instead.

## Rules

1. **Check this register before reacting to any tool finding.** A finding listed here costs one line
   in the pass record and no investigation. Do not re-derive it, do not re-argue it, do not raise it
   with the human beyond the count.
2. **Never run `fallow fix` in this repo.** Not the command, not `--fix`, not an editor quick-fix on
   its output. Of the 39 issues `fallow dead-code` reports, **14 are registered false positives and
   every one is `auto_fixable: true`** — the fixer cannot tell them from the real ones, and applying
   it strips `react-native-reanimated`, `react-native-web` and `react-native-gesture-handler` out of
   `package.json` and reports success. Fix by hand, one finding at a time.
3. **A finding that is not listed here is not automatically false.** The first full scan of this repo
   produced **18 genuine findings in our own code** alongside the 14 registered ones. Establish each
   with evidence — a dependent in `node_modules`, a reference in `app.json` or `tools/`, or a rule in
   `docs/` or `CLAUDE.md` — before deciding either way.
4. **Cannot establish it? Leave it.** Do not delete, do not suppress, do not tidy it away. Record it
   in the pass and surface it to the human. An unproven finding is not a licence to change code.
5. **Established a new one? Add it here in the same pass**, with its evidence. §7 has the shape. An
   unwritten conclusion gets re-litigated by the next agent, which is the cost this file exists to
   stop paying.
6. **Where a tool and this repo's docs disagree, the docs win.** The tool cannot see the reasoning.
   [`CLAUDE.md` §4](../CLAUDE.md#4-verified-findings-for-supabasesupabase-js21123) is a whole page of
   findings that contradict what a tutorial-trained model would confidently "fix".
7. **A headline score is not a measurement of this repo.** `fallow health` grades it **49.8, D** — and
   **half of that is the registered dependencies** (`unused_deps: -25` of ~50 points lost). Quote the
   underlying findings, never the grade. §3.
8. **Findings *inside* generated or vendored code are not ours to fix** — but whether that code stays
   is ours. The two halves of that sentence are different decisions and §2 keeps them apart.
9. **This is not a skip-list for a tool.** It names findings, not tools. Anything a tool reports that
   is *not* in here goes into the findings file and gets the full treatment in
   [`testing-workflow.md` §5](./testing-workflow.md).

The rest of this file is the register. Read a section when its tool has just spoken.

**Contents**

1. [fallow — unused dependencies](#1-fallow--unused-dependencies)
2. [Generated and vendored code](#2-generated-and-vendored-code)
3. [fallow — the health score, and everything else](#3-fallow--the-health-score-and-everything-else)
4. [oxlint and npm](#4-oxlint-and-npm)
5. [Supabase](#5-supabase)
6. [ponytail — what it actually flags here](#6-ponytail--what-it-actually-flags-here)
7. [Adding to this register](#7-adding-to-this-register)
8. [Skills — rules this repo overrides](#8-skills--rules-this-repo-overrides)

---

## 1. fallow — unused dependencies

`fallow` reports **13 unused dependencies and 1 unused devDependency**. Eleven are wrong. It is not a
fallow bug: an Expo app wires most of its packages through native autolinking, `app.json` config
plugins and peer relationships, none of which are `import` statements, and fallow's graph is built
from imports.

This list does not shrink with time. [`testing-workflow.md` §2.1](./testing-workflow.md) requires
`--gate all` on this machine, and that flag reports inherited findings alongside new ones by design.
Expect all fourteen on every run.

### Confirmed false positives — leave every one of them in `package.json`

| Package | Why fallow cannot see it |
| --- | --- |
| `expo-build-properties` | `app.json` → `plugins`. A config plugin is never imported, and fallow does not read `app.json` |
| `expo-image` | `app.json` → `plugins`. Also the image component [`layout.md` §7](./layout.md) specifies for every grid |
| `expo-glass-effect` | `expo-router` depends on it |
| `expo-symbols` | `expo-router` depends on it |
| `react-native-gesture-handler` | required by `expo-router`, `react-native-screens` and `react-native-drawer-layout` — the merchant shell's `Drawer` rides on it |
| `react-native-reanimated` | required by the same three |
| `react-native-worklets` | required by `expo-modules-core`, `react-native-reanimated`, `react-native-gesture-handler` |
| `react-native-web` | required by `babel-preset-expo`, `expo`, `expo-router`, `expo-image`, `expo-system-ui`. It **is** the `npm run web` target |
| `react-native-vector-icons` | already documented — [`CLAUDE.md` §3](../CLAUDE.md#3-the-ui): "stays in `package.json` because Paper imports it internally either way" |
| `expo-dev-client` | the development build itself. `README.md`: "Expo Go will not work" |
| `expo-atlas` (dev) | `tools/atlas.mjs` spawns it. `tools/` is outside the analyzed graph |

Deleting any row above breaks the build, the dev client, the web target or the shell's navigation —
and fallow would report the deletion as a success. See rule 2.

### Unverified — do not delete, do not suppress, do not classify

Rule 4 applies. These three have **no in-repo import and nothing in `node_modules` declaring a
dependency on them**, so the evidence that clears the eleven above does not clear these.

| Package | What is and is not known |
| --- | --- |
| `expo-device` | No importer, no dependent found. May be genuinely removable |
| `expo-status-bar` | No importer, no dependent found. May be genuinely removable |
| `expo-system-ui` | No importer, no dependent found. *Probably* serves `app.json`'s `userInterfaceStyle: "automatic"` — but that is inference from Expo's docs, not evidence from this repo |

They are listed so nobody re-investigates them by accident, **not** because they are cleared. Leaving
three packages in place costs nothing; removing one that turns out to be autolinked costs a broken
native build that no JS-level check catches.

---

## 2. Generated and vendored code

Two directories in this repo are not written by hand, and **most of what every tool reports about
this codebase comes from them**. Measured on the first full scan: **7 of 10 duplication clone groups,
2 of 2 unused files, 3 of 10 unused type exports.**

| Path | What it is | Why findings inside it are noise |
| --- | --- | --- |
| `src/lib/database.types.ts` | Generated by `supabase gen types typescript --linked` | 839 lines of `Row` / `Insert` / `Update` shapes that repeat by construction — one 61-line clone group at ×3 instances, plus `TablesInsert`, `TablesUpdate` and `CompositeTypes` reported as unused type exports. Editing it is not a fix: the next migration regenerates the file wholesale ([`data-layer.md` §3](./data-layer.md)) |
| `tools/oxlint/anti-slop/**` | Vendored by the `install-anti-slop` skill | **6 of the 10 clone groups**, including a 100-line pair across `no-unknown-returns.ts` / `no-unknown-type-aliases.ts`. It is a third-party lint plugin, not application code, and it is not in the app bundle ([`ARCHITECTURE.md`](../ARCHITECTURE.md) file map) |

### The distinction rule 8 makes

**Refactoring inside them: no.** Deduplicating generated types or vendored rule files is churn that
the next `gen types` run or skill update erases.

**Keeping them at all: yes, that is ours.** The same scan found
`tools/oxlint/anti-slop/effect/` — 65 lines across two files, zero importers, and **never named in
`.oxlintrc.json`**. That is the Effect half of the anti-slop plugin, and this project has no Effect.
Vendored, and genuinely dead. Deleting it is correct; deduplicating its neighbours is not.

So: *"it is vendored"* answers a duplication or complexity finding. It does not answer *"nothing
imports this file"*.

---

## 3. fallow — the health score, and everything else

**The `fallow health` grade is unreadable here, and the reason is §1.** The first run scored
**49.8 / D**, and the penalty breakdown is:

```
unused deps -25.0 · hotspots -10.0 · unit size -10.0 · coupling -2.2
dead exports -1.9 · dead files -0.4 · complexity -0.4 · duplication -0.3
```

**`unused_deps: -25` is the whole of §1** — all fourteen, eleven of them wrong. The grade therefore
says more about Expo's autolinking than about this codebase, whose average cyclomatic complexity is
2.8 and whose maintainability index is 91.7 ("good"). Per rule 7: cite `hotspots -10` and
`unit size -10`, which are real, and never the letter.

**`fallow recommend`'s `entry` proposal is wrong here.** It offers:

```json
{ "entry": ["src/index.{ts,tsx,js,jsx}", "src/main.{ts,tsx,js,jsx}"] }
```

Neither file exists. Routing is file-based through expo-router, and adopting that `entry` would
narrow the graph to nothing. Its framework detection reports `react`, not expo-router.

The tool is not confused everywhere, which is the point of rule 3: the dead-code pass loads **25
plugin entry points** and correctly reports `unused_files: 0` for `src/`, so route files are *not*
flagged as dead. Only `recommend`'s generic template is wrong. Zero config is the supported state,
and `fallow doctor` reports `Status: ready` in it.

**`--gate all` is not a finding-count you can compare across passes.** It skips base-snapshot
attribution, so nothing distinguishes a finding this pass introduced from one it inherited. That is
why [`testing-workflow.md` §2.4](./testing-workflow.md) makes scoping the reader's job.

---

## 4. oxlint and npm

**`MODULE_TYPELESS_PACKAGE_JSON` on every `npm run lint`.** It comes from
`tools/oxlint/anti-slop/index.ts` being TypeScript in a package with no `"type": "module"`:

```
(node:5808) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of
file:///.../tools/oxlint/anti-slop/index.ts is not specified and it doesn't parse as CommonJS.
```

**oxlint still exits 0.** It is noise on stderr, and PowerShell renders it as a `NativeCommandError`,
which makes a clean run look like a failed one. Check the exit code, not the text.

Its own suggested fix — add `"type": "module"` to `package.json` — **is harmful**. That changes module
resolution for the whole Expo app, not just the lint plugin. Do not apply it.

**Colour literals in `src/themes.js` are correct.** `.oxlintrc.json` turns
`anti-slop/no-design-literals` **on** for `src/**` and explicitly **off** for `src/themes.js`, because
that file is the one place a colour is allowed to be written ([`CLAUDE.md` §3](../CLAUDE.md#3-the-ui)
rule 2). A tool reading the file without that override will flag every hex in it. All of them are
fine; the rule is that they exist *only* there.

---

## 5. Supabase

**`20260902000003_rls_auto_enable.sql` reports Success while installing nothing.** Creating an event
trigger needs superuser and the hosted `postgres` role is not one, so the migration's `DO` block
catches `permission denied to create event trigger` and only warns. The SQL Editor says *Success*,
`supabase db push` succeeds, and `ensure_rls` is **not installed**
([`CLAUDE.md` §6.1](../CLAUDE.md#61-every-new-table-needs-its-own-rls-line)). Treat a green result
here as meaning nothing. Write `alter table … enable row level security` in every migration by hand.

**`supabase db lint` is not an RLS check.** It type-checks plpgsql and says nothing about policies. A
clean `db lint` is not evidence that a new table is protected; the dashboard's Security Advisor
(`rls_disabled_in_public`) is what answers that question.

**Advisor output has not been collected into this file yet.** When a pass runs `get_advisors` and
meets a finding the docs already answer — a deliberate `security definer` function carrying all three
guards from [`CLAUDE.md` §6.2](../CLAUDE.md#62-three-things-every-security-definer-function-needs),
say — that is a §7 entry waiting to be written. Until then this section is short on purpose rather
than complete.

---

## 6. ponytail — what it actually flags here

**One `/ponytail-audit` has been run against the whole repo. It produced nine findings and none of
them were false positives.** Every one was a genuine cut: three triplicated Products-Setup sections,
four oversized units (`ProductDetail` 314 lines, `ProductForm` 324, `ProductList` 270, `toSavePayload`
at CRAP 2652), the dead Effect plugin from §2, thirteen unnecessary `export` keywords, and seven
unused type exports.

**So the default assumption for a ponytail finding in this repo is that it is real.** Do not reach
for this section first. Reach for it only when a specific finding matches a row below.

### Predicted, never observed

The list that follows was written *before* the audit ran, as a guess at what a reviewer would flag.
**The audit flagged none of it.** It is kept because each row is a real documented exception that
*would* be wrong to act on — but it is a prediction, not a record, and it must not be used to wave
away a finding that does not exactly match a row.

| If flagged | Why it stays | Where |
| --- | --- | --- |
| Two separate `AppState` listeners — `supabase.ts` and `query.ts` | Different jobs: token refresh start/stop, and reporting foreground to React Query | [`ARCHITECTURE.md`](../ARCHITECTURE.md) — "Both exist" |
| `.throwOnError()` on every Supabase call | Load-bearing. Without it postgrest-js returns a plain object, the `instanceof` in `postgrestError()` fails, and every code-specific message falls back to the generic one | [`data-layer.md` §3](./data-layer.md) |
| `key={columns}` on a `FlashList` | Insurance, not a requirement — it only changes when the container crosses a column boundary, which is already a full relayout | [`layout.md` §3](./layout.md) |
| A wrapper `View` that stays mounted with no children | Unmounting it stops it reporting a width, columns fall back to 1, and the bar reappears — a measure/render loop | commented at `src/app/(app)/(tabs)/_layout.tsx` |
| `profiles` is not `force row level security` | Forcing it subjects the owner to the policies, and the signup trigger inserts as the owner with no JWT | [`CLAUDE.md` §6.4](../CLAUDE.md#64-profiles-is-not-force-row-level-security) |
| Missing `persistSession`, `autoRefreshToken`, `detectSessionInUrl`, `lock` | The inverse case — a tutorial-trained model wants to *add* these. All four are already the default, `@deprecated`, or inert here | [`CLAUDE.md` §4.1](../CLAUDE.md#41-client-options-to-leave-off) |
| No barrel files / `index.ts` re-exports | They cost a file per folder, hide where a symbol comes from, and defeat the tooling that finds unused exports | [`structure.md` §9](./structure.md) |
| `Avatar.Text label=""` instead of a sized `View` | A hand-written `borderRadius` is forbidden under `roundness: 0`; `Avatar` is round through Paper's own stylesheet | [`visual-language.md` §7](./visual-language.md) |

### The one ponytail finding that needs a caveat

`useUnsavedGuard()` and `useShellWide()` are one-line `useContext` wrappers, and an audit can read
them as `yagni:`. They are two lines each and save an import at fourteen call sites. **Keep both or
cut both** — cutting one leaves two spellings of the same pattern, which is worse than either.

---

## 7. Adding to this register

Rule 5 is the whole mechanism, so make it cheap. An entry is four things:

- **The finding**, as the tool words it.
- **The tool**, and the command that produced it.
- **The evidence** that settles it — a dependent, a config reference, a file path, a documented rule.
  Not a plausible story.
- **The verdict**: confirmed false positive, or unverified. Those are the only two. A finding you
  decided to act on does not belong here; it belongs in the diff.

Prefer a **class** over a row where one exists. §2 retires seven duplication groups, two unused files
and three unused types in two table rows, because the reason is the same for all of them — a
per-finding list would have to be rewritten every time the schema is regenerated.

Three things to keep true:

**Re-check §1 against the tool whenever a dependency is added or removed.** Run
`npx fallow review --gate all --format json` and compare the package names. A register that has
drifted from what the tool actually prints is worse than no register, because an agent will trust it.

**An unverified entry is allowed to stay unverified.** Promoting one to "confirmed" needs the same
evidence bar as a new entry. Three open rows and an honest file beats fourteen rows and a file that
quietly started lying.

**Write from output, never from prediction.** §6 is the standing example: eight plausible rows,
written before the tool ran, and the tool flagged none of them. If a section has not been produced by
a command that actually ran here, label it — "predicted, never observed" — so the next agent can tell
a record from a guess.

---

## 8. Skills — rules this repo overrides

A skill review in the findings loop ([`testing-workflow.md` §2](./testing-workflow.md)) reads the
installed skills' rule text against this pass's diff. The skills are written for a generic Expo app,
and this repo has decided differently in the places below. A finding that restates one of these rows
is a registered false positive: one line in the findings file, no fix.

**Written from rule text, not yet observed in a run.** Each row cites the skill file that says it.
None has been produced by an actual review yet, so the §7 bar applies. When a run produces one of
these, add the finding's own wording beside the row. When a run produces a contradiction that is
*not* here, do not act on it: check the docs, then add the row.

Skill paths are relative to their install roots — `~/.agents/skills/` for the two Vercel skills,
`~/.claude/plugins/cache/claude-plugins-official/expo/<version>/skills/` for `expo-*`, and the
Callstack marketplace clone for `react-native-best-practices`.

### Frontend

| A skill will flag | Skill file | Why it stays | Where decided |
| --- | --- | --- | --- |
| Layout sized from the container's `onLayout` instead of `useWindowDimensions` | `expo-native-ui/SKILL.md`, Responsiveness | Window size is wrong under split-screen and Stage Manager | [`layout.md`](./layout.md) rule 2, §4 |
| `StyleSheet.create` instead of inline styles | `expo-native-ui/SKILL.md`, General Styling Rules | Decided the other way | [`visual-language.md`](./visual-language.md) rule 9 |
| No `boxShadow`; Paper elevation or outlined surfaces | `expo-native-ui/SKILL.md`, Shadows; `vercel-react-native-skills/rules/ui-styling.md` | Mockups are flat and ruled | [`visual-language.md`](./visual-language.md) §7 |
| On-page `PageHeader` instead of a navigation stack title | `expo-native-ui/SKILL.md`, General Styling Rules | Kicker, count and action have no place in a native header, and every navigator here hides its header | [`visual-language.md`](./visual-language.md) §5 |
| Paper components instead of `@expo/ui` | `expo-overview/SKILL.md`, component selection rule; `expo-native-ui/SKILL.md` | Paper and its theme are the component library, by choice | [`CLAUDE.md` §3](../CLAUDE.md#3-the-ui) rule 1 |
| Theme keys instead of `Color` from `expo-router` | `expo-native-ui/SKILL.md`, Colors; `expo-design-system/SKILL.md` | One palette in `src/themes.js`, read through Paper | [`visual-language.md`](./visual-language.md) §3 |
| `src/themes.js` instead of a `src/theme/` folder | `expo-design-system/SKILL.md`, The Theme | That skill's own "adopt before you build" defers to an existing system | [`CLAUDE.md` §3](../CLAUDE.md#3-the-ui) rule 2 |
| Paper `Text` with a variant instead of a `ThemedText` wrapper | `expo-design-system/SKILL.md`, Typography | No local text primitive | [`typography.md`](./typography.md) rule 1 |
| Several type sizes instead of weight-and-colour hierarchy | `vercel-react-native-skills/rules/ui-styling.md` | The nine variants are the scale | [`typography.md`](./typography.md) §2 |
| Paper `Menu` instead of zeego native menus | `vercel-react-native-skills/rules/ui-menus.md` | Native menus cannot take the accent; zeego is a native dependency | [`visual-language.md`](./visual-language.md) §7 |
| Drawer rail instead of native tabs for the merchant shell | `vercel-react-native-skills/rules/navigation-native-navigators.md` | Eight destinations; Android native tabs throw past five | [`visual-language.md`](./visual-language.md) §5 |

### Expo, structure and data

| A skill will flag | Skill file | Why it stays | Where decided |
| --- | --- | --- | --- |
| No Expo Go path; development build only | `expo-native-ui/SKILL.md`, Running the App | The native Google sign-in module is not in Expo Go | [`README.md`](../README.md), "Expo Go will not work" |
| No `hooks/`, `utils/` or `server/` under `src/` | `expo-project-structure/SKILL.md` | That skill is for new apps only, by its own rule | [`structure.md`](./structure.md) rule 7, §9 |
| Existing PascalCase files not yet kebab-case, UI still in `features/*` | `expo-native-ui/SKILL.md`, Code Style; `expo-project-structure/SKILL.md` | Adopted rule, migration backlog — only *new* files are findings | [`structure.md`](./structure.md), "Not yet in code" |
| `retry: false`, `STALE`, supabase-js instead of `retry: 2`, a five-minute `staleTime`, `expo/fetch` | `expo-data-fetching/SKILL.md` | Fail fast with a retry control; one network client | [`data-layer.md`](./data-layer.md) §5 |

### Performance

| A skill will flag | Skill file | Why it is not a finding here | Where decided |
| --- | --- | --- | --- |
| A missing `memo`, `useMemo` or `useCallback` with no profile behind it | `vercel-react-native-skills/rules/list-performance-item-memo.md`, `list-performance-callbacks.md` | Callstack's own guardrail: no memoization change without a measured render or FPS problem | [`optimization.md`](./optimization.md) rule 3 |
| Controlled `TextInput` (React Hook Form `Controller`) should be uncontrolled | `react-native-best-practices/references/js-uncontrolled-components.md` | The de-sync it fixes is a legacy-architecture problem by the guide's own account; this app runs the New Architecture. A finding needs measured input lag | [`optimization.md` §3](./optimization.md#3-already-decided-or-already-on) |
| A manual memoization rule when React Compiler is on | `vercel-react-native-skills/rules/list-performance-item-memo.md` | `app.json` `experiments.reactCompiler: true` already memoizes | [`optimization.md` §3](./optimization.md#3-already-decided-or-already-on) |
| Any rule under a web-only prefix: `server-*`, `async-api-routes`, `async-suspense-boundaries`, `bundle-dynamic-imports`, `bundle-defer-third-party`, `bundle-preload`, `client-swr-dedup`, `client-passive-event-listeners`, `client-localstorage-schema`, `rendering-hydration-*`, `rendering-script-defer-async`, `rendering-resource-hints`, `rendering-content-visibility`, `rendering-svg-precision`, `rendering-animate-svg-wrapper`, `js-batch-dom-css`, `js-cache-storage` | `vercel-react-best-practices/rules/` | Next.js, the DOM or browser storage; this app is native only | [`optimization.md`](./optimization.md) rule 2 |
