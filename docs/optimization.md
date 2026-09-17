# Optimization rules

How performance is reviewed in this app: which skills are the reference, what evidence a finding
needs, and what is already decided so it is not re-proposed on every pass. The review itself runs as
a collector in [`testing-workflow.md` §2.3](./testing-workflow.md); this file is what that review
reads.

## Rules

1. **The references are skills, not memory.** Performance is reviewed against:
   - Callstack's `react-native-best-practices` (FPS, re-renders, lists, TextInput, animations,
     bundle, TTI, memory, native modules);
   - `vercel-react-native-skills`;
   - the React-generic rules of `vercel-react-best-practices`.

   Read the `SKILL.md`, then the reference or rule file for what the diff touches. Do not optimize
   from recollection.
2. **Skip the web-only rules.** `vercel-react-best-practices` is written for Next.js. Its `server-*`,
   `async-api-routes`, `async-suspense-boundaries`, `bundle-dynamic-imports`,
   `bundle-defer-third-party`, `bundle-preload`, `client-swr-dedup`,
   `client-passive-event-listeners`, `client-localstorage-schema`, `rendering-hydration-*`,
   `rendering-script-defer-async`, `rendering-resource-hints`, `rendering-content-visibility`,
   `rendering-svg-precision`, `rendering-animate-svg-wrapper`, `js-batch-dom-css` and
   `js-cache-storage` rules do not apply to a native app.
3. **Measure before memoizing.** No `memo`, `useMemo`, `useCallback`, atomic state or compiler change
   without a measured render or FPS problem behind it. No stale-closure claim without a repro or a
   profile. This is Callstack's own review guardrail, and React Compiler is already on here (§3).
4. **Check the installed version before an API-specific fix.** For example, `@shopify/flash-list`
   2.0.2 has no `estimatedItemSize`, so a finding that asks for it is wrong.
