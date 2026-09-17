# Expo rules

How an agent uses the Expo plugin (`expo@claude-plugins-official`: 24 `expo-*` / `eas-*` skills and
the Expo docs MCP) before writing code that touches Expo, and where this repo overrides what those
skills say. What a screen looks like is [`visual-language.md`](./visual-language.md); where files go
is [`structure.md`](./structure.md); what happens after the code is written is
[`testing-workflow.md`](./testing-workflow.md).

## Rules

1. **Gate before code.** Load `expo-overview` first, and let it route you to the leaf skill, whenever
   the page or feature:
   - uses an Expo API or an `expo-*` package;
   - adds or changes navigation, a sheet, a native control or an animation;
   - installs a package.

   Read the leaf's `SKILL.md` before writing the first line. §2 has the usual routes for this app.
2. **SDK 57, pinned.** Read `https://docs.expo.dev/versions/v57.0.0/`, never `versions/latest`
   ([CLAUDE.md §2](../CLAUDE.md#2-how-to-work-on-this)). Before relying on an API a skill describes,
   confirm it in `node_modules` — a skill is written for "SDK 56+", not for the exact versions here.
3. **Install with `npx expo install <pkg>`**, never a bare `npm install`, so the version matches
   SDK 57.
4. **Never build, and never plan around Expo Go.** A change that needs a native rebuild — a new native
   dependency, a config plugin, an `app.json` plugin — is a thing to tell the human
   ([`device-testing.md` §1](./device-testing.md#1-why-the-human-opens-the-emulator)). Expo Go cannot
   run this app at all; the native Google sign-in module is not in it (README).
5. **These Expo skill rules are adopted for new code:**
   - `React.use` over `useContext`;
   - `process.env.EXPO_OS` over `Platform.OS`;
   - `expo-symbols` icons with `{ ios, android }` names;
   - `NativeTabs` for the `(tabs)` bar;
   - native `formSheet` for narrow sheets;
   - `expo-router/react-navigation`, never `@react-navigation/*` directly;
   - kebab-case files and `src/screens/`.

   §3 has the reasoning; `visual-language.md` and `structure.md` have the detail.
6. **Where an Expo skill contradicts a rule in `docs/`, the doc wins.** The standing contradictions
   are listed in §4 and registered in [`false-positives.md` §8](./false-positives.md#8-skills--rules-this-repo-overrides).
   A new one gets a row there in the same pass — never a quiet change to the code.
7. **No paid EAS step without the human.** `eas-*` skills (`eas-app-stores`, `eas-update`,
   `eas-observe`, `eas-simulator`, `eas-workflows`, `eas-hosting`) spend EAS usage. Load them only when
   the human asks for that service.

The rest of this file is why. Read it before overriding a rule, not before following one.

**Contents**

1. [Why a gate before code](#1-why-a-gate-before-code)
2. [Routes for this app](#2-routes-for-this-app)
3. [What was adopted, and why](#3-what-was-adopted-and-why)
4. [Where this repo overrides the Expo skills](#4-where-this-repo-overrides-the-expo-skills)
5. [The Expo MCP server](#5-the-expo-mcp-server)
6. [What is deliberately not here](#6-what-is-deliberately-not-here)

---

## 1. Why a gate before code

Without the skills, an agent building a screen here reached for what it knows best: web React made
responsive. Centred columns, margins, hover-shaped interactions, custom dialogs. The Expo skills are
written for native apps, and `expo-overview` is built as a router that names the right one for the
goal. Loading it first costs one file read. Skipping it costs a screen rebuilt after review.

The gate sits **before** code, not in the review loop, because the review loop
([`testing-workflow.md` §2.3](./testing-workflow.md)) can only flag a web-shaped screen after it
exists. The skills are cheapest as instructions, not as findings.

---

## 2. Routes for this app

`expo-overview`'s Skill Map covers every goal. The ones this app hits most:

| Goal | Leaf skill | Read with |
| --- | --- | --- |
| A new screen, its layout and controls | `expo-native-ui` | [`layout.md`](./layout.md), [`visual-language.md`](./visual-language.md) |
| Routes, stacks, the `(tabs)` bar, sheets, headers | `expo-router` | [`structure.md`](./structure.md) rule 4, [`visual-language.md` §5](./visual-language.md#5-mockup-patterns-built-with-paper) |
| Motion, gestures, press feedback, the keyboard | `expo-animation` | — |
| Fetching, caching, offline, screen states | `expo-data-fetching` | [`data-layer.md`](./data-layer.md) — it overrides the skill's defaults |
| Theme tokens, drift audits, "it looks AI-generated" | `expo-design-system` | [`visual-language.md` §3](./visual-language.md#3-colour-tokens) — the skill's "adopt before you build" defers to `src/themes.js` |
| Camera, audio, video, files, secure storage | `expo-native-ui` references (`media.md`, `storage.md`) | [CLAUDE.md §6.5](../CLAUDE.md#65-do-not-re-add-session-chunking) for SecureStore |
| A dev build, or a native dependency added | `expo-dev-client` | rule 4 — the human builds |
| Upgrading past SDK 57 | `expo-upgrade` | a pass of its own |

`expo-overview` also names `expo-tailwind-setup`. It is not in the installed plugin, and this app has
no Tailwind — Paper and `src/themes.js` are the styling system.

---

## 3. What was adopted, and why

Decided by the human on 2026-09-17, one skill rule at a time (System-History 12.1). Each was weighed
against whether the Paper theme still reaches the result.

| Rule | Why it was taken | What it costs |
| --- | --- | --- |
| `expo-symbols` icons | Each platform's own glyphs. Paper's icon renderer passes the theme colour through as `tintColor`, so icons still follow the theme | A name map with both halves; iOS unverifiable on this Windows machine |
| `NativeTabs` for `(tabs)` | Native tab bar, native behaviour | Colours are props wired from `useAppTheme()`, not inherited; not usable for the shell (eight destinations, Android caps at five) |
| Native `formSheet` for narrow sheets | Native gestures and keyboard handling | The sheet's frame belongs to the OS; a narrow confirm becomes a route |
| `Pressable` | The skills' press primitive | The ripple colour is passed by hand; Paper's `TouchableRipple` did it itself |
| `React.use`, `process.env.EXPO_OS` | Current React and Expo idiom | None; old call sites stay until touched |
| `expo-router/react-navigation` | Required on SDK 56+ | Already the case — `src/app/(app)/(tabs)/_layout.tsx` imports through expo-router |
| kebab-case, `src/screens/` | The skills' layout, so the agent stops fighting them | A one-time move of the existing screens |

**Rejected: adopting every Expo skill rule wholesale.** It would have replaced Paper with `@expo/ui`
and the theme palette with platform semantic colours. Colour changes would then no longer flow from
one file. Paper, the theme and the type scale were kept on purpose.

---

## 4. Where this repo overrides the Expo skills

| Expo skill says | This repo | Decided in |
| --- | --- | --- |
| Try Expo Go first | Development build only | README; rule 4 |
| Check `@expo/ui` before any other component | Paper primitives | [CLAUDE.md §3](../CLAUDE.md#3-the-ui) rule 1 |
| `Color` from `expo-router` in a `Platform.select` palette | Theme keys in `src/themes.js` | [`visual-language.md` §3](./visual-language.md#3-colour-tokens) |
| `useWindowDimensions` for sizing | The container's `onLayout` | [`layout.md` §4](./layout.md#4-measure-the-container-never-the-window) |
| Inline styles, not `StyleSheet.create` | `StyleSheet.create` | [`visual-language.md`](./visual-language.md) rule 9 |
| `boxShadow` strings | Flat, outlined surfaces | [`visual-language.md` §7](./visual-language.md#7-what-is-deliberately-not-here) |
| A navigation stack title, never on-page title text | `PageHeader` | [`visual-language.md` §5](./visual-language.md#5-mockup-patterns-built-with-paper) |
| A local `ThemedText` wrapper, an Apple text ramp | Paper `Text` with the nine variants | [`typography.md`](./typography.md) |
| `src/theme/` folder of token files | `src/themes.js` | [CLAUDE.md §3](../CLAUDE.md#3-the-ui) rule 2 |
| `hooks/`, `utils/`, `server/` under `src/` | Not created | [`structure.md` §9](./structure.md#9-what-is-deliberately-not-here) |
| `retry: 2`, five-minute `staleTime`, `expo/fetch` | `retry: false`, `STALE`, supabase-js | [`data-layer.md` §5](./data-layer.md#5-tanstack-query-conventions) |

---

## 5. The Expo MCP server

The plugin ships an MCP server, `https://mcp.expo.dev/mcp`, for searching Expo's docs. It needs a
one-time authorization in `/mcp`. Until the human does that, it is unavailable, and the pinned
version URL in rule 2 is the source.

Its answers are still subject to rule 2: a docs page can describe a newer SDK than the one installed,
so the API is confirmed in `node_modules` before code relies on it.

---

## 6. What is deliberately not here

**No Expo Go workflow.** Rule 4.

**No restructuring toward `expo-project-structure`.** That skill is for new apps and says so itself.
This repo adopted its `screens/` and kebab-case conventions by decision, not by following the skill's
tree ([`structure.md` §3](./structure.md#3-data-is-keyed-by-resource-ui-by-screen)).

**No agent-run EAS services.** Rule 7.

**No copy of the skills' content here.** This file names which skill to load and where the repo
disagrees. The skill text itself changes with each plugin update, and a copy would drift.
