# Expo

How to use the Expo plugin (`expo@claude-plugins-official`) before writing code that touches Expo,
and where this repo overrides it.

## Rules

1. **Gate before code.** Load `expo-overview` first and let it route you to the leaf skill whenever
   the work: uses an Expo API or an `expo-*` package; adds or changes navigation, a sheet, a native
   control or an animation; installs a package. Read the leaf's `SKILL.md` before the first line.
2. **SDK 57, pinned.** Read `https://docs.expo.dev/versions/v57.0.0/`, never `versions/latest`.
   Confirm any API in `node_modules` before relying on it — a skill is written for "SDK 56+", not
   the exact versions installed.
3. **Install with `npx expo install <pkg>`**, never bare `npm install`.
4. **Never build, and never plan around Expo Go.** Expo Go cannot run this app — the native Google
   sign-in module is not in it. A change needing a native rebuild (new native dependency, config
   plugin, `app.json` plugin) is a thing to tell the human, not to run.
5. **These skill rules apply to every screen:** `React.use` over `useContext`;
   `process.env.EXPO_OS` over `Platform.OS`; `expo-router/react-navigation`, never
   `@react-navigation/*` directly; kebab-case files and `src/screens/`. Icons, `NativeTabs` and
   `formSheet`: [`frontend.md`](./frontend.md) rules 2 and 20.
6. **Where an Expo skill contradicts a rule in `.claude/instruction_mds/`, the doc wins.** §3 lists the standing cases.
   A new one gets a row there in the same pass — never a quiet change to the code.
7. **No paid EAS step without the human.** `eas-*` skills (`eas-app-stores`, `eas-update`,
   `eas-observe`, `eas-simulator`, `eas-workflows`, `eas-hosting`) spend EAS usage. Load only on
   request.

---

## 1. Routes for this app

| Goal | Leaf skill | Read with |
| --- | --- | --- |
| A new screen, its layout and controls | `expo-native-ui` | [`frontend.md`](./frontend.md) |
| Routes, stacks, the `(tabs)` bar, sheets, headers | `expo-router` | [`structure.md`](./structure.md) rule 5 |
| Motion, gestures, press feedback, keyboard | `expo-animation` | — |
| Fetching, caching, offline, screen states | `expo-data-fetching` | [`data-layer.md`](./data-layer.md) — it overrides the skill's defaults |
| Theme tokens, drift audits | `expo-design-system` | [`frontend.md` §1–§2](./frontend.md) — `src/themes.js` is the existing system |
| Camera, audio, video, files, secure storage | `expo-native-ui` references (`media.md`, `storage.md`) | A file the person picks, or a folder to save into: `src/lib/files.ts` over `expo-file-system` 57.0.7 (`File.pickFileAsync`, `Directory.pickDirectoryAsync`) — already in the development build, so no rebuild. Not `expo-document-picker` or `expo-sharing` (the human, 2026-10-13) |
| A dev build, or a native dependency added | `expo-dev-client` | rule 4 — the human builds |
| Upgrading past SDK 57 | `expo-upgrade` | a pass of its own |

`expo-tailwind-setup` is not installed and this app has no Tailwind — Paper and `src/themes.js` are
the styling system.

Skills the human decided against adopting wholesale: `@expo/ui` components and platform semantic
colours. Paper, the theme and the type scale stay.

## 2. Exceptions inside rule 5

- `src/lib/` auth, storage and query files keep `Platform.OS`.

## 3. Where this repo overrides the Expo skills

| Expo skill says | This repo | Where |
| --- | --- | --- |
| Try Expo Go first | Development build only | rule 4 |
| Frontend: `@expo/ui`, `Platform.select` palettes, `useWindowDimensions` for sizing, inline styles, `boxShadow`, stack titles, `ThemedText` | Paper, theme keys, the window for the threshold only, `StyleSheet.create`, `PageHeader`, Paper `Text` + variant | [`frontend.md` §8](./frontend.md) — the rows live there |
| `src/theme/` folder of token files | `src/themes.js` | [`frontend.md` §1](./frontend.md) |
| `hooks/`, `utils/`, `server/` under `src/` | Not created | [`structure.md`](./structure.md) rule 1 |
| `retry: 2`, five-minute `staleTime`, `expo/fetch` | `retry: false`, `STALE`, supabase-js | [`data-layer.md` §4](./data-layer.md) |
| `expo-project-structure`'s tree | Only its `screens/` and kebab-case conventions | [`structure.md`](./structure.md) |

## 4. The Expo MCP server

`https://mcp.expo.dev/mcp`, for searching Expo's docs. Needs a one-time authorization in `/mcp`.
Until then, the pinned version URL in rule 2 is the source. Its answers are still subject to rule 2 —
a docs page can describe a newer SDK than the one installed.

## 5. Not used here

No Expo Go workflow. No restructuring toward `expo-project-structure` — that skill is for new apps by
its own rule. No agent-run EAS services. No copy of skill text in this file; it changes with each
plugin update.
