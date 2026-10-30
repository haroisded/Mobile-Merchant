# Frontend

React Native Paper = one source of truth for UI. Its theme (`src/themes.js`) holds colour, type,
corners, spacing. Phones + tablets, iOS + Android. No web.

Replaces `layout.md`, `typography.md`, `visual-language.md`.

> **2026-10-08 teardown.** The app was cut back to the systems list, an empty in-system Home and the
> Account tab; the business screens (Register, Inventory, Stock, Receipts …) and the rows of this doc
> that only they used were removed. A pattern below whose file is marked **†** has no implementation
> now: it was deleted with the screens that used it. The pattern stands — when the first screen of
> the rebuild needs it, restore the file with `git show 07bd7aa:<path>` rather than writing a second.

## Rules

**Paper**

1. Every primitive = Paper component, imported from `@/components/<name>`. Never from
   `react-native-paper` (lint). Never `Text` from `react-native`.
2. Native exceptions, only these: `Pressable` (press targets), `NativeTabs` (`(tabs)` bar only),
   native `formSheet` (narrow confirms and pickers), `CameraView` (the product scan's picture —
   `src/screens/scan/`; Paper has no camera).
3. Customizing a Paper component is fine when needed: `style`, `contentStyle`, `labelStyle`,
   `titleStyle`, per-component `theme` prop, compositions. Every value still comes from the theme.
   Never re-implement a primitive Paper has.
4. Composition lives in its screen folder. Moves to `src/components/` when a second screen needs it.

**Theme values**

5. Colour = theme key, read through `useAppTheme()`. No literals (lint). Missing colour → new key
   in both themes + row in §2.
6. Type = `Text` with a `variant`. Never `fontSize`, `lineHeight`, `fontWeight`, `letterSpacing`,
   `fontFamily`, `textTransform`, `fontVariant` at call site. Need different type on a Paper
   component → spread a variant (`labelStyle={theme.fonts.titleSmall}`), never numbers.
7. Corners = `roundness` (Paper) or `radius.sm/md/lg/xl` + `borderCurve: 'continuous'` (hand-drawn).
   No radius number at call site. Avatars stay circular.
8. Spacing = step of `spacing`. `gap` between siblings, `padding` inside container. No sibling
   margins.
9. Accent only where §2.3 lists. Destructive = `error`, never `accent`.

**Type**

10. Same variants on phone and tablet. Never scale type by width, height, `PixelRatio`, device. No
    scaling libs (`react-native-size-matters`, `moderateScale`, responsive-fontsize).
11. Floor 11 (`labelSmall`, meta only). Readable content ≥ 14, secondary ≥ 12. Max weight 700.
12. Never `allowFontScaling={false}`. Font-scale caps live in the `Text` wrapper per variant (§3.2),
    never at call site. Body text never capped.
13. New variant = decision. Add to `src/themes.js` + §3.1 row, same pass.

**Layout**

14. One width threshold, `WIDE_MIN`. Source: `useWindowDimensions().width`, read once (§4.1).
    Screens read `useShellWide()`. No `isTablet`, device check, second breakpoint, tablet-only screen.
15. Column counts and pane sizes: container `onLayout` (`useColumns`). Never `Dimensions.get()`.
16. Wide container: grid cards → more columns. Row cards → second pane or `DataTable`. Never a wider
    row.
17. No fixed card width or height. Image → `aspectRatio`. Text → `numberOfLines`. Anything holding
    text → `minHeight`, never `height`.
18. Left-aligned everywhere: headings, copy, full-width button labels. Only floating surfaces
    (`Dialog`) are centred, plus four recorded exceptions: the sign-in column (nothing beside it to
    align with), the Create Store card's contents (one target, not reading), a full-page form's column —
    `PageHeader form`, `PageForm` and its `FormFooter` held to `FORM_MEASURE` and centred in a pane wider
    than it, so title, rule, fields and Save line up on a tablet (the human, 2026-10-23) — and a sale's
    receipt column, held to its paper's width (`InvoiceReceipt`). Running prose → `maxWidth`, no `alignSelf`.
19. Touch target ≥ 48 Android, ≥ 44 iOS.

**Code**

20. Icons: name from `ICONS` (`src/lib/icons.tsx`), both `{ ios, android }` halves, verified before
    use.
21. Static styles → `StyleSheet.create` at bottom of file. Inline only for render-time values
    (measured width, theme colour).
22. Doc silent → follow nearest existing screen, add the row here same pass.
23. Skill contradicts this file → this file wins (§8). New contradiction → new row, never quiet
    code change.

---

## 1. Where values live

Doc names keys and purposes. Code holds values. Differ → code wins, fix doc same pass.

| What | File |
| --- | --- |
| Colour keys, type scale, `roundness`, `spacing`, `radius` | `src/themes.js` |
| `useAppTheme()` — typed Merchant colour keys | `src/lib/theme.ts` |
| `WIDE_MIN`, rail / drawer / pane widths, the measures (`FORM_MEASURE` 720, `READING_MEASURE` 560, `DIALOG_MAX` 560 — no width literal at a call site), the sample receipt's widths, `useColumns`, `ShellWideContext`, `useShellWide()` | `src/lib/columns.ts` |
| `ICONS` map, `renderIcon` | `src/lib/icons.tsx` |
| Paper re-exports, `Text` wrapper, shared compositions | `src/components/` |

Both themes need every key — separate objects.

## 2. Colour

### 2.1 MD3 keys in use

| Key | For |
| --- | --- |
| `primary` | header + rail ground, primary buttons, selected segment, detail-card header strip |
| `onPrimary` | text + icons on `primary` |
| `onSurface` | body text, names, amounts, 2px structural rules |
| `surface` / `background` | screen + pane ground |
| `secondary` | secondary labels, unselected segment text, column headers |
| `outlineVariant` | field borders, 1px rules between blocks |
| `surfaceVariant` | thumbnail placeholders, tag fills, hairlines between rows, bulk action bar |
| `error` / `onError` | Void, Delete, destructive kickers, Low / Expiring / Expired badges |
| `errorContainer` / `onErrorContainer` | "hard delete blocked" callout |
| `backdrop` | dialog + sheet scrim |

### 2.2 Merchant keys (added)

| Key | For |
| --- | --- |
| `accent` / `onAccent` | §2.3 only |
| `onSurfaceMuted` | hints, SKUs, sub-lines, Draft status |
| `onSurfaceFaint` | placeholders, Inactive status, Empty pack |
| `surfaceMuted` | selected row, active form section, type badge fill, note callout ground |
| `surfaceSubtle` | toolbars, side panes |
| `primaryHighlight` | active rail / drawer item; ripple on `primary` |
| `ripple` | `Pressable` `android_ripple` on light surface |
| `success` / `successContainer` | the Sell page's Open session pill, and the success check (`SuccessMark`, `src/components/receipt.tsx`) over a receipt and Order completed — nothing else (2026-10-23) |
| `roleGrey` … `rolePink` (13) | a role's dot, its tag and the editor's swatches — and nothing else. One key per value of `roles.color` (`ROLE_COLORS`, `src/features/roles/schema.ts`), read through `useRoleColor` (`src/screens/employees/role-chip.tsx`); lighter in the dark theme |

Paper types `theme.colors` to MD3 only → read added keys through `useAppTheme()`.

### 2.3 Accent — only here

- The icon circle on the stores list's Create New Store card; the open screen's icon on the Features page
- The Features page's Hide all / Show all, and its dot on a screen with unsaved choices
- Active rail / drawer item: 4px bar. Active form section row: 3px bar
- Kickers
- Inline text actions: "Auto-generate", "Scan", "+ Add …", "+ New …", "Clear all", "Mark all as read", "Use the
  role's permissions"
- Toggle on. Stepper progress bar
- Note callout left rule. Count badge on a tab, a bell or a pane switch; an unread notification's dot
- Pack: Open status, remaining bar, **Next pick** badge (`accent` fill, `onAccent` text)
- The Store Guide's 2px ring around the control a guided step names (`GuideTarget`), and the step bar's kicker
- The Store Guide page's **Choose a Role** fill, its limit cards' numbers, and the role cards' permission bars

Everything else: ink on white.

### 2.4 Status

| Status | Colour |
| --- | --- |
| Active, Sealed, Shown (Features) | `onSurface` |
| Draft, Some pages hidden (Features) | `onSurfaceMuted` |
| Inactive, Empty, Hidden (Features) | `onSurfaceFaint` |
| Open (pack) | `accent` |
| Low, Expiring, Expired (lot), Void | `error` |

## 3. Typography

System font. No typeface loaded. One `configureFonts` call in `src/themes.js`, shared by both themes.

### 3.1 Scale

Mirror of `fonts` in `src/themes.js`. Change one → change both, same pass.

| Variant | For | Size / line | Weight | Tracking | Cap | iOS ramp |
| --- | --- | --- | --- | --- | --- | --- |
| `displaySmall` | one hero line per screen: Home greeting, paid figure | 32 / 40 | 700 | 0 | 1.5 | `largeTitle` |
| `headlineMedium` | screen title, name in detail header | 26 / 32 | 700 | 0 | 1.5 | `title1` |
| `headlineSmall` | heading inside screen, Home tiles, dialog + sheet title | 22 / 28 | 700 | 0 | 1.5 | `title2` |
| `titleLarge` | Appbar title — Paper picks it, never type it. MD3's app-bar size (was 18/24 to 2026-10-04) | 22 / 28 | 600 | 0 | 1.5 | `title3` |
| `amount` (custom) | money figure that is the point of its block; tabular digits | 20 / 26 | 700 | 0 | 1.5 | `title3` |
| `titleMedium` | list-row name, product name, rail brand line | 16 / 22 | 600 | 0.1 | 1.5 | `headline` |
| `titleSmall` | dense row name, open folder in breadcrumb | 14 / 20 | 600 | 0.1 | 1.5 | `subheadline` |
| `bodyLarge` | `TextInput` value — Paper picks it; long prose | 16 / 24 | 400 | 0.15 | none | `body` |
| `bodyMedium` | default body: field values, descriptions | 14 / 20 | 400 | 0.25 | none | `body` |
| `bodySmall` | secondary: SKU, hints, sub-lines, timestamps | 12 / 16 | 400 | 0.4 | none | `footnote` |
| `labelLarge` | rail + drawer labels; `Button`, `Chip` pick it | 14 / 20 | 600 | 0.1 | 1.5 | `subheadline` |
| `labelMedium` | kickers, field labels, column headers, badges, status tags — **uppercase** | 12 / 16 | 600 | 0.5 | 1.5 | `caption1` |
| `labelSmall` | floor: non-essential meta only | 11 / 16 | 500 | 0.5 | 1.5 | `caption2` |

