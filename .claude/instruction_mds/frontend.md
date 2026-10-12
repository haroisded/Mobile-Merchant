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
   native `formSheet` (narrow confirms and pickers).
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
    (`Dialog`) are centred, plus two recorded exceptions: the sign-in column (nothing beside it to
    align with) and the Create System card's contents (one target, not reading). Running prose →
    `maxWidth`, no `alignSelf`.
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
| `WIDE_MIN`, rail / drawer / pane widths, the sample receipt's widths, `useColumns`, `ShellWideContext`, `useShellWide()` | `src/lib/columns.ts` |
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

Paper types `theme.colors` to MD3 only → read added keys through `useAppTheme()`.

### 2.3 Accent — only here

- The + circle on the systems list's Create System card
- Active rail / drawer item: 4px bar. Active form section row: 3px bar
- Kickers
- Inline text actions: "Auto-generate", "Scan", "+ Add …", "+ New …", "Clear all"
- Toggle on. Stepper progress bar
- Note callout left rule. Count badge on a tab or pane switch
- Pack: Open status, remaining bar, **Next pick** badge (`accent` fill, `onAccent` text)

Everything else: ink on white.

### 2.4 Status

| Status | Colour |
| --- | --- |
| Active, Sealed | `onSurface` |
| Draft | `onSurfaceMuted` |
| Inactive, Empty | `onSurfaceFaint` |
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

- `wide = useWindowDimensions().width >= WIDE_MIN`
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
| Profile | the Account tab | the Account tab, reached from the systems list's account icon (the tab bar is hidden) |
| Multi-step flow ending in a review | stepper, Review as the last step | stepper left, Review sidebar right |
| Systems list | Create button + row cards | grid, Create System card first |

Same at both widths: long forms and create-system (full page), a record with child rows or a sample under
its fields (a page of the Setup stack), multi-step flows (full-screen route).

