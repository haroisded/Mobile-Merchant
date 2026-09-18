# Optimization

How performance is reviewed. Runs as the gated last row of
[`testing-workflow.md`](./testing-workflow.md) §1 — this file is what that step reads.

## Rules

1. **Load a performance skill only when the diff triggers it** — never as a blanket pre-read. §1 is
   the only gate table in the repo; no other doc says "load skill X"
   ([`token-budget.md`](./token-budget.md) §2).
2. **Skip the web-only rules.** `vercel-react-best-practices`'s `server-*`, `async-api-routes`,
   `async-suspense-boundaries`, `bundle-dynamic-imports`, `bundle-defer-third-party`,
   `bundle-preload`, `client-swr-dedup`, `client-passive-event-listeners`,
   `client-localstorage-schema`, `rendering-hydration-*`, `rendering-script-defer-async`,
   `rendering-resource-hints`, `rendering-content-visibility`, `rendering-svg-precision`,
   `rendering-animate-svg-wrapper`, `js-batch-dom-css`, `js-cache-storage` do not apply to a native
   app.
3. **Measure before memoizing.** No `memo`, `useMemo`, `useCallback`, atomic state or compiler change
   without a measured render or FPS problem behind it. No stale-closure claim without a repro or a
   profile.
4. **Check the installed version before an API-specific fix.** `@shopify/flash-list` 2.x has no
   `estimatedItemSize` — a finding asking for it is wrong on sight.
5. **Measure the right build — the human measures.** Device numbers come from a build the human runs
   and shares; the agent never builds or touches the device
   ([`testing-workflow.md`](./testing-workflow.md) rule 1). A development build's FPS is not the
   release app's — say which build a number came from.
6. **A finding carries its evidence:** skill and rule id, file:line, and one of — a measurement (FPS,
   commit duration, bundle size, TTI), a profiler result, or the rule text plus the version check
   (rule 4) for a rule that needs no measurement.
7. **Re-measure the same way.** After an optimization, ask the human to re-take the same number on
   the same build. If it did not improve, revert and try the next fix.

---

## 1. Gated triggers

Rows do not overlap: one diff area, one skill. The wording matches the skills' narrowed descriptions
([`TOOLING.md`](../TOOLING.md#narrowed-skill-descriptions)).

| Skill | Load when the diff changes | Read |
| --- | --- | --- |
| `vercel-react-native-skills` | FlatList/FlashList props, item renderers or list keys; Reanimated or gesture code; navigator/tab setup; native-module calls | `SKILL.md`, then only the matching `rules/*.md` |
| `vercel-react-best-practices` | component render logic, hooks, effects or state shape — outside the row above (rule 2 exclusions apply) | `SKILL.md`, then only the matching rule |
| `react-native-best-practices` (Callstack) | does not load on this machine ([`TOOLING.md`](../TOOLING.md#building-react-native-apps-does-not-load-on-windows)) — nothing to gate | — |

A diff touching only `schema.ts` or a Supabase migration loads none of these — [`data-layer.md`](./data-layer.md)
and [`tenancy.md`](./tenancy.md) already cover that code's concerns.

## 2. Already decided — do not re-propose

| Topic | State | Where |
| --- | --- | --- |
| React Compiler | On — `app.json` `experiments.reactCompiler: true`. Hand memoization rarely needed | `app.json` |
| New Architecture | On (SDK 57). Controlled-`TextInput` de-sync is a legacy-architecture issue by Callstack's own account — not a finding against React Hook Form `Controller` without measured input lag | README |
| Barrel files | Not allowed | [`structure.md`](./structure.md) §7 |
| Long lists | FlashList 2.x past a few screens' worth; FlatList for small bounded lists | [`layout.md`](./layout.md) §1 |
| Images | `expo-image`; request the displayed size from Supabase Storage | [`layout.md`](./layout.md) §7 |
| Layout measurement | The container's `onLayout` | [`layout.md`](./layout.md) rule 2 |
| Query retries and refetch | `retry: false`, `refetchOnWindowFocus: false`, stale times from `STALE` | [`data-layer.md`](./data-layer.md) §4 |
| Android R8 | `enableMinifyInReleaseBuilds`, `enableShrinkResourcesInReleaseBuilds` already set | `app.json` |
| Native navigators | expo-router `Stack` is native already; `(tabs)` uses `NativeTabs` | [`visual-language.md`](./visual-language.md) §4 |

## 3. How to measure here

| Question | Tool | Who runs it |
| --- | --- | --- |
| JS bundle size, what's in it | `npm run atlas` (Expo Atlas, JS-only export) | the agent may run it in the background |
| Re-renders, slow commits | React Native DevTools → Profiler, opened from Metro with `j` | the human runs it and shares the result |
| JS/UI FPS | Perf Monitor in the dev menu | the human, on the build the number is claimed for, and reports the number |
| Startup time (TTI) | not set up — needs `react-native-performance` markers | a separate decision |

Never add a profiling tool without asking.

## 4. Not used here

No speculative optimization pass — a screen that measures fine is finished. No performance budget
numbers without a baseline measured on a real device first. No copy of skill rule text — it changes
with each update; this file names what to load and what is already decided.