- `displayLarge`, `displayMedium`, `headlineLarge`: Paper default, unused. Never type them.
- `labelMedium` carries `textTransform: 'uppercase'` in token. Write copy in normal case.
- `amount` carries `fontVariant: ['tabular-nums']` in token → digits align in columns.
- MD3 key in `configureFonts` merges over default: name only what changes. Custom key (`amount`)
  carries every property, `fontFamily` included.
- Line height ≥ 1.2 × size, always (§7).

### 3.2 `Text` wrapper

`src/components/text.tsx`. Call site passes `variant` only. Wrapper adds, per variant:

- `maxFontSizeMultiplier` — Cap column
- `dynamicTypeRamp` (iOS) — ramp column, so large text grows like native styles
- typing for `amount`

Cap logic: read content (body) uncapped. Scanned content (row names, labels) + hero text 1.5.

Paper components drawing own label (`Button`, `Chip`, `TextInput`) take their own
`maxFontSizeMultiplier` prop. Leave default unless layout breaks.

### 3.3 Variants Paper picks itself

| Component | Variant | Do |
| --- | --- | --- |
| `Button`, `Chip` | `labelLarge` | nothing |
| `Dialog.Title` | `headlineSmall` | nothing |
| `Appbar.Content` | `titleLarge` | nothing |
| `TextInput` value | `bodyLarge` (unverified vs 5.15.3 source) | nothing |
| `Card.Title` | `bodyLarge` / `bodyMedium` — body type on a heading | pass `titleVariant="titleMedium"` |
| `SegmentedButtons` | `labelLarge`, on one line, with no font-scale cap | import `src/components/segmented-buttons.tsx`: it passes each segment the variant's 1.5 cap |
| `List.Item` | none — raw `fontSize` from own stylesheet | `titleStyle` / `descriptionStyle` from `theme.fonts`, or build row from `Text` |

Override allowed when needed (rule 3) — spread a variant, never numbers (rule 6).

### 3.4 Phone vs tablet

Type does not respond to width. Reading distance barely changes phone → handheld tablet.

Responds to width instead: anatomy, column count, gutters, visible table columns (§4).

Tablet text too wide → `maxWidth` on the container, target 40–60 characters per line. Never bigger
type.

### 3.5 Surviving large font scale

OS setting scales `fontSize` + `lineHeight`. Layout must hold at 200%.

- No fixed height on anything holding text
- `flexShrink: 1` on text inside a row
- `numberOfLines` only where full text is reachable (detail view). Never truncate errors, prices,
  field labels
- Wide table unreadable at large scale → narrow anatomy for that list: table only when wide and OS
  font scale ≤ 1.15 (`useTableFits()`, `src/lib/columns.ts`). Table-vs-cards only; dialog-vs-sheet
  stays on `useShellWide()`
- Width holding a label (rail, tile) → `fontScaled(width)`, grows to the 1.5 cap. Layout, not type
  (rule 10)
- Human tests at Android 200% and iOS largest size, phone + tablet

## 4. Layout

### 4.1 Wide or narrow

- `wide = useWindowDimensions().width >= WIDE_MIN` — 600dp (M3 "medium"), since 2026-10-19: a tablet held upright
  (800dp) is wide; a phone, portrait-locked under 600, never is. Rejected: 840 (M3 "expanded", the value until then) —
  an upright tablet got the phone's drawer, rows and bottom bar
- Read once in `src/app/(app)/_layout.tsx` → `ShellWideContext` → shell, `(tabs)`, `sheets/` and
  screens call `useShellWide()`. Not lower: `(tabs)` + `sheets/` sit outside the merchant shell
- `(tabs)` bar hidden when wide: same threshold
- Window, not container: sync, no zero-width first frame, follows rotation + split-screen
- Screens never call `useWindowDimensions` for width

### 4.2 Columns

```
columns = max(1, floor(containerWidth / minCardWidth))
```

`useColumns(minWidth)` → `{ columns, onLayout }`. Container measured, not window: a pane beside the
rail is narrower than the window.

| List | Do |
| --- | --- |
| `FlatList` | `numColumns={columns}` + `key={columns}`. `columnWrapperStyle` gap. Items `flexBasis: 100/columns %`, not `flex: 1` |
| `FlashList` 2.x | gutter on the cell, half each side, same half off container padding. No `columnWrapperStyle`, no `estimatedItemSize`. `key={columns}` as insurance |

`FlashList` for long lists. `FlatList` for small bounded lists.

### 4.3 Cards

| Kind | Example | Wide container |
| --- | --- | --- |
| Grid card | system card, item tile | more columns |
| Row card | list row, document line | second pane or `DataTable` |

| Part | Rule |
| --- | --- |
| Image | fix ratio on wrapper `View` (`aspectRatio`), never pixel height. Placeholder in a grid card: 16:9 |
| Text | `numberOfLines` 2 on name, 1 on SKU |
| Card | no `height`. Siblings stretch to tallest |
| Controls | fixed size allowed: stepper button, toggle, thumbnail, touch target |

### 4.4 Wide / narrow pairs