5. **Measure the right build.** Performance numbers come from a build the human opens
   ([`device-testing.md` §1](./device-testing.md#1-why-the-human-opens-the-emulator)). A development
   build's JS FPS and render timings are not the release app's; say which build a number came from.
   The agent never builds.
6. **A performance finding carries its evidence:**
   - the skill and rule id (`react-native-best-practices/js-lists-flatlist-flashlist`);
   - file:line;
   - one of: a measurement (FPS, commit duration, bundle size, TTI), a profiler result, or — for a
     rule that needs no measurement, such as a `ScrollView` rendering an unbounded list — the rule
     text plus the version check from rule 4.

   Without evidence it is not logged.
7. **Follow the optimization workflow.** Measure → optimize → re-measure → validate. If the number did
   not improve, revert the change and try the next fix. The re-measure is part of the findings loop's
   re-test ([`testing-workflow.md` §5](./testing-workflow.md)).

The rest of this file is why. Read it before overriding a rule, not before following one.

**Contents**

1. [Why a file for this at all](#1-why-a-file-for-this-at-all)
2. [The skills, and the Ultimate Guide](#2-the-skills-and-the-ultimate-guide)
3. [Already decided or already on](#3-already-decided-or-already-on)
4. [How to measure here](#4-how-to-measure-here)
5. [What is deliberately not here](#5-what-is-deliberately-not-here)

---

## 1. Why a file for this at all

Before this file, optimization rested on a 321 KB guide in `.claude/context` and the hope that an
agent had read it and remembered it on the pass that mattered. Nothing asked for it, nothing checked
it, and there was no way to tell whether any screen had been reviewed for performance.

The skills now carry that guide's content in a form an agent loads on demand. This file makes the
review a step with a place in the loop and an evidence bar: without an evidence bar a performance
review turns into a list of speculative `useMemo`s.

---

## 2. The skills, and the Ultimate Guide

`react-native-best-practices` **is** Callstack's *Ultimate Guide to React Native Optimization*: its
`SKILL.md` says it is based on the guide, and its `references/` follow the guide's chapters one for
one. So the guide in `.claude/context/Documentations-for-AI-Agents/` is scheduled for deletion.

**It is not deleted yet, because the skill does not load on this machine.** The plugin's skill
entries are git symlinks, checked out as small text files while `core.symlinks` is off
([TOOLING.md](../TOOLING.md)). Until the human fixes that:

- the Callstack half of a review reads the matching chapter of
  `The_Ultimate_Guide_to_React_Native_Optimization__2025__with_alt_text.md`;
- the findings file says which source was used.

**Deletion trigger:** the first pass after `react-native-best-practices` appears in `/help` deletes
the guide, removes this section's fallback, and removes the fallback paragraph in
`testing-workflow.md` §2.3. That pass writes its own System-History entry.

---

## 3. Already decided or already on

Do not re-propose these; a finding that does is noise.

| Topic | State here | Where |
| --- | --- | --- |
| React Compiler | **On** — `app.json` `experiments.reactCompiler: true`. Hand memoization is rarely needed; the compiler rules that apply are `vercel-react-native-skills` `react-compiler-destructure-functions` and `react-compiler-reanimated-shared-values` | `app.json` |
| New Architecture | On (SDK 57). Callstack's controlled-`TextInput` de-sync problem is a legacy-architecture issue by the guide's own account, so `js-uncontrolled-components` is not a finding against the React Hook Form `Controller` inputs without measured input lag | README; the guide, "Uncontrolled Components" |
| Barrel files | Not allowed | [`structure.md` §9](./structure.md#9-what-is-deliberately-not-here) |
| Long lists | FlashList 2.x once a list can grow past a few screens; FlatList for small bounded ones | [`layout.md` §3](./layout.md#3-computing-columns) |
| Images | `expo-image`; request the displayed size from Supabase Storage | [`layout.md` §7](./layout.md#7-images) |
| Layout measurement | The container's `onLayout` | [`layout.md` §4](./layout.md#4-measure-the-container-never-the-window) |
| Query retries and refetch | `retry: false`, `refetchOnWindowFocus: false`, stale times from `STALE` | [`data-layer.md` §5](./data-layer.md#5-tanstack-query-conventions) |
| Android R8 | `enableMinifyInReleaseBuilds` and `enableShrinkResourcesInReleaseBuilds` already set | `app.json`, `expo-build-properties` |
| Hermes bundle compression | Not an issue: Callstack's `bundle-hermes-mmap` applies to React Native 0.78 and earlier; this is 0.86 | README, "What ships" |
| Native navigators | expo-router `Stack` is native already; `(tabs)` moves to `NativeTabs` | [`visual-language.md` §5](./visual-language.md#5-mockup-patterns-built-with-paper) |

---

## 4. How to measure here

| Question | Tool | Who runs it |
| --- | --- | --- |
| JS bundle size and what is in it | `npm run atlas` — Expo Atlas over a production export (`tools/atlas.mjs`). It exports JavaScript only, no native build | the agent may run it; it opens a viewer, so run it in the background |
| Re-renders and slow commits | React Native DevTools → Profiler, opened from Metro with `j` | the human opens it; the agent reads the result the human shares |
| JS and UI FPS | the Perf Monitor in the dev menu | the human, on the build the number is claimed for (rule 5) |
| Startup time (TTI) | cold starts only, per Callstack `native-measure-tti` | not set up; needs `react-native-performance` markers, a separate decision |

Callstack's profiling commands use `agent-device`, which is not installed here. Use its manual
fallback — React Native DevTools — and never add a tool to run a profile without asking.

---

## 5. What is deliberately not here

**No copy of the skills' rules.** They change with each skill update. This file names which to load
and what this repo has already decided; the rule text stays in the skill.

**No performance budget numbers.** A target FPS or bundle size needs a baseline measured on a real
device first. Set one when a measurement exists to anchor it.

**No speculative optimization pass.** Rule 3. A screen that measures fine is finished.