Rejected for the small forms on a tablet (2026-10-04, the human's call): a full page — a 560dp
column on a 1180dp window, and centring it is §9's banned centred column; inline Dialog mounts in each
opener, the shape before a2b3259 — seven openers and two return paths; a side sheet. The Dialog route
kept one opener push and `src/Store/sheet-result.ts`†. Its keyboard: `KeyboardAvoidingView` around
the route plus the Dialog's `maxHeight`, since the edge-to-edge Android window does not resize.

All pairs flip together → one decision (§4.1).

### 4.5 Spacing

`spacing.xs … xxl` from `src/themes.js`, 4-point scale.

- Screen edge padding: one step, same on every screen. Narrow vs wide may differ one step
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
| Pane switch (`SegmentedButtons`) | narrow: full width, own row under the page header. Wide: in the page header's actions beside the add button, `width: fontScaled(PANE_SWITCH)`† — segments are `flex: 1` and do not measure labels, so content width collapses them to 76dp |

### Shell

| Pattern | Build |
| --- | --- |
| Header | `Appbar.Header` on `primary`: menu `Appbar.Action`, `Appbar.Content`, bell + Your systems (`grid`) actions. Your systems is the way out of a system: on iOS the left-edge swipe opens the drawer, so there is no back gesture |
| Rail / drawer | expo-router `Drawer`, `drawerType` `'permanent'` wide, `'front'` narrow. `drawerStyle` zeroes the hairline border, front-drawer corners `radius.xl`. Rail square + flush |
| Rail / drawer item | `Pressable`: `Icon` + `labelLarge`. Active: `primaryHighlight` ground, 4px `accent` bar left |
| Group row | opens / closes its screens, not a destination (none now: Home, Stock and Setup are the destinations) |
| Destination with a stack | Stock and Setup (`systems/[id]/stock/`, `systems/[id]/setup/`, each its own `Stack`): a tap on one always lands on its index, as a rail item should |
| Collapse to icons | menu action toggles `RAIL_EXPANDED` / `RAIL_COLLAPSED` |
| `(tabs)` bar | `NativeTabs`. Colours passed as props from `useAppTheme()` — `PaperProvider` does not reach native views. Icons: `{ sf, md }` halves of the map |
| System badge | `Avatar.Text` on `onPrimary` |

### Lists

| Pattern | Build |
| --- | --- |
| Wide list | `DataTable`: `src/components/header-title.tsx` per column (label string, `textStyle` = `labelMedium`, start-aligned), `Checkbox.Android` bulk column, `IconButton` row actions |
| Narrow list | `FlashList` rows: thumbnail, `titleMedium` name, badge, `bodySmall` meta, amount right-aligned |
| Index of records (Setup, Stock, Accounts) | `src/components/record-index.tsx` (`RecordIndex`), given its sections by `src/screens/setup/index.tsx`, `src/screens/stock/index.tsx` and `src/screens/accounts/index.tsx`: a section heading over a 1px `outlineVariant` box of rows — `titleMedium` + `bodySmall` hint + chevron, `surfaceVariant` hairlines. Sections in columns from `useColumns`. A row shows only with Read on its doctype; a section left empty goes |
| A Setup master's list | `src/components/record-list.tsx`: `DataTable` wide when `useTableFits`, rows narrow; `StatusText` for the status words; a pinned `header` row (the owner in Users). Items and Item Prices under Stock are the same list with the Search field above it, filtering what is loaded |
| Bulk action bar | `surfaceVariant` strip: clear `IconButton`, count in `labelLarge`, text `Button`s, Delete in `error` |
| Search | outlined dense `TextInput` + `TextInput.Icon` |
| Filter + sort | wide: one toolbar row — Search, outlined `Button` "Filters · n", Sort `Button` anchoring `Menu`. Narrow: Search on its own row, the two buttons under it. Active filters: `Chip`s with `x`, then `accent` text `Button` "Clear all" |
| Filters panel | `src/components/list-filters-dialog.tsx`†. Selects, `SegmentedButtons` (2–4 options), toggles. Applies as changed: Done, no Apply |
| A ledger report (General Ledger, Stock Ledger, Stock Balance) | `src/components/ledger-filters.tsx`: `PageHeader`, then `LedgerFilterBar` — outlined `Button` "Filters · n", a `Chip` per filter in force with `icon="close"` (tapping the chip removes it; not `onClose`, §7), `accent` text `Button` "Clear all" — over a `RecordList`. The panel is the route `forms/ledger-filters` (`LedgerFiltersPanel`, `AdaptiveDialog asPage`: a page narrow, a Dialog over the report wide), its state in `src/Store/ledger-filters.ts`; a pick applies at once, a typed number on blur or Done. Rejected: a formSheet — it cannot host the picker a select opens. A row opens its document through `useVoucherRoutes` |
| Document page (Stock Entry, Stock Reconciliation) | `src/components/document-page.tsx` (`DocumentPage`): `PageHeader` with the number as title and the status as its meta line — Draft, Submitted, Cancelled — and in its actions what the status and the roles allow: contained Submit and red outlined Delete on a draft, red outlined Cancel on a submitted one, then outlined Stock Ledger and General Ledger once posted. Submit and Cancel confirm through `useConfirm` (Submit with `tone: 'accent'`; Cancel's way out reads "Keep it"). Under it `PageForm`, editable while a draft; a figure Submit wrote onto a row is `PostedAmount`. Save keeps the page open: a new document becomes the saved one in place. A new document's Posting Date is `todayIn` the system's time zone, never the device's day |
| Folder row + breadcrumb | `src/components/folder-nav.tsx` (`TreeBrowser`, `useFolder`): the tree masters, Chart of Accounts, Cost Centers, Warehouses (a warehouse's row names the stock account it resolves to, and where from) and Item Groups (a group's row counts its defaults and item taxes; it has no Disabled, so `disabled` is optional). Each folder = push of the list route with `parent`, Back climbs one; a group is a `folder` row, a ledger a plain row |
| Status badges (Low, Expiring, Expired …) | `labelMedium` in `error` (`src/components/product-badges.tsx`†) |
| Type badge | `View`, 1px `outlineVariant` border, `surfaceMuted`, `labelMedium` |
| Thumbnail placeholder | `View` on `surfaceVariant` + `Icon`. Real image: `expo-image` |

### Forms

| Pattern | Build |
| --- | --- |
| Section list (wide) / stepper (narrow) | `src/components/section-stepper.tsx`†, `step-header.tsx`†. Optional step: "· Optional" + text `Button` "Skip tier" |
| Field label | `labelMedium` above control. Required: label ends ` (required)`. Optional: no marker. Hint `bodySmall` right |
| Text field | outlined dense `TextInput`, no floating `label`. `left` / `right` affixes for currency + units |
| Multi-line text field (a letter head, a footer note, the naming series one per line) | `ControlledText` with `multiline`: the same outlined field, growing with its lines. A list typed one per line reports a mistake by its line ("Line 2 repeats …") |
| Select | `src/components/menu-select.tsx`†: non-editable outlined `TextInput` anchoring `Menu` |
| Searchable select (a list too long for a `Menu`: countries, currencies) | `src/components/search-select.tsx`: the Select shape + `chevron-down`, opening a picker with a Search box. Narrow: `src/app/(app)/sheets/pick.tsx` — options and callback handed over in `src/Store/picker.ts`, since a route takes neither as a param. Wide: `AdaptiveDialog` |
| Field grid | `src/components/form-fields.tsx`: `FieldGrid` + `Field`, and `ControlledText` / `ControlledSwitch` / `ControlledDate` / `ControlledChecklist` bound to a react-hook-form `control`; each takes `disabled` for a read-only form and shows its field's error under it (a switch too: "A disabled template cannot be the default"). `ControlledText` takes `keyboardType` (`decimal-pad` for a rate or amount). `ControlledSelect` (`search-select.tsx`) binds a searchable select |
| Checklist (roles) | `ControlledChecklist`: one `Checkbox.Android` row per option, the whole row pressable |
| Inline-create select | Select + last `Menu.Item` "+ New …" in `accent`. Created row comes back selected |
| Date / time field | Select shape + `calendar` / `clock` icon → `DateTimePicker` (`@expo/ui/community/datetime-picker`; `ControlledDate`). Android: its own Material dialog. iOS: inline picker in dialog, Done. Held as `YYYY-MM-DD` (`src/lib/dates.ts`). An optional date (Accounts Frozen Till) takes `clearable`: a `close` `IconButton` beside it while it holds one |
| Default-account select (Company, Mode of Payment) | `ControlledSelect` over `ledgerOptions` (`src/features/accounts/queries.ts`): None first, then the enabled ledgers the field takes; the saved one stays listed. Cost centers: `costCenterOptions` |
| Form section heading (the Company's Accounts and Stock, an Item Group's Defaults) | `src/components/section-heading.tsx`: `headlineSmall` + `bodySmall` hint between two `FieldGrid`s in one `PageForm` |
| Segmented field, type selector | `SegmentedButtons`. Wrap two per row narrow |
| Toggle | Paper `Switch`, on colour `accent`, sentence in `bodyMedium` beside |
| Tags, date list | `Chip`s with `x` in wrapping row, then text `Button` "+ add …". Remove label on `closeIconAccessibilityLabel` |
| Repeatable rows | `src/components/repeatable-rows.tsx` over react-hook-form `useFieldArray`: a 1px `outlineVariant` box per row, `labelMedium` "Row n" + remove `IconButton` (`close`), the row's own `FieldGrid`; then `AddRowButton`, the `accent` text `Button` "+ Add …"; `RepeatableList` is the whole table — the line an empty one shows, the rows, the add button. A row shows only the fields its type uses (a tax row's Tax Amount for Actual, Reference Row # for the previous-row types) |
| Fields two records share | `src/components/sales-defaults-fields.tsx` (the five sales defaults of an Item and an Item Group, with `useSalesDefaultsRecords`) and `src/components/item-tax-fields.tsx` (an Item Tax row's three fields, with `useItemTaxRecords`): the fields and the lists they pick from, the form's own names passed in. Rejected: the same block written twice — fallow reports it as duplication |
| Record form with child rows (Sales Taxes and Charges Template, Item Group, Item, POS Profile) | a page of its destination's stack at every width, not a `forms/` Dialog: `PageHeader` with the red Delete in its actions — `src/components/record-page-header.tsx` (`RecordPageHeader`) is that header with its confirm and its pop, for a new such page — then `PageForm` — fields, a form section heading, the repeatable rows, a preview. Save stays live on a record not yet saved, so it names what is missing. Its confirmed delete pops the page through its own `useNavigation()` and, on a phone, the confirm's sheet of the outer stack with `router.back()`. Rejected: `router.dismissTo` the list — from the sheet, React Navigation 7's nested navigate pushed a second list over the deleted page (device run, 2026-10-09) |
| Calculation preview (the tax template's) | a form section heading, sample inputs held in local state (not the form's), then `src/components/sample-box.tsx` (`SampleBox`, `SampleLine`), the Currency page's sample box: `bodyMedium` label left, `amount` value right, a `bodySmall` running total under a row. "Fix the rows above …" while the rows do not parse. Stock Settings' FIFO / Moving Average example is the same box, static, the chosen method first |
| Sample receipt (Print Format) | `src/screens/print-formats/receipt-sample.tsx`, under a form section heading on the format's Setup-stack page: a 1px `outlineVariant` box drawn from the unsaved values, left-aligned — `bodyMedium` lines, `titleMedium` heading, 1px rules, `SampleLine` totals, `bodySmall` words; `maxWidth` from the paper (`RECEIPT_58MM` / `RECEIPT_80MM` through `fontScaled`, A4 the form's measure). A `bodySmall` muted line under the box says why something is missing (no default letter head, no readable tax rows) |
| Read-only check (Tax Rules' Which Template?) | a `forms/` small form, page narrow and Dialog wide, whose inputs are a local `useForm` that is never saved; the answer in a 1px `outlineVariant` box — `titleMedium` result, `bodySmall` why — and one outlined Close |
| Settings in conflict (Selling Settings' fallback with Stock Settings' auto insert) | a note callout in `error` at the top of each settings page involved, while both are on: the page's own switch read live, the other page's saved value |
| Weekly hours | seven rows, 1px `surfaceVariant` between: `Switch`, `titleMedium` day, time fields. Closed in `onSurfaceFaint` |
| Variant matrix row | one 1px `outlineVariant` box per combination: `labelLarge` label, SKU, barcode, price difference, quantity |
| Note callout | `src/components/note-callout.tsx`: 3px left border `accent` or `error`, `surfaceMuted`, `bodySmall` |
| Full-page form (Company, the Settings singles, Role Permissions) | `PageForm` (`src/components/form-footer.tsx`): fields scroll at the single-column measure, the footer — the write's notice, then Save — pinned bottom, padded above the gesture bar. Its keyboard: `KeyboardAvoidingView` around both, since the edge-to-edge Android window does not resize — the last field and Save stay above it. Read-only (no write permission): a note callout, disabled fields, no footer |
| Small form's buttons | `FormActions` (`src/components/adaptive-dialog.tsx`): Delete in `error`, an extra action, Cancel, Save; no Save means read-only and Cancel reads Close. Submit through `saveOnce` |
| Line under buttons | `mutationNotice(...)` (`src/lib/errors.ts`) |

### Detail and dialogs

| Pattern | Build |
| --- | --- |
| Detail header | thumbnail, `headlineMedium` name, type badge, status badge, `amount` price, Archive + Edit `Button`s |
| Detail card | `Card mode="outlined"`. Header strip: `View` on `primary`, `labelMedium` in `onPrimary`. Rows: `bodySmall` key, `bodyMedium` value |
| Confirm or picker | `src/components/adaptive-dialog.tsx`. Wide: `Portal` + `Dialog` with `maxWidth`. Narrow: route in `src/app/(app)/sheets/`, `presentation: 'formSheet'`, `sheetAllowedDetents: 'fitToContents'`, `sheetCornerRadius: radius.xl`. Opener decides |
| Sheet body | OS owns frame + scrim → content carries theme: 2px `primary` top rule, kicker, title, actions padded above gesture bar |
| Destructive confirm | `AdaptiveDialog` with `kickerTone="error"`: Cancel, red confirm, notice under body (`src/components/remove-system-dialog.tsx`, `delete-account-dialog.tsx`; the generic `confirm-dialog.tsx` that Setup deletes use). From a small form, `useConfirm()`: a Dialog over it wide, `sheets/confirm.tsx` narrow (request in `src/Store/confirm.ts`); `closesForm` closes both on success |
| Unsaved changes | `src/components/discard-dialog.tsx`† + `src/lib/unsaved-guard.ts`†. Stays a Paper bottom sheet narrow |
| Create / edit form | full-page route (`src/app/(app)/create-system.tsx`). Wide, a small form is a Dialog (`src/app/(app)/forms/` with `AdaptiveDialog asPage`, §4.4); a created row returns through `src/Store/sheet-result.ts`† |
| Multi-step flow | full-screen pushed route, every width |
| Request in flight | `Dialog` `dismissable={false}`, full-page form back blocked. Sheet: `gestureEnabled` off, Android back swallowed. A paused (offline) write is not in flight — but its submit stays disabled (`.claude/instruction_mds/data-layer.md` §5) |
| Loading / error / retry | inline in the screen (`src/screens/home/index.tsx`, the shell in `src/app/(app)/systems/[id]/_layout.tsx`); the shared `src/components/query-state.tsx` |

### Home

| Pattern | Build |
| --- | --- |
| In-system Home | empty for now: the shell's header and drawer around a blank body |
| Systems list, wide | `headlineMedium` "Your POS Systems", `bodyLarge` line. Grid from `useColumns(SYSTEM_CARD)` (3 across 1180dp). First cell `src/screens/home/create-system-card.tsx`: `Pressable`, 1px dashed `outlineVariant`, `surfaceMuted`, `radius.lg`, centred `accent` + circle, `titleMedium` name, `bodySmall` line; always there, so it is also the empty state. Narrow keeps the Create button |

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
(sign-in excepted, rule 18).
No fixed card heights. No `react-responsive`. No per-screen colour picking. No hand-shaped avatars —
`Avatar.Text label=""`.

## 10. Unverified

Code matches the doc; these need a human on a device. Delete a line once checked.

- Weight 500 (`labelSmall`) renders on Android system font. 600 checked 2026-10-03, emulator. Not → 700
- Tablet split-screen proper. Checked 2026-10-03 only by resizing the emulator window (`wm size`) below `WIDE_MIN`: rail → drawer flips live
- iOS icon names: machine is Windows, checked against `sf-symbols-typescript` types only
- iOS ramp column §3.1: mapping is a guess
- Status badge in detail header: `onSurface` text on `primary` ground = same colour in light theme