| Where | Narrow | Wide |
| --- | --- | --- |
| Shell | drawer, off-canvas | rail, permanent, collapsible to icons |
| Long lists | card list | `DataTable` + bulk select |
| Item opened from list | own route | detail pane beside list |
| Long forms | stepper: "Step n of N", Next, progress bar | section list beside field grid |
| Confirms, pickers, Filters panel | native `formSheet` route | Paper `Dialog` |
| Small create/edit forms (a name and a few fields) | full-page route | Paper `Dialog` over the screen it was opened from: the same route as a `transparentModal` (the `forms/` routes) |
| Profile | the Account tab | Paper `Dialog` over the stores (`forms/profile`, `AdaptiveDialog asPage`), from the systems list's Account icon (the tab bar is hidden) |
| Access Codes | its tab | the same screen, reached from the floating toolbar's Access Codes, with a back arrow home (the tab bar is hidden) |
| Create Store | full-screen route, a `StepHeader` over each step | the same route as a `transparentModal`: both steps in `AdaptiveDialog asPage`; its Country list a second `Dialog` over it (the `SearchSelect` wide path) |
| Open Session, Close Session | their pages (`sell/open-session`, `sell/close-session`) | Paper `Dialog`s over the Sell page (`SessionAmountsForm dialog`); the routes stay for their other callers |
| Notifications | a pushed page from the bell, back arrow | the same |
| Multi-step flow ending in a review | stepper, Review as the last step | stepper left, Review sidebar right |
| Stores list | row cards, Create New Store first | grid, Create New Store first |
| Register | Products and Cart tabs under the header (the cart's count a `Badge`), one footer under both | Products left, the cart right — two equal panes, a 1px rule between, the same footer under both |
| Complete order (the payment) | native `formSheet` route `sheets/checkout` | Paper `Dialog` over the Register (`CheckoutDialog`) |
| Store Guide's role list | native `formSheet` route (`sheets/guide-roles`) | Paper `Dialog` over the Guide page |
| Store Guide's practice store | off-canvas drawer (`react-native-drawer-layout`), the shell's rows | rail, collapsible to icons |
| Features | the screens list, a screen a page further (`features/[name]`) | the list left (two parts in five), the open screen right — a rail destination beside the rail, as every other (2026-10-21) |

Same at both widths: long forms (full page; a section list beside Create Store's two steps would hold two rows),
a record with child rows or a sample under its fields (a page of the Setup
stack), multi-step flows (full-screen route).

Rejected for the small forms on a tablet (2026-10-04, the human's call): a full page — a 560dp
column on a 1180dp window, and centring it is §9's banned centred column; inline Dialog mounts in each
opener, the shape before a2b3259 — seven openers and two return paths; a side sheet. The Dialog route
kept one opener push and `src/Store/sheet-result.ts`†. Its keyboard: `KeyboardAvoidingView` around
the route plus the Dialog's `maxHeight`, since the edge-to-edge Android window does not resize.

All pairs flip together → one decision (§4.1).

### 4.5 Spacing

`spacing.xs … xxl` from `src/themes.js`, 4-point scale.

- Screen edge padding: one step, same on every screen — `spacing.md`. Narrow vs wide may differ one step. The sign-in
  column is the exception (rule 18). Found at `lg` on Account, the legal page and Create Store, 2026-10-22; brought to `md`
- `ScrollView` padding through `contentContainerStyle`
- Negative margin only to cancel a Paper built-in inset. Say so in a comment
- Fixed-size controls are sizes, not spacing

### 4.6 Images

`expo-image`, `contentFit="cover"`, inside `View` with `aspectRatio`.

- Request displayed size from Supabase Storage (`transform`). Bucket the width, never exact card
  width — CDN cache
- Transforms depend on Supabase plan. Without them: thumbnail at upload, store both paths
- Postgres stores storage path, never URL

### 4.7 On a wide container

| Changes | Stays |
| --- | --- |
| Anatomy (§4.4) | Type scale |
| Column count | Radius, border width, elevation |
| Gutters + padding, one step | Icon sizes |
| List → list + detail | Touch target minimum |
| Visible table columns | Image aspect ratios |
| Form grid: two columns or one | Left alignment |

## 5. Patterns

Paper piece per pattern. File named → use it, do not build a second.

Press targets: `Pressable` + `android_ripple={{ color: colors.ripple }}` every time
(`primaryHighlight` on `primary`).

### Structure

| Pattern | Build |
| --- | --- |
| 2px rule: under page header, above totals, between Home sections | `View`, `height: 2`, `onSurface` |
| 1px rule | between blocks `outlineVariant`; between list rows `surfaceVariant` |
| Page header | `src/components/page-header.tsx`: `labelMedium` kicker in `accent`, `headlineMedium` title, `bodySmall` count, contained `Button`, 2px rule. Actions beside title wide, own row under it narrow |
| Section heading | `headlineSmall` + `bodySmall` hint on same baseline |
| Full-width button | Paper centres label → `contentStyle` with `justifyContent: 'flex-start'` |
| Button width | narrow: full width, label left. Wide: content width (`alignSelf: 'flex-start'`), several in a wrapping row. Never a full-width button across a tablet |
| Pane switch (`SegmentedButtons`) | narrow: full width, own row under the page header. Wide: in the page header's actions beside the add button, `width: fontScaled(PANE_SWITCH)`† — segments are `flex: 1` and do not measure labels, so content width collapses them to 76dp. In the page header the segments split a set width equally, so the Dashboard's period switch there takes `fontScaled(padding + labels)` — padding scaled too — after "Last 7 Day…" was cut at 1.3 (2026-10-19). Three segments (the Dashboard's period switch) can outgrow a phone at a large font scale: a horizontal `ScrollView` around the switch, its `minWidth` the segments' padding plus `fontScaled(<labels>)`, so it fills the row at the default size and slides sideways past it — never a cut-off label. Rejected: shorter labels than the feature's own ("7 Days") |

### Shell

| Pattern | Build |
| --- | --- |
| Header | `Appbar.Header` on `primary`: menu `Appbar.Action`, `Appbar.Content`, bell + Your systems (`grid`) actions. Your systems is the way out of a system: on iOS the left-edge swipe opens the drawer, so there is no back gesture. Features is the rail's last item and always shown (`fixed` in `destinations.ts`), so hiding every screen still leaves the way back |
| Rail / drawer | expo-router `Drawer`, `drawerType` `'permanent'` wide, `'front'` narrow. `drawerStyle` zeroes the hairline border, front-drawer corners `radius.xl`. Rail square + flush |
| Rail / drawer item | `Pressable`: `Icon` + `labelLarge`. Active: `primaryHighlight` ground, 4px `accent` bar left. Less what the person hid on the Features page (`menuOf`, `src/components/destinations.ts`), then listed by `showsDestination` (`src/features/permissions/access.ts`): for someone who may open a row of the destination's index (`readsAny`, over the sections that index exports), or who holds one of the permissions its row names, or the owner alone (Employees): Home always, the owner everything, a member Home alone until their permissions load. Rejected: not registering the screen — a deep link must still land, and the index already says when it has nothing to show |
| Group row | opens / closes its screens, not a destination (none now: Home, Stock and Setup are the destinations) |
| Destination with a stack | Stock and Setup (`systems/[id]/stock/`, `systems/[id]/setup/`, each its own `Stack`): a tap on one always lands on its index, as a rail item should |
| Destination of one screen | the Dashboard (`systems/[id]/dashboard.tsx`): a route file and no `Stack`. It has no index, so its `DESTINATIONS` row names the permissions behind its blocks (View Sales, View Shift Totals, Close Any Register, View Stock Levels) and it is listed for whoever holds one. The shell navigates to it with `{ id }`, as to every destination |
| Collapse to icons | menu action toggles `RAIL_EXPANDED` / `RAIL_COLLAPSED` |
| `(tabs)` bar | `NativeTabs`. Colours passed as props from `useAppTheme()` — `PaperProvider` does not reach native views. Icons: `{ sf, md }` halves of the map |
| System badge | `Avatar.Text` on `onPrimary` |

### Lists

| Pattern | Build |
| --- | --- |
| Wide list | `DataTable`: `src/components/header-title.tsx` per column (label string, `textStyle` = `labelMedium`, start-aligned), `Checkbox.Android` bulk column, `IconButton` row actions |
| Narrow list | `FlashList` rows: thumbnail, `titleMedium` name, badge, `bodySmall` meta, amount right-aligned |
| Index of records (Setup, Stock, Accounts) | `src/components/record-index.tsx` (`RecordIndex`), given its sections by `src/screens/setup/index.tsx`, `src/screens/stock/index.tsx` and `src/screens/accounts/index.tsx`: a section heading over a 1px `outlineVariant` box of rows — `titleMedium` + `bodySmall` hint + chevron, `surfaceVariant` hairlines. Sections in columns from `useColumns`. A row shows only with Read on its doctype — or the permission its `ptype` names, for a row that is an action (Import Items: Item create) — and while the person has not hidden it on the Features page; a section left empty goes. Each row carries `details` (what the Features page says of it) and, for the screen's core, `core` |
| A Setup master's list | `src/components/record-list.tsx`: `DataTable` wide when `useTableFits`, rows narrow; `StatusText` for the status words; a pinned `header` row (the owner on Employees). Items and Item Prices under Stock are the same list with the Search field above it, filtering what is loaded |
| Employees list | `src/screens/employees/index.tsx`: `PageHeader` (kicker the system, "n employees", outlined **Roles** — and **Permissions** wide), an outlined dense search, `FilterChips` All · each role · No role, then `RecordList`: the owner pinned on `surfaceMuted` ("You · Owner · Every permission"); rows of name, email and a role tag narrow, the mock's table wide (Employee, Contact, Role, Edit). A row opens that employee's permissions |
| Role dot, role tag | `src/screens/employees/role-chip.tsx`: `RoleDot`, a 10dp circle in the role's colour (§2.2); `RoleChip`, the dot and `labelLarge` name in a `radius.xl` `surfaceMuted` tag with a 1px `outlineVariant` border — "No role" in `onSurfaceFaint`, with no dot |
| Bulk action bar | `surfaceVariant` strip: clear `IconButton`, count in `labelLarge`, text `Button`s, Delete in `error` |
| Search | outlined dense `TextInput` + `TextInput.Icon` |
| Filter + sort | wide: one toolbar row — Search, outlined `Button` "Filters · n", Sort `Button` anchoring `Menu`. Narrow: Search on its own row, the two buttons under it. Active filters: `Chip`s with `x`, then `accent` text `Button` "Clear all" |
| Filters panel | `src/components/list-filters-dialog.tsx`†. Selects, `SegmentedButtons` (2–4 options), toggles. Applies as changed: Done, no Apply |
| A ledger report (General Ledger, Stock Ledger, Stock Balance) | `src/components/ledger-filters.tsx`: `PageHeader`, then `LedgerFilterBar` — outlined `Button` "Filters · n", a `Chip` per filter in force with `icon="close"` (tapping the chip removes it; not `onClose`, §7), `accent` text `Button` "Clear all" — over a `RecordList`. The panel is the route `forms/ledger-filters` (`LedgerFiltersPanel`, `AdaptiveDialog asPage`: a page narrow, a Dialog over the report wide), its state in `src/Store/ledger-filters.ts`; a pick applies at once, a typed number on blur or Done. Rejected: a formSheet — it cannot host the picker a select opens. A row opens its document through `useVoucherRoutes` |
| Document page (Stock Entry, Stock Reconciliation) | `src/components/document-page.tsx` (`DocumentPage`): `PageHeader` with the number as title and the status as its meta line — Draft, Submitted, Cancelled — and in its actions what the status and the permissions allow: contained Submit and red outlined Delete on a draft, red outlined Cancel on a submitted one, then outlined Stock Ledger and General Ledger once posted. A cancelled document shows the red Delete again while Accounts Settings' Delete Ledger Entries with the Document is on. Submit, Cancel and Delete confirm through `useConfirm` (Submit with `tone: 'accent'`; Cancel's way out reads "Keep it"). That header is `DocumentHeader`, which a page with no form uses by itself — a POS Invoice, whose own action (**Return**, outlined, no icon, for whoever holds Process Refunds) goes in its `extra` slot after Delete and whose `note` follows the status ("Submitted · Return against …"). Under it `PageForm`, editable while a draft; a figure Submit wrote onto a row is `PostedAmount`. Save keeps the page open: a new document becomes the saved one in place. A new document's Posting Date is `todayIn` the system's time zone, never the device's day |
| Folder row + breadcrumb | `src/components/folder-nav.tsx` (`TreeBrowser`, `useFolder`): the tree masters, Chart of Accounts, Warehouses (a warehouse's row names the stock account it resolves to, and where from) and Item Groups (a group's row counts its defaults and item taxes; it has no Disabled, so `disabled` is optional). Each folder = push of the list route with `parent`, Back climbs one; a group is a `folder` row, a ledger a plain row. Wide where the table fits (`useTableFits`): the same rows as a `DataTable` under the breadcrumb — the noun's column (Account, Warehouse, Item Group; the folder icon in it, a 22dp space on a ledger) and Details, then the chevron — never one row across a tablet (rule 16) |
| Status badges (Low, Expiring, Expired …) | `labelMedium` in `error` (`src/components/product-badges.tsx`†) |
| Type badge | `View`, 1px `outlineVariant` border, `surfaceMuted`, `labelMedium` |
| Thumbnail placeholder | `View` on `surfaceVariant` + `Icon`. Real image: `expo-image` |

### Forms

| Pattern | Build |
| --- | --- |
| Section list (wide) / stepper (narrow) | `src/components/section-stepper.tsx`†, `step-header.tsx` (restored for Create Store). Optional step: "· Optional" + text `Button` "Skip tier" |
| Field label | `labelMedium` above control. Required: label ends ` (required)`. Optional: no marker. Hint `bodySmall` right |
| Text field | outlined dense `TextInput`, no floating `label`. `left` / `right` affixes for currency + units |
| Multi-line text field (a letter head, a footer note, the naming series one per line) | `ControlledText` with `multiline`: the same outlined field, growing with its lines. A list typed one per line reports a mistake by its line ("Line 2 repeats …") |
| Select | `src/components/menu-select.tsx`†: non-editable outlined `TextInput` anchoring `Menu` |
| Searchable select (a list too long for a `Menu`: countries, currencies) | `src/components/search-select.tsx`: the Select shape + `chevron-down`, opening a picker with a Search box. Narrow: `src/app/(app)/sheets/pick.tsx` — options and callback handed over in `src/Store/picker.ts`, since a route takes neither as a param. Wide: `AdaptiveDialog` |
| Field grid | `src/components/form-fields.tsx`: `FieldGrid` + `Field` — two half fields to a row while the grid is wide enough for two of `fontScaled(HALF_MIN)` (220), else one per row (a pane beside another: the Register's cart upright), the grid keyed by that choice (§7); and `ControlledText` / `ControlledSwitch` / `ControlledDate` / `ControlledChecklist` bound to a react-hook-form `control`; each takes `disabled` for a read-only form and shows its field's error under it (a switch too: "A disabled template cannot be the default"). `ControlledText` takes `keyboardType` (`decimal-pad` for a rate or amount). `ControlledSelect` (`search-select.tsx`) binds a searchable select |
| Create Store (two steps) | `src/screens/home/create-system.tsx` on its route — full-screen narrow; wide, the same route as a `transparentModal` with the steps inside `AdaptiveDialog asPage` (Next / Create Store its actions): `StepHeader` (`src/components/step-header.tsx`: "Step n of 2", the step's title, an `accent` `ProgressBar`; its back greyed out on step 1). Step 1 "Your store" — the three fields and a contained **Next**, which checks them first; step 2 "Its level" — `headlineSmall` "How much do you want to manage?", a `bodyMedium` line, the level picker, contained **Create Store** and the write's notice. The step's back and Android's back on step 2 return to step 1 with the fields kept; the app bar's back leaves |
| Level picker (a store's level) | `src/components/level-picker.tsx` (`LevelPicker`), Create Store's step 2 and Features' Store Level form: one 1px `outlineVariant` box of five rows, `surfaceVariant` hairlines — `RadioButton.Android` in `accent` (drawn only: the row is the control, `accessibilityRole="radio"`), `titleMedium` "Level n · Name", `bodyMedium` summary, `bodySmall` muted "· what it gives" lines; the picked row on `surfaceMuted`. Levels: `src/features/merchants/levels.ts` |
| Item form by level | `src/screens/items/item-form.tsx`: the store's level picks the parts (`itemPartShown`) — level 1 Item Name (required), Barcode, Scan Product, Selling Price, Stock on Hand, Cost per Unit; 2 adds Item Group, Unit, Description, Maintain Stock, Disabled, Re-order Level; 3 Item Code, Brand, Units of Measure, the rest of Inventory; 4 Defaults, Discounts, Item Tax. A part shows at any level when the system has nothing to fill it with (a typed code, a group or unit Stock Settings does not name). Levels 1–2 read Selling Price / Stock on Hand / Cost per Unit; 3+ the books' words |
| Checklist (a role's members) | `ControlledChecklist`: one `Checkbox.Android` row per option, the whole row pressable, its hint under the label ("Currently: Cashier") |
| Permission switches | `src/screens/employees/editor/permission-switches.tsx`: an outlined dense search, then per category a `labelMedium` heading in `secondary` over a 1px `outlineVariant` box of rows — `titleSmall` name, `bodySmall` muted line ending "Needs …" where one is required, the whole row pressable, a `Switch` in `accent` at the end. On an employee's page a row their own setting overrides carries a boxed `labelMedium` tag "Role: On" / "Role: Off". A switch turned on brings what it needs; off, it takes what needs it (`toggle`) |
| Role editor (a role's page; a tablet's right pane) | `src/screens/employees/editor/role-editor.tsx`: `SegmentedButtons` General · Permissions · Members; General is Role Name, Description and **Colour** — 13 swatches, 48dp touch targets, the picked one ringed in `onSurface` (radio semantics); then `EditorFooter`. Narrow, Delete is the page header's and Back discards; wide, the footer carries Delete Role, Discard Changes and Save Changes. Save Changes is greyed out while nothing changed on a saved role — read through `useFormState`, never `form.formState` in a child: the React Compiler keeps a child from re-rendering for the stable `form` object (device run, 2026-10-14) |
| Access editor (an employee's permissions) | `src/screens/employees/editor/access-editor.tsx`: a searchable **Role** select (No role, then each role with "n permissions"), a note callout saying how far the employee is from the role, an `accent` text `Button` "Use the role's permissions" while they differ, the permission switches, `EditorFooter`. Another role keeps the employee's own exceptions |
| Two panes on a tablet (Roles, Permissions) | the list left (two parts in five), the editor right; opening another row with unsaved changes asks first — `useDiscard` (`src/screens/employees/use-discard.ts`): "Discard your changes?", Keep editing and a red Discard. Narrow, each is its own page |
| Inline-create select | Select + last `Menu.Item` "+ New …" in `accent`. Created row comes back selected |
| Date / time field | Select shape + `calendar` / `clock` icon → `DateTimePicker` (`@expo/ui/community/datetime-picker`; `ControlledDate`). Android: its own Material dialog. iOS: inline picker in dialog, Done. Held as `YYYY-MM-DD` (`src/lib/dates.ts`). An optional date (Accounts Frozen Till) takes `clearable`: a `close` `IconButton` beside it while it holds one |
| Default-account select (Store, Mode of Payment) | `ControlledSelect` over `ledgerOptions` (`src/features/accounts/queries.ts`): None first, then the enabled ledgers the field takes; the saved one stays listed. A name shows bare — no " - ABBR" (one store, no branches) |
| Form section heading (the Company's Accounts and Stock, an Item Group's Defaults) | `src/components/section-heading.tsx`: `headlineSmall` + `bodySmall` hint between two `FieldGrid`s in one `PageForm` |
| Segmented field, type selector | `SegmentedButtons`. Wrap two per row narrow |
| Toggle | Paper `Switch`, on colour `accent`, sentence in `bodyMedium` beside |
| Tags, date list | `Chip`s with `x` in wrapping row, then text `Button` "+ add …". Remove label on `closeIconAccessibilityLabel` |
| Repeatable rows | `src/components/repeatable-rows.tsx` over react-hook-form `useFieldArray`: a 1px `outlineVariant` box per row, `labelMedium` "Row n" + remove `IconButton` (`close`), the row's own `FieldGrid`; then `AddRowButton`, the `accent` text `Button` "+ Add …"; `RepeatableList` is the whole table — the line an empty one shows, the rows, the add button. A row shows only the fields its type uses (a tax row's Tax Amount for Actual, Reference Row # for the previous-row types) |
| Fields two records share | `src/components/sales-defaults-fields.tsx` (the four sales defaults of an Item and an Item Group, with `useSalesDefaultsRecords`) and `src/components/item-tax-fields.tsx` (an Item Tax row's three fields, with `useItemTaxRecords`): the fields and the lists they pick from, the form's own names passed in. Rejected: the same block written twice — fallow reports it as duplication |
| Record form with child rows (Sales Taxes and Charges Template, Item Group, Item, POS Profile, Pricing Rule) | a page of its destination's stack at every width, not a `forms/` Dialog: `PageHeader` with the red Delete in its actions — `src/components/record-page-header.tsx` (`RecordPageHeader`) is that header with its confirm and its pop, for a new such page — then `PageForm` — fields, a form section heading, the repeatable rows. Save stays live on a record not yet saved, so it names what is missing. Its confirmed delete pops the page through its own `useNavigation()` and, on a phone, the confirm's sheet of the outer stack with `router.back()`. Rejected: `router.dismissTo` the list — from the sheet, React Navigation 7's nested navigate pushed a second list over the deleted page (device run, 2026-10-09) |
| Calculation sample (Test Template's, a saved tax template on a sample line) | sample inputs held in a local form, then `src/components/sample-box.tsx` (`SampleBox`, `SampleLine`), the Currency page's sample box: `bodyMedium` label left, `amount` value right, a `bodySmall` running total under a row. "This template's rows don't add up as saved" when they do not parse, "This template has no rows" when it has none. Stock Settings' FIFO / Moving Average example is the same box, static, the chosen method first |
| Sample receipt (Print Format) | `src/screens/print-formats/receipt-sample.tsx`, under a form section heading on the format's Setup-stack page: a 1px `outlineVariant` box drawn from the unsaved values, left-aligned — `bodyMedium` lines, `titleMedium` heading, 1px rules, `SampleLine` totals, `bodySmall` words; `maxWidth` from the paper (`RECEIPT_58MM` / `RECEIPT_80MM` through `fontScaled`, A4 the form's measure). A `bodySmall` muted line under the box says why something is missing (no default letter head, no readable tax rows) |
| Receipt (a POS Invoice, the Print Format's sample) | `src/components/receipt.tsx` (`Receipt`, `useReceiptRecords`): the drawing the sample row above describes, fed a real sale by `src/screens/pos-orders/pos-invoice.tsx` — its number and date as `bodySmall` muted lines under the heading, and after the totals a rule and a `SampleLine` per payment, Change and Write Off. What the discounts took — "Item Discount", "Additional Discount (5%)" — is a `SampleLine` each above the Net Total, below zero. A return prints as stored, below zero, with a "Return against …" meta line and each payment as "Refund · <method>". `banner` puts the `SuccessMark`, the store's name in `titleMedium` and a muted line ("Refund successful") over everything. On screen only: reopening the sale from Orders is the reprint |
| Sale page (a POS Invoice) | `src/screens/pos-orders/pos-invoice.tsx`: `PageHeader` kicker "POS Invoice", the number, its status (and "Return against …"), a cancelled sale's red outlined **Delete** its one action. Then `InvoiceReceipt`, a column at the receipt's paper width, centred (rule 18): a row of `headlineSmall` "Receipt" (a refund's "Refund") with the outlined **Stock Ledger** / **General Ledger** at its end, the receipt with its banner while it stands, then side by side a contained **Refund** (Process Refunds, something left) and a contained **Cancel** on `error` / `onError` (Void Transactions); its refunds as a `SectionHeading` and one outlined `Button` each. Opened by the sale just made (`after=sale`): no back arrow, an outlined **Return to Register** under the buttons, and Back — Android's, the iOS swipe — does the same (`useBackAs`). From Orders or a ledger: the back arrow, no Return to Register |
| Refund page (a sale's refund) | `src/screens/pos-orders/pos-return.tsx`: `PageHeader form` with the kicker "Refund", the sale's number and the session; `PageForm` with `saveLabel="Approve Refund"`. A `SectionHeading` "Items" over a 1px `outlineVariant` `radius.lg` box, a block per line split by 1px rules — `titleMedium` name with the rate per unit at its end, a muted `bodySmall` "n sold, n left to return", `NumberField` "Quantity to Return" prefilled with what is left; a `SectionHeading` "Refund" (its hint names the one method) over a `SampleBox` of the refund's totals above zero and "Refund · <method>". No field per method: the whole refund goes back by one (`refundMethod`, `src/features/pos-invoices/cart.ts`). Approve Refund shows the refund's receipt in the same route — `PageHeader` "Refund" with "Not saved yet", no back arrow; `InvoiceReceipt` with the banner "Refund approved · saved when you return to the Register"; a contained **Cancel** on `error` (back to the quantities as left, and so does Back) and an outlined **Return to Register**, which sends it through `sendOnce` and lands on the Register (`toRegister`, `src/components/ledger-filters.tsx`). What stops it is the form's notice; a refusal is the receipt's |
| Rail destination with a status box (Sell) | `RecordIndex` with `children`: a 1px `outlineVariant` box above the sections — `titleMedium` state, `bodySmall` muted line, then a contained primary and an outlined secondary `Button` in a wrapping row. The box shows for whoever may open a session (POS Opening Entry create); **Register** in it only with Process Sales |
| Register (items to sell) | `src/screens/register/index.tsx`: `PageHeader` (kicker the POS Profile, "Register", the session), an outlined dense search `TextInput` with the `search` icon beside a 50dp outlined `scan` `IconButton`, a `FlashList` of rows — `titleMedium` name, `bodySmall` muted facts (code · price · on hand) and a 32dp circle at the end: `add` in an `accent` ring, or `check` on `onSurfaceFaint` once in the cart, the row then on `surfaceMuted` with `onSurfaceFaint` text. A tap toggles the item: in at one, out whatever its quantity (the human, 2026-10-23). Narrow, Products / Cart tabs (`labelLarge`, a 3px `accent` underline on the open one, the cart's line count a `Badge`); an emptied cart goes back to Products. Wide, the two side by side. Under both, the footer: muted "n lines · n items", the total in `titleLarge`, a contained **Complete Order** greyed out while empty |
| Product scan (Scan Product, Scan to Sell) | `src/screens/scan/index.tsx` on the full-screen route `scan` at every width (visualization/revamp/Merchant · Scan Product.html): an `Appbar` with the back arrow and the opener's title; the camera pane on `primary` — `CameraView`, four 4dp corner marks (`accent` while a label is read, with a sweeping line; still under reduced motion) and a status pill on `backdrop` at its foot, lifted by `useBottomInset()` on a tablet, where the pane reaches under the navigation bar ("Ready to scan", what a barcode did, "Reading label…"; a refusal in `accent`). Beside it on a tablet (a `SCAN_PANEL` panel, `fontScaled`, 1px rule), under it on a phone: the hint, on the Item form a contained **Read Label** (`camera`) and an outlined **Choose Photo** side by side, a `titleMedium` "Scanned" with "n products", the rows — `titleSmall` title, muted sub, a `close` `IconButton` that takes that scan back — or a dashed `outlineVariant` box, and a foot with text **Done** and an `error` text **Clear** (every scan taken back). Without the camera, the pane holds a `bodyMedium` line and **Allow Camera**, or **Open Settings** once refused for good. Opened by an outlined **Scan Product** (`scan` icon) at the top of the Item form for whoever may write it, and by the Register's scan button |
| Cart and payment | `src/screens/register/cart.tsx`: `CartPane` — `headlineSmall` "Cart", muted "n lines", an `accent` text **Clear all** (a confirm); a card per line (1px `outlineVariant`, `radius.lg`): `titleMedium` name, muted "₱ per unit · n% off · rule" (in `error` when no price list prices it), the `delete` `IconButton`; a row of the quantity stepper ("Quantity" and the unit, outlined `minus` / `add` `IconButton`s round a 72dp field), an outlined **Discount** `Chip` with an `accent` "on" `Badge` while a typed rate or discount stands (where the profile allows either), and the amount at its end; the UOM `SearchSelect` where the item sells in several; the chip opens Rate / Discount (%) / Discount Amount under a 1px rule — typing one empties the other two. Empty: a dashed box. Complete Order opens **Complete order** (`CheckoutDialog`, an `AdaptiveDialog`): the count, Additional Discount where allowed (two `NumberField`s, Apply Discount On as `SegmentedButtons`), a `SampleBox` of totals, "Payment" with a field per method and outlined `Chip`s (Exact, then the notes 100 · 200 · 500 · 1000 above the total) filling the default one, a `SampleBox` of Paid and Change / To Pay / Write Off, the notice, outlined **Back to cart** and contained **Complete Order**. After the sale: the receipt's page (`after=sale`) where the profile prints one, else "Order completed" — the `SuccessMark`, the order's number, total and change, **New sale** |
| An amount per payment method (Open Session, Close Session) | `src/components/session-amounts-form.tsx`: `PageForm` with the screen's own button label, a `FieldGrid` of decimal fields, one per method, blank meaning 0 — or, given `dialog`, the same fields in an `AdaptiveDialog` with outlined **Cancel** and the contained button. Key it by what the methods come from |
| Sell page | `src/screens/sell/index.tsx`: `RecordIndex` with the cashier's session card first — 1px `outlineVariant`, `radius.lg`: `titleMedium` "Session …" with a pill (Open on `successContainer` / `success`, Closed on `surfaceMuted`), a muted "profile · Open since …" line, for who may look up sales a three-cell strip (Orders, Cash in drawer, Opening cash; `drawerCash`, `src/features/pos-invoices/cart.ts`) split by 1px rules, then contained **Register** and outlined **Close Session** — or "No session is open", Closed, and **Open Session** |
| Import page (Import Items) | `src/screens/import-items/index.tsx`, a page of the Stock stack: `PageHeader`, then `PageForm` with `saveLabel` "Import n Items", greyed out until a file is chosen and nothing is wrong with it, sent through `sendOnce`. In it: a `bodyMedium` paragraph of what to do; **the two actions before the rules** — outlined **Download Template** and contained **Choose File**, full width one under another narrow, content width in a wrapping row wide, Choose File turning outlined once Import is the page's filled button — with a `HelperText` line under them for what a picker has to say; then what the file holds: a `titleMedium` count in `error` over a `RowBox` of mistakes ("Row 3 · Item Group" over the sentence, `plain`), or a 1px `outlineVariant` box with "n items ready" and a muted line; then a form section heading "The columns" over a `RowBox` of what each takes. After the import the page is its log: a `titleMedium` count, a `RowBox` of code over name, then outlined **Import Another File** and contained **Go to Items** (`router.replace`, so Back is Stock). A mistake list and a log stop at 100 rows and say so. Rejected: the rules first — on a phone they push both buttons off the screen (device run, 2026-10-13) |
| Read-only check (Tax Rules' Which Template?, Sales Taxes and Charges Templates' Test Template) | a `forms/` small form, page narrow and Dialog wide, whose inputs are a local `useForm` that is never saved; the answer in a 1px `outlineVariant` box — `titleMedium` result, `bodySmall` why — and one outlined Close |
| Settings in conflict (Selling Settings' fallback with Stock Settings' auto insert) | a note callout in `error` at the top of each settings page involved, while both are on: the page's own switch read live, the other page's saved value |
| Weekly hours | seven rows, 1px `surfaceVariant` between: `Switch`, `titleMedium` day, time fields. Closed in `onSurfaceFaint` |
| Variant matrix row | one 1px `outlineVariant` box per combination: `labelLarge` label, SKU, barcode, price difference, quantity |
| Note callout | `src/components/note-callout.tsx`: 3px left border `accent` or `error`, `surfaceMuted`, `bodySmall` |
| Full-page form (Store, the Settings singles) | `PageForm` (`src/components/form-footer.tsx`): fields scroll at `FORM_MEASURE`, the column centred in a wider pane with its `PageHeader form` (rule 18), the footer — the write's notice, then Save, held to the same measure — pinned bottom, padded above the gesture bar. Its keyboard: `KeyboardAvoidingView` around both, since the edge-to-edge Android window does not resize — the last field and Save stay above it. Read-only (no write permission): a note callout, disabled fields, no footer, the fields' end clear of the navigation bar |
| The end of a page over the navigation bar | The Android build is edge-to-edge, so a 3-button bar lies over the window's foot. A scroll that ends at the screen's bottom ends with `BottomSpacer` (`src/components/bottom-spacer.tsx`, a `ListFooterComponent` for a list) or pads by `useBottomInset()` (`src/lib/columns.ts`; `underTabs` for a (tabs) screen: `NativeTabs` ends the page above the bar at every width, so it adds nothing — the tablet's Home pill sat 56dp high, 2026-10-28); a bar pinned to the bottom pads by it. The shell's rail and drawer scroll, so Features is never under the bar (2026-10-23) |
| Features page (hide screens and pages) | `src/screens/features/` on the shell destination `systems/[id]/features/` (its own `Stack`: `index`, `[name]`), the rail's last item (`tune`); `FeaturesProvider` (the layout) holds the unsaved choices for both routes. `PageHeader` (kicker the store, the intro as meta; a back arrow only on a phone's screen page). Wide: the list (two parts in five) beside the open screen (three), a 1px `outlineVariant` rule between; narrow: the list, a row pushing `features/[name]`. **List** (`screen-list.tsx`): "Store level" — a 1px `outlineVariant` box: `titleMedium` "Level n · Name", `bodySmall` muted summary, the owner's outlined **Change Level** (`forms/store-level`: `AdaptiveDialog asPage`, a `NoteCallout` and the level picker) and, while the choices differ from the level's menu, an `accent` text `Button` "Use Level n's menu" (an unsaved change); then "Always visible" — Home and Features, `lock` icon, `titleSmall` in `onSurfaceMuted` — then "Screens", a box of rows: a 40dp `surfaceVariant` icon tile, `titleMedium` name, `bodySmall` status (§2.4, " · Owner" on Employees), `bodySmall` "shown/total" pages, a 10dp `accent` `Badge` dot while that screen's choices are unsaved, `chevron-right` narrow; the open row on `surfaceMuted`. **Screen** (`screen-detail.tsx`): a head box — 48dp `surfaceMuted` tile with the icon in `accent`, `headlineSmall` name and a `labelMedium` status, `bodyMedium` summary, an outlined `info` `IconButton` (About), the screen's `Switch` in `accent` — and `NoteCallout`s ("a single page", "every page stands on its own", "hiding only removes it from the menu"); then a "Core · Always on with …" box (rows tagged "Always on" with a `lock`, in the type badge's shape) and a box per index section, each under a `surfaceSubtle` header strip (`labelMedium` `secondary` title, `accent` text `Button` Hide all / Show all with two or more pages): rows of `titleSmall` name, `bodySmall` muted hint, About, `Switch`, the whole row pressable. A screen that is off draws its pages in `onSurfaceFaint` and locks them. About: `about.tsx` — kicker "Screen" / "Page of …", the name, `labelMedium` `accent` Purpose and Use-case over `bodyMedium`; a Dialog wide, `sheets/about` narrow. The unsaved bar while a choice differs: `FormFooter` with "n unsaved changes", outlined Reset, contained Save — stacked full width narrow, in a row wide; Android's back on the list with changes asks (`useDiscard`), then goes Home; another rail item keeps them. Rules: `src/features/feature-preferences/visibility.ts` |
| Small form's buttons | `FormActions` (`src/components/adaptive-dialog.tsx`): Delete in `error`, an extra action, Cancel, Save; no Save means read-only and Cancel reads Close. Submit through `saveOnce` |
| The write's line, above the buttons (`AdaptiveDialog`'s `notice`, `PageForm`'s footer) | `mutationNotice(...)` (`src/lib/errors.ts`) |

### Detail and dialogs

| Pattern | Build |
| --- | --- |
| Detail header | thumbnail, `headlineMedium` name, type badge, status badge, `amount` price, Archive + Edit `Button`s |
| Detail card | `Card mode="outlined"`. Header strip: `View` on `primary`, `labelMedium` in `onPrimary`. Rows: `bodySmall` key, `bodyMedium` value |
| Confirm or picker | `src/components/adaptive-dialog.tsx`. Wide: `Portal` + `Dialog` with `maxWidth`. Narrow: route in `src/app/(app)/sheets/`, `presentation: 'formSheet'`, `sheetAllowedDetents: 'fitToContents'`, `sheetCornerRadius: radius.xl`. Opener decides. A list that closes from its header passes `onClose` (a `close` `IconButton` at the header's end) and no `actions` (no footer) — the Store Guide's role list only |
| Sheet body | OS owns frame + scrim → content carries theme: 2px `primary` top rule, kicker, title, actions padded above gesture bar |
| Destructive confirm | `AdaptiveDialog` with `kickerTone="error"`: Cancel, red confirm, the notice above them (`src/components/remove-system-dialog.tsx`, `delete-account-dialog.tsx`; the generic `confirm-dialog.tsx` that Setup deletes use). From a small form, `useConfirm()`: a Dialog over it wide, `sheets/confirm.tsx` narrow (request in `src/Store/confirm.ts`); `closesForm` closes both on success |
| Unsaved changes | A page form leaving with fields changed: `PageForm unsaved={formState.isDirty}` → `useLeaveGuard` (`src/components/use-leave-guard.ts`, restored from 07bd7aa's `unsaved-guard.ts`†): `usePreventRemove`, then `useDiscard`'s "Discard your changes?" (Keep editing, a red Discard) — a Dialog wide, the confirm sheet narrow. Off while the form's own write is pending, so a save that leaves is not asked about. A rail switch removes nothing and is not asked about (2026-10-30) |
| Create / edit form | full-page route (`src/app/(app)/create-system.tsx`). Wide, a small form is a Dialog (`src/app/(app)/forms/` with `AdaptiveDialog asPage`, §4.4); a created row returns through `src/Store/sheet-result.ts`† |
| Multi-step flow | full-screen pushed route, every width |
| Message (a choice saved, a screen gone with its last page) | Paper `Snackbar` (`src/components/snackbar.tsx`) at the bottom of the page's content, above any footer, 4 s; Paper draws it on `inverseSurface`. A short sentence, no action. Features only so far |
| Request in flight | `Dialog` `dismissable={false}`, full-page form back blocked. Sheet: `gestureEnabled` off, Android back swallowed. A paused (offline) write is not in flight — but its submit stays disabled (`.claude/instruction_mds/data-layer.md` §5) |
| Loading / error / retry | inline in the screen (`src/screens/home/index.tsx`, the shell in `src/app/(app)/systems/[id]/_layout.tsx`); the shared `src/components/query-state.tsx` |

### Home

| Pattern | Build |
| --- | --- |
| In-system Home | `src/screens/system-home/index.tsx`: blank for whoever has work here — the rail is the way in. An employee with no permissions gets `headlineSmall` "You're in. The owner hasn't given you a role yet." over a `bodyMedium` line at the reading measure. Nothing while the permissions load or are offline |
| Dashboard | `src/screens/dashboard/index.tsx`: `PageHeader` (kicker the system), the period pane switch, then blocks one under another, each shown only with its permission (sales: View Sales; open registers: View Shift Totals or Close Any Register; stock: View Stock Levels; gross profit: View Sales and View Stock Levels) and each with its own `QueryState`: the number cards, `SectionHeading` "Sales per Day" over the bar chart, `SectionHeading` "Top-Selling Items" over two two-option pane switches and ranked rows, `SectionHeading` "Stock Alerts" over alert rows. Wide, the period switch is in the page header; the number cards never take more columns than there are cards (four fill a tablet's row); the blocks sit in rows of `useColumns(BLOCK)` (420) — two side by side in a landscape tablet's pane, one per row upright |
| Number card | a 1px `outlineVariant` box, `radius.lg`: `labelMedium` label in `secondary`, the figure in `amount`, a `bodySmall` muted line. In a `useColumns(fontScaled(<card min>))` grid — two across a phone, one at a large font scale — rows padded with empty cells |
| Bar chart (sales per day) | `src/screens/dashboard/sales-chart.tsx`, drawn with `View`s — no chart library: a fixed-height plot (a size: it holds no text), one `flex: 1` bar a day in `primary`, its height the day's share of the best day's; a day without a sale a 2px `outlineVariant` foot. Day numbers in `bodySmall` under every bar up to seven, else under the first, middle and last; a `bodySmall` muted "Best day: …" line; each bar's day and amount as its `accessibilityLabel` |
| Ranked rows, alert rows | `src/components/row-box.tsx` (`RowBox`, `BoxRow`) — a 1px `outlineVariant` box of rows, `surfaceVariant` hairlines between: `titleMedium` name over a `bodySmall` muted line, then a `titleMedium` figure at the end (a best seller) or a `labelMedium` status in `error` under them (an alert: "Out of stock", "8 left · re-order at 9"). The line an empty list shows replaces the box. `plain` makes the second line body text, not a muted fact: a mistake's sentence |
| Stores list | `src/screens/home/`. Narrow: `titleMedium` "Active Stores" over row cards. Wide: `headlineMedium` "Your Stores", `bodyLarge` line, a grid from `useColumns(SYSTEM_CARD)` (3 across 1180dp). Store card (`system-card.tsx`): contained `Card`, a 16:9 `surfaceVariant` tile wide, the 72dp `Card.Title` row (pinned: Paper drops it to 50 with nothing beside the title), the owner's red `delete` `IconButton` at its end. First cell at every width `create-card.tsx`: the same tile and row, `surfaceMuted`, a 1px dashed `outlineVariant` outline laid over it, an `accent` `add` circle — the same size as a store card, and the empty state. App bar: logo, "Merchant", Enter Access Code (`enter-code`), Store Guide (`help`), bell; wide, the bell and Account only — Enter Code, Access Codes and Store Guide float in a bottom-centre pill (`HomeToolbar`: a `Surface` at elevation 2, 1px `outlineVariant`, `radius.xl`, each an `Icon` over `labelSmall`, ≥ 88×56dp) above the navigation bar, the grid's end padded clear of it (the human, 2026-10-23). Multi-select: a long press on an owned card starts it, taps toggle, a 2px `primary` ring laid over a picked card and a `Checkbox.Android` in place of the delete icon; the app bar becomes close · "n selected" · Select all · red delete; Android back leaves it. The confirm types the store's name for one, `DELETE` for several (`remove-system-dialog.tsx`) |
| Store Guide | `src/screens/guide/`: the page (`index.tsx`, matched to pocket-store-compass.lovable.app on 2026-10-22: its components, structure and widths, our words) — app-bar back, then a hero box on `primary` (`radius.lg`): `labelMedium` kicker in `accent`, `displaySmall` "Learn a role" and a `bodyLarge` paragraph (`READING_MEASURE`) in `onPrimary`, three pills on `primaryHighlight` ("Nothing is saved", "Works offline", "Leaving resets it"), and **Choose a Role** contained in `accent` (full width narrow, label width wide). Then two headings with their hint at the far end of the row — "The 20 permissions" over a card per area (1px `outlineVariant`, `radius.lg`: `labelMedium` `secondary` area, its count at the end, the permissions as `surfaceVariant` tags in a wrapping row) and "Good to know" over a card per limit (a 28dp `surfaceMuted` square with the number in `accent`, `titleMedium` topic, `bodyMedium` muted detail) — each grid `CellRows` over `useColumns`, at most three area cards and two limit cards a row; one a row on a phone. The role list (`role-list.tsx`) pops once on open (§4.4), closed by the **X** at its top right (`AdaptiveDialog onClose`, no footer): a muted line, an outlined dense **Search roles** box fixed above the scrolling cards (`scroll={false}`; name and line, `rolesMatching` in `roles.ts`), a `labelMedium` `secondary` heading per work area, a card per role — `titleMedium` name with the boxed `labelMedium` kind tag at its end (BUILT-IN, CUSTOM, OWNER, NO ROLE), `bodyMedium` muted line, an `accent` `ProgressBar` of the 20 permissions with "n of 20 permissions" — and, with no match, a dashed `outlineVariant` box "No role matches.". Rejected: the reference's centred 1000dp column (rule 18), its own words for the roles and limits, a tag colour per kind. The practice store (`guide/[role]`): an `Appbar` on `primary` — Menu, "Guide · role", Tasks (`checklist`), Leave (`close`) — over the shell's own rail or drawer rows (`src/components/shell-nav.tsx`) listing only the role's screens, mock pages drawn with these components, and while a task runs the step bar in the `FormFooter` slot: `labelMedium` `accent` "Task · Step n of N", `titleMedium` title, `bodyMedium` what to do, an `error` `bodySmall` line when the step is on another page, text **Start Again** / **Stop Task**. The task list, a task's intro and its Done are Paper `Dialog`s at both widths — teaching pop-ups over mock state, not confirms |
| Waiting for approval | `src/screens/home/pending-requests.tsx`: `titleMedium` heading over a `RowBox` — the system, then "Code ABC-123 · asked …". Above Your Stores narrow, under the title wide; nothing at all while none wait |
| Pane switch (Access Codes) | `SegmentedButtons` Codes · Requests · Members in a horizontal `ScrollView`, `minWidth` 96 + `fontScaled(192)`, held to 560dp wide; the pane is the route's param, so a notification opens Requests. No count in a label — "Requests (3)" is cut off on a phone; the count sits on the Pending chip |
| Pick-one chips | `src/components/filter-chips.tsx`: `PickChip` — picked: flat, `primary` fill, `onPrimary` text; the rest outlined; no check mark. `FilterChips` is a status filter's row of them sliding sideways (Codes, Requests); the new-code form wraps them for a system or an expiry. Rejected: Paper's own selected flat chip — a 12% tint the phone could not tell from the others (2026-10-14) |
| Code entry | `src/screens/access-codes/enter-access-code-form.tsx`: six `radius.md` boxes in a row (`headlineSmall`, the next box's border `primary` while focused) drawn over one Paper `TextInput` at opacity 0.01 that takes the typing and a paste; the boxes hidden from screen readers, the field labelled "Access code, six characters" |
| Created codes | a 1px `outlineVariant` box, `radius.lg`: each code in `amount` with a share `IconButton`, `surfaceVariant` hairlines; Share All when there are several. React Native's `Share` — the platform sheet |
| Notification row | `Pressable` row, `surfaceVariant` hairline under it: `Avatar.Icon` 40 by kind, `titleMedium` title, `bodyMedium` body, `bodySmall` muted time; unread: `surfaceMuted` ground and a 10dp `accent` `Badge` dot. "Mark all as read" an `accent` text `Button` above the list. Wide, the list is held to `FORM_MEASURE`, left-aligned |
| Bell with a count | `src/components/bell-action.tsx`: `Appbar.Action` + an 18dp `accent` `Badge` (`onAccent` text, "99+" past 99) on its upper corner — the systems list at both widths, and a system's header; both push the Notifications page |
| Sign-in | `src/screens/sign-in/index.tsx`, the one centred column (rule 18): `displaySmall` "Merchant", `headlineSmall` "Welcome" over a muted `bodyMedium` line, the two provider buttons, then a `bodySmall` line whose Terms of Service and Privacy Policy are `accent` links |
| Legal page | `src/screens/legal/`: app-bar back and the title, `bodySmall` muted "Last updated …", a `bodyLarge` intro, `headlineSmall` section headings over `bodyLarge` paragraphs, at `READING_MEASURE`. The route `legal/[doc]` sits outside both sign-in guards, so the sign-in page and Account open the same page |
| Account (Profile) | `src/screens/profile/`: identity, then `labelMedium` headings over `Card` lists — Account, Security & Privacy (Privacy Policy, Terms of Service open the legal page), Preferences (Dark Mode `Switch` in `accent`, the whole row pressable; Themes, a placeholder that does nothing) — then Sign Out and Delete account. No "Your Businesses" row (2026-10-23): the stores list is Home. A page narrow; wide, the same body in a `Dialog` (`forms/profile`) |
| Picker | `src/components/search-select.tsx`: a read-only outlined field; it opens a Search box over a `FlatList` of the options — the only scroller, rendered a window at a time — in a Dialog wide or the `sheets/pick` formSheet narrow (`AdaptiveDialog scroll={false}`; the sheet held at the window's height so a short filtered list keeps its buttons above the keyboard) |

## 6. Icons

`SymbolView` from `expo-symbols`: SF Symbols iOS, Material Symbols Android.

- App code passes map names (`edit`, `delete`, `close`, `add`) to Paper's `icon` / `source`. Never a
  set's own name
- New icon → add `{ ios, android }` pair to `ICONS`, verify, then use
- Paper renders through `PaperProvider` `settings.icon` → `renderIcon` → pair + `color` as
  `tintColor`
- Unmapped name → MaterialCommunityIcons fallback, on purpose: Paper's internal names (`menu-down`,
  `check`), brand marks (`google`, `facebook`)
- SF Symbol missing → substitute recorded in `ICONS`
- `NativeTabs` takes the same pair as `sf` + `md`

## 7. What broke

Symptom → cause → rule. Entry stays while the stack that caused it stays. Prune on Paper / SDK bump.

| Symptom | Cause | Rule |
| --- | --- | --- |
| Grid card image wrong height | `Card.Cover` hardcodes height | `expo-image` in `aspectRatio` `View`. `Card.Cover` only in single-column detail |
| Doubled padding in card | `Card.Content` pads itself | no own padding inside it |
| Dialog stretches across tablet | `Dialog` has no max width | always `maxWidth` + centred |
| A long formSheet runs off the screen and will not scroll (the Store Guide's role list on a phone, 2026-10-22) | a `fitToContents` sheet lays out at its content's full height, so its `ScrollView` has nothing to scroll | `SheetBody` holds the sheet to the window (`maxHeight: height - top`) and its `ScrollView` shrinks (`flexShrink: 1`) |
| Two role lists stacked after a quick double tap on **Choose a Role**, so one Back left the second up (phone, 2026-10-22) | each tap ran `router.push` to the sheet route before the first push had covered the page | the Guide page pushes its sheet once until it is in front again (`useFocusEffect` resets the guard); a Dialog opened by state needs nothing |
| Cart fields side by side in a 330dp pane though `Field` re-rendered with the full-row style (2026-10-19) | Fabric kept the laid-out 45% `flexBasis` when the style switched in place | `FieldGrid` keyed by its stack-or-pairs choice, so stacked fields are drawn stacked from their first frame |
| A whole-row `Field` kept its old width over a live resize — Edit Item's Description ran off the screen upright (Medium Tablet, 2026-10-28) | Fabric kept the laid-out `flexBasis: '100%'` | the full-row style is `width: '100%'`. Rejected: a measured `maxWidth` cap — it stayed narrow when the window grew back |
| The payment formSheet's buttons sat under the navigation bar and its body would not scroll (phone width, 3 buttons, 2026-10-28) | the sheet's unstyled `KeyboardAvoidingView` grew to its content past the frame's `maxHeight` | `RouteSheet`'s `KeyboardAvoidingView` shrinks with the frame (`sheetScroll` / `sheetFill`) |
| Card collapses with `flexGrow` | Paper `Surface` flex check ignored `flexGrow` | `patches/react-native-paper+5.15.3.patch`. Prefer `flex: 1` on card items |
| A `Chip`'s × drawn under the chip, outside it (2026-10-12) | Paper positions the close button `absolute` with `height: '100%'`; inside a wrapping row the percentage resolved against the row, not the chip | `icon="close"` + `onPress` on the Chip instead of `onClose` (`src/components/chip.tsx`). Rejected: `flexDirection: 'row'` on the Chip — it then fills the row and the × stays out |
| A new document dated yesterday, then refused as backdated (2026-10-12) | the form started on the device's day while the database posts by the system's time zone | `todayIn(time_zone)` (`src/lib/dates.ts`) for any date the database will compare with `private.merchant_today` |
| Every variant resized | `configureFonts` treats all-non-object config as flat | always key by variant |
| List row ignores type scale | `List.Item` reads raw `fontSize` | §3.3 |
| Icons blank boxes | Paper default icons need `react-native-vector-icons` fonts, none loaded | `renderIcon` through `PaperProvider` `settings` |
| Icon blank on Android, no warning | Material Symbols name missing from font | verify pair in `ICONS` first |
| Icon blank first frame, cold start, Android | symbol font loads async | accepted |
| Icon clipped at large font scale, Android | expo-symbols draws the glyph as a font-scaled `Text` in a fixed box | `renderIcon` asks for size ÷ font scale, box held at size |
| Press invisible on Android | `Pressable` reads no theme | `android_ripple` every time |
| Native view wrong colour | `PaperProvider` does not reach native views | pass colours as props |
| `theme.colors.accent` type error | Paper types colours to MD3 | `useAppTheme()` |
| `FlatList` throws on rotate / resize | `numColumns` changed, same `key` | `key={columns}` |
| No gutter between `FlashList` cells | 2.x positions cells absolutely, flex `gap` reaches nothing | gutter on cell |
| App crash, Android tab bar | native tabs cap at five | shell = `Drawer`, not `NativeTabs` |
| Tab badge read "0" (2026-10-14) | expo-router's `appendBadgeOptions` sets the badge from truthy children whatever `hidden` says | render `NativeTabs.Trigger.Badge` only when there is a count |
| A see-through field missing for screen readers (2026-10-14) | Android leaves a view at alpha 0 out of the accessibility tree (`View.isVisibleToUser`) | opacity 0.01, never 0, on a field drawn over by something else |
| Text drawn though its colour was `transparent`, Android (2026-10-14) | React Native on Android reads colour 0 as unset and uses the default | do not hide text with a transparent colour; hide the view (above) |
| Picked chip looked like the others (2026-10-14) | Paper's selected flat chip is a 12% tint | `PickChip` (`src/components/filter-chips.tsx`) |
| `Menu` lands offset in sheet | `Menu` positions from window coords, sheet is partial height | flows holding a `Menu` = full-screen route |
| Sheet with nested stack fails, Android | Android `formSheet` cannot host a nested stack | sheets = leaf routes of `(app)` Stack |
| Keyboard covers sheet's save buttons | sheet + keyboard | create / edit forms = full page |
| Required `*` ignored by testers | read as decoration | ` (required)` in label |
| Filters wrapped to three lines on phone | filters spread across toolbar + chip rows | Filters panel |
| Group headers lost while scrolling | collapsible headers in long list | folders as route pushes |
| Glyphs clipped on Android | line height ≤ font size distributes unevenly (RN #29507) | line height ≥ 1.2 × size |
| Extra line wrap on Android | `lineHeight` + `letterSpacing` + `maxFontSizeMultiplier` together (RN #46436) | watch `labelMedium`; report, do not hack per call site |
| Bold renders regular on Android | system font: numeric weights unreliable, no 800 | max 700 |
| Font-scale user gets double inflation | width-scaled font + OS scale stack | rule 10 |
| Title squeezed to a few letters per line beside its buttons, narrow | `flexWrap` row: Yoga shrinks the flexible child instead of wrapping | pick the anatomy from `useShellWide()`, not `flexWrap` (page header, list toolbar) |
| Table column titles centred over left-aligned cells | `DataTable.Title` is a row; a cell style's `justifyContent: 'center'` centres it horizontally | `header-title.tsx` forces `flex-start` |
| Rail labels missing, icons only | `flex: 1` label row in a column item has zero basis → zero height | `flexGrow`, not `flex: 1`, under the rail icon |
| Tile name broken mid-word at large font scale | fixed tile min width, growing name | `fontScaled(<tile min>)` |
| Rail labels truncated at large font scale ("Resour…") | fixed rail width, growing label | `fontScaled(RAIL_EXPANDED)` |
| Grid card mostly empty grey on tablet | square placeholder at 1/4 of 1180dp | 16:9 placeholder |
| `Card.Title` blank at content width | its title is `flex: 1`: zero basis in a hugging card | content-width action → `Button`, not `Card` |
| Tablet ignores `orientation: portrait` | Android 16, `targetSdk` 36: `screenOrientation` ignored at smallest width ≥ 600dp | accepted. Phones stay portrait, tablets rotate; layout follows the window (§4.1) |
| Small form squeezed into the left half of a tablet | full-page route, its 560dp column left-aligned | small forms = Dialog over the screen wide (§4.4) |
| Lone half field stretched across its row | `flexGrow` on a half `Field` with no partner beside it | `FieldGrid` caps a half at one column (measured, `HalfWidthContext`) |
| Crash when the window widens past `WIDE_MIN` | a hook called after `wide &&`, so the hook order changed | call every hook unconditionally (`useTableFits`) |
| "Invalid prop `compact` supplied to `React.Fragment`" | `Dialog.Actions` clones `compact` onto each child, and the child was the caller's Fragment | `AdaptiveDialog` lays out its own actions row |
| A destination's page blank, with no error (the Dashboard, 2026-10-13) | the shell called `navigation.navigate(name)` with no params, and a drawer screen reads only the params it is given: no `id`, no system, nothing drawn | the shell passes `{ id }` to every destination, stack or not |
| A button that opens the phone's file picker does nothing at all (Import Items, Android, 2026-10-13) | the system had rebuilt the app's window while the app was open — the text size changed in Settings — and expo-file-system 57.0.7's picker launcher is not registered again (`IllegalStateException: Attempting to launch an unregistered ActivityResultLauncher`): `expo`'s Activity wrapper posts `onDestroy`, the new Activity resumes first, React Native drops the late destroy, and expo-modules-core re-registers only after a destroy. `File.pickFileAsync(options)` then answers `canceled`, as it does for every rejection | `patches/expo-modules-core+57.0.20.patch` registers the launchers again whenever the app resumes with another Activity (CLAUDE.md §2) — native, so it arrives with a rebuild. `src/lib/files.ts` still uses the form of the call that rejects and throws `PickerUnavailableError`, and the screen still says to close the app and open it again, for a build without the patch. A picker button must never fail silently |
| The scan put a barcode no product has into an item's Barcode (emulator, 2026-10-15) | one camera frame of a slanted EAN-13 came back from ML Kit as a different, valid UPC-A, and every report counted | a code counts only after three frames running agree (`src/lib/barcode.ts`) |
| "No print found" covered at once by the barcode line again (Item form, 2026-10-15) | taking the label's picture pauses the scanner past the 2 s out-of-view rule, so the same code was counted again | on the Item form the code just taken never counts again; only the Register counts a repeat |
| A segment's label cut to "Last 7 …" at the largest font size (2026-10-13) | Paper's `SegmentedButtons` draws its label on one line, uncapped, in `flex: 1` segments that do not measure it | the wrapper caps the label at 1.5; three segments sit in a sideways `ScrollView` at `padding + fontScaled(labels)` (§5, Pane switch) |

## 8. Skill overrides

| Skill says | This file |
| --- | --- |
| `expo-native-ui`, `expo-overview`: check `@expo/ui` first | Paper (rule 1) |
| `expo-native-ui`, `expo-design-system`: `Color` from `expo-router`, `Platform.select` palette | theme keys (§2) |
| `expo-native-ui`, `vercel-react-native-skills` `ui-styling`: `boxShadow` strings | flat, ruled, outlined. Paper owns elevation |
| `expo-native-ui`: navigation stack title | `PageHeader` (§5) |
| `expo-native-ui`: inline styles | `StyleSheet.create` (rule 21) |
| `expo-native-ui`: `useWindowDimensions` for sizing | breakpoint only (§4.1). Columns: `onLayout` |
| `expo-native-ui`: `contentInsetAdjustmentBehavior="automatic"` | only under native header. Navigators here set `headerShown: false`, `Appbar.Header` applies top inset. Sheets pad with `useSafeAreaInsets` |
| `expo-design-system`: local `ThemedText`, Apple text ramp | Paper `Text` + variant (§3) |
| `vercel-react-native-skills` `ui-styling`: hierarchy by weight + colour | variants |
| `vercel-react-native-skills` `ui-menus`: zeego native menus | Paper `Menu` — native menu cannot draw accent "+ New …" row, needs rebuild |
| `ponytail-review` `yagni`: a `src/components/` file or `src/lib/` helper with one caller | a † file is restored at its own path when the first screen needs it (the teardown note at the top) — not inlined, and not moved into the screen until a second one arrives |

## 9. Not used

No custom primitives. No `src/styles/`. No loaded typeface. No in-app text-size control. No width-based
type. No `isTablet`, device classes, second threshold, tablet-only screens. No centred content column
(rule 18's exceptions apart).
No fixed card heights. No `react-responsive`. No per-screen colour picking. No hand-shaped avatars —
`Avatar.Text label=""`.

## 10. Unverified

Code matches the doc; these need a human on a device. Delete a line once checked.

- Weight 500 (`labelSmall`) renders on Android system font. 600 checked 2026-10-03, emulator. Not → 700
- Tablet split-screen proper. Checked 2026-10-03 only by resizing the emulator window (`wm size`) below `WIDE_MIN`: rail → drawer flips live
- iOS icon names: machine is Windows, checked against `sf-symbols-typescript` types only
- iOS ramp column §3.1: mapping is a guess
- Status badge in detail header: `onSurface` text on `primary` ground = same colour in light theme
- Android back after typing in a sheet's text box (the Store Guide's **Search roles**, Home's **Enter Access Code**) and
  closing it, on a page with no text box: dead on the emulator's Gboard (`sendKeyEvent on inactive InputConnection`,
  2026-10-22); `Keyboard.dismiss()` before closing, even waiting for `keyboardDidHide`, did not help. A physical phone
  decides whether it is the emulator's keyboard or the app's
