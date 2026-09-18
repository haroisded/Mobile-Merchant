# Visual language — the Merchant screens

How the mockups become theme keys and Paper components. Text sizes are
[`typography.md`](./typography.md); width behaviour is [`layout.md`](./layout.md).

## Rules

1. The mockups are the picture; this file is the rule. Where they disagree, this file wins. Where
   this file is silent, follow the mockup and add the missing row here in the same pass.
2. Build only what is inside a device frame. The canvas around the frames is presentation.
3. Every colour is a theme key from §2. A mockup colour with no row is a missing key — add it to both
   themes and to §2, never inline it. Lint fails on colour literals under `src/` outside
   `src/themes.js`.
4. Corners are rounded and the theme decides by how much. A hand-drawn surface takes `radius.sm` /
   `md` / `lg` / `xl` from `src/themes.js` with `borderCurve: 'continuous'`. Never write a radius
   number at a call site. Avatars stay circular.
5. The accent goes only where §3 lists it. Destructive actions use `error`, never `accent`.
6. Every primitive is a Paper component, imported through `src/components/`. §4 names the exceptions
   where a native piece replaces a Paper one: `Pressable`, `NativeTabs`, `formSheet`.
7. Icons render through `expo-symbols` with an `{ ios, android }` name (§5).
8. Nothing is centred — headings, copy and full-width button labels all start at the left edge.
9. Styles are `StyleSheet.create` objects at the bottom of the file. Inline objects only for a value
   computed at render time — a measured width, a theme colour from `useAppTheme()`.
10. Where a React Native or Expo skill contradicts this file, this file wins. §6 lists the cases.

---

## 1. Mockups

Source: `.claude/context/UI Reference/`. Read-only — never write into it.

Each mockup draws a tablet frame (1024 × 768) and a mobile frame (390 × 844). Two anatomies, not two
sizes ([`layout.md` §5](./layout.md)).

Settled conflicts between mockups:

- **Rail destinations: eight** — Home, Register, Dashboard, Products, Discounts, Employees, Features,
  Audit.
- **Home's ink is the theme slate**, not `#201e1d`.
- **Mobile header title** follows each mockup as drawn ("Merchant" everywhere except mobile Register,
  which reads "Register").

## 2. Colour tokens

Both tables live in `src/themes.js` as `lightColors` and `darkColors`.

### Already in the theme

| Key | Value | Used for |
| --- | --- | --- |
| `primary` | `#1E293B` | header and rail ground, primary buttons, selected segment, detail-card header strip |
| `onSurface` | `#1E293B` | body text, names, amounts, 2px structural rules |
| `onPrimary` | `#FFFFFF` | text and icons on `primary` |
| `surface` / `background` | `#FFFFFF` | screen and pane ground |
| `secondary` | `#475569` | secondary labels, unselected segment text, column headers |
| `outlineVariant` | `#CBD5E1` | field borders, 1px rules between blocks |
| `surfaceVariant` | `#E2E8F0` | thumbnail placeholders, tag fills, hairlines between rows |
| `error` | `#BA1A1A` | Void, Delete, destructive kickers, Paused status |
| `errorContainer` / `onErrorContainer` | `#FFDAD6` / `#7A1512` | the "hard delete is blocked" callout |
| `backdrop` | `rgba(17,23,33,.55)` | dialog and sheet scrim |

### Added keys

| Key | Light | Dark | Used for |
| --- | --- | --- | --- |
| `accent` | `#EC3013` | `#EC3013` | §3 only |
| `onAccent` | `#FFFFFF` | `#FFFFFF` | text on an accent fill |
| `onSurfaceMuted` | `#64748B` | `#A3AEBE` | hints, SKUs, sub-lines, Draft and Scheduled status |
| `onSurfaceFaint` | `#94A3B8` | `#7C8898` | placeholders, "Opt" markers, Inactive and Expired status |
| `surfaceMuted` | `#F1F5F9` | `#1E2632` | selected row, active form section, type badge fill |
| `surfaceSubtle` | `#F8FAFC` | `#1A212C` | toolbars, receipt pane, date fields on cart lines |
| `primaryHighlight` | `rgba(255,255,255,0.14)` | `rgba(0,0,0,0.12)` | active rail and drawer item |

Paper types `theme.colors` to MD3 keys only. Read the added keys through `useAppTheme()`
(`src/lib/theme.ts`), which returns `useTheme<AppTheme>()` — a generic, not an assertion.

## 3. The accent

Only here:

- Register's tile on Home — the one filled tile.
- The active rail or drawer item's 4px bar.
- Kickers — the small uppercase line above a screen or dialog title.
- The required-field `*` and inline field actions ("Auto-generate", "Scan", "+ Add rate").
- A toggle that is on, and the stepper's progress bar.
- Discount state on a cart — applied discount lines, "Eligible" and "Apply" tags, the eligible strip.
- The left rule of a note callout, and the Cart count badge on the selected mobile tab.

Everything else is ink on white.

### Status colours

| Status | Colour |
| --- | --- |
| Active | `onSurface` |
| Draft, Scheduled | `onSurfaceMuted` |
| Inactive, Expired | `onSurfaceFaint` |
| Paused | `error` |

## 4. Patterns, built with Paper

`roundness` is **2** (buttons 10, cards 6, dialogs 14). Paper multiplies it into each component's
corners, so one theme value re-rounds the app.

**Press targets are `Pressable`**, not `TouchableRipple`. Pass `android_ripple={{ color:
colors.ripple }}` every time (`primaryHighlight` on a `primary` surface), or the press is invisible
on Android.

### Structure

| Pattern | Build |
| --- | --- |
| 2px rule under a page header, above a totals block, between Home's sections | `View`, `height: 2`, `backgroundColor: onSurface` |
| 1px rule between blocks | `outlineVariant`; between list rows, `surfaceVariant` |
| Page header | `labelMedium` kicker in `accent`, `headlineMedium` title, `bodySmall` count, contained `Button`, 2px rule below — `src/components/page-header.tsx` |
| Section heading inside a screen | `headlineSmall` plus a `bodySmall` hint on the same baseline |

### Shell

| Pattern | Build |
| --- | --- |
| Header | `Appbar.Header` on `primary`: menu `Appbar.Action`, `Appbar.Content` title, bell and account actions |
| Rail (wide) and drawer (narrow) | expo-router `Drawer` in the shell layout, `drawerType` `'permanent'` or `'front'`; `drawerContent` built from the rows below; `drawerStyle` zeroes react-navigation's hairline border and replaces its 16-radius front-drawer corners with `radius.xl`. The permanent rail stays square and flush. **Not `NativeTabs`** — eight destinations, and Android's native tab bar throws past five |
| Rail and drawer item | `Pressable` holding `Icon` and a `labelLarge` label; active item on `primaryHighlight` with a 4px `accent` bar at the left edge |
| `(tabs)` bottom bar | `NativeTabs` from `expo-router/unstable-native-tabs`. Colours are props read from `useAppTheme()` — `backgroundColor` (`elevation.level2`), `indicatorColor` (`secondaryContainer`), `iconColor`, `labelStyle`, `rippleColor` — because `PaperProvider` does not reach native views. Icons are the `{ sf, md }` halves of the name map. `hidden` while the container is wide, measured by a wrapper `View`. Four items |
| System badge | `Avatar.Text` on `onPrimary` |
| Collapse to icons | the menu action toggles `RAIL_EXPANDED` / `RAIL_COLLAPSED` |

### Lists

| Pattern | Build |
| --- | --- |
| Wide list | `DataTable`: a `labelMedium` `Text` as each `DataTable.Title`'s child, a `Checkbox.Android` bulk-select column, `IconButton` row actions |
| Narrow list | `FlashList` rows: thumbnail, `titleMedium` name, badge, `bodySmall` meta, amount right-aligned |
| Bulk action bar | a `surfaceVariant` strip: clear `IconButton`, count in `labelLarge`, text `Button`s; Delete in `error` |
| Low-stock badge | `labelMedium` in `error` |
| Search | outlined dense `TextInput` with a `TextInput.Icon` |
| Filter and sort | an outlined `Button` anchoring a `Menu` |
| Type badge | `View` with a 1px `outlineVariant` border on `surfaceMuted`, holding `labelMedium` |
| Thumbnail placeholder | `View` on `surfaceVariant` with an `Icon`; a real image is `expo-image` |

### Forms

| Pattern | Build |
| --- | --- |
| Product or Discount type selector | `SegmentedButtons` (wrap to two per row on narrow) |
| Section list (wide) | `Pressable` rows; active row on `surfaceMuted` with a 3px `accent` bar |
| Stepper (narrow) | "Step n of N" in `labelMedium`, `IconButton` back, contained Next `Button`, `ProgressBar` in `accent` |
| Field label | `labelMedium` above the control, `*` in `accent`, hint in `bodySmall` on the right |
| Text field | outlined dense `TextInput`, no floating `label`; `left` / `right` affixes carry `$` and units |
| Select | outlined non-editable `TextInput` anchoring a `Menu` — `src/components/menu-select.tsx` |
| Inline-create select | the Select with a last `Menu.Item` "+ New …" in `accent`, opening the confirm-or-picker; what is created comes back selected |
| Date or time field | the Select's shape with a `calendar` or `clock` icon, opening `DateTimePicker` from `@expo/ui/community/datetime-picker`; on iOS, the inline picker inside the dialog with Done |
| Date list | `Chip`s with an `x` close icon, kept sorted, then an `accent` text `Button` "+ Add date". "Remove …" goes on `closeIconAccessibilityLabel` |
| Weekly hours editor | seven rows split by 1px `surfaceVariant`: `Switch` in `accent`, `titleMedium` day, time fields while open; "Closed" in `onSurfaceFaint` |
| Variant matrix row | one 1px `outlineVariant` box per combination: `labelLarge` label, then SKU, barcode, price difference, quantity |
| Segmented field | `SegmentedButtons` |
| Toggle | Paper `Switch` with its on colour set to `accent`, sentence as `bodyMedium` beside it |
| Tags | `Chip`s in a wrapping row, then a text `Button` "+ add tag"; remove label on `closeIconAccessibilityLabel` |
| Repeatable rows | rows with a remove `IconButton`, then an `accent` text `Button` "+ Add …" |
| Note callout | `View` with a 3px left border in `accent` (or `error`) on `surfaceMuted`, holding `bodySmall` |
| Save as Draft / Publish | outlined + contained `Button`; pinned to the bottom edge on narrow |

### Detail and dialogs

| Pattern | Build |
| --- | --- |
| Detail header | thumbnail, `headlineMedium` name, type badge, status badge on `primary`, `amount` price, Archive and Edit `Button`s |
| Detail card | `Card mode="outlined"`; header strip is a `View` on `primary` holding `labelMedium` in `onPrimary`; key and value rows in `bodySmall` and `bodyMedium` |
| Confirm or picker (wide) | `Portal` + `Dialog` with `maxWidth`; kicker in `accent`, or `error` for a delete |
| Confirm or picker (narrow) | an expo-router route with `presentation: 'formSheet'`, `sheetAllowedDetents: 'fitToContents'`, `sheetCornerRadius: radius.xl`, living in `src/app/(app)/sheets/` as a leaf of the `(app)` Stack (an Android formSheet cannot host a nested stack). The frame and scrim belong to the OS, so content carries the theme: 2px `primary` top rule, then the same kicker, title and actions as the dialog, padded above the gesture bar. React Native's own `Modal presentationStyle="formSheet"` is iOS-only |
| Either of the two | `src/components/adaptive-dialog.tsx`: `wide` renders the `Dialog`, `inSheet` renders a sheet route's body. The opener decides — wide mounts the dialog, narrow pushes `/sheets/<name>` with ids as params. A sheet that creates something hands the row back through `src/Store/sheet-result.ts` |
| Narrow exceptions that stay a Paper bottom sheet | The unsaved-changes prompt (holds the navigation action the form blocked) and the iOS date/time picker |
| Multi-step flow opened from a list | Narrow: a full-screen pushed route. Wide: a Paper `Modal` with `radius.xl` corners. Not a sheet — it holds a `Menu`, which positions from window coordinates and lands offset in a partial-height native sheet |
| While a request is in flight | Dialog is `dismissable={false}`. A sheet route turns off `gestureEnabled` and swallows Android back; Android's swipe-down and scrim tap still close it natively. The request finishes regardless, and TanStack Query drops the unmounted sheet's `onSuccess` |

### Register

| Pattern | Build |
| --- | --- |
| Quantity stepper | two `IconButton`s around a `titleMedium` count, inside a 1px `outlineVariant` border |
| Mode, order type, payment method | `SegmentedButtons`; payment methods wrap on narrow |
| Totals block | `bodyMedium` rows, discount rows in `accent`, a 1px rule, `amount` grand total |
| Complete Sale / Charge | contained full-width `Button`, label left and amount right |
| Items / Cart (narrow) | `SegmentedButtons` across the top; cart count in an `accent` badge |
| Held-sale and discount pickers | the picker dialog or sheet, with `Pressable` rows |

### Home

| Pattern | Build |
| --- | --- |
| Greeting | `labelMedium` kicker, `display` greeting, `bodySmall` date and terminal |
| Destination tiles | a grid of `Pressable` cells separated by 2px `onSurface` rules: `Icon`, `headlineSmall` name, `bodySmall` description. Register's cell fills with `accent`; columns from `useColumns` |
| On the floor | `Avatar.Text` initials, `titleMedium` name, status line with a small square dot in `accent` or `onSurfaceFaint` |

### Full-width buttons

A Paper `Button` centres its label. Pass `contentStyle={{ justifyContent: 'flex-start' }}` — a layout
prop, so rule 3 allows it.

## 5. Icons

`SymbolView` from `expo-symbols` — SF Symbols on iOS, Material Symbols on Android.

- **Always give both halves.** `name` takes `{ ios, android }`. An SF-only name draws nothing on
  Android.
- **One vocabulary.** App code passes the map's names (`edit`, `delete`, `close`, `add`) to Paper's
  `icon` / `source` props, never a set's own name. The map is `ICONS` in `src/lib/icons.tsx`. A
  Material Symbols name the font lacks draws a blank with no warning — add and verify a new icon
  there before using it.
- **Theme colour reaches it.** Paper renders icon names through `PaperProvider`'s `settings.icon`;
  `renderIcon` maps the name to its pair and passes `color` as `tintColor`.
- **Unmapped names fall back to MaterialCommunityIcons**, on purpose — Paper asks for its own names
  internally (`menu-down`, `check`, `close`), and the `google` / `facebook` brand marks exist in no
  symbol set.
- **Android loads a font** (`@expo-google-fonts/material-symbols` through `expo-font`), so an icon is
  blank for the first frame on a cold start.
- **`NativeTabs` takes the same pair** as `sf` and `md` on its trigger icon.
- **iOS is unverified** — this machine is Windows. Names are checked against `sf-symbols-typescript`
  types only.

| Mockup | iOS | Android |
| --- | --- | --- |
| Menu, notifications, account | `line.3.horizontal`, `bell`, `person.crop.circle` | `menu`, `notifications`, `account_circle` |
| Home, Dashboard, Products | `house`, `chart.bar`, `list.bullet` | `home`, `bar_chart`, `list` |
| Discounts, Employees, Features, Audit | `percent`, `person.2`, `switch.2`, `list.clipboard` | `percent`, `group`, `toggle_on`, `assignment` |
| Search, filter, add, remove | `magnifyingglass`, `slider.horizontal.3`, `plus`, `xmark` | `search`, `tune`, `add`, `close` |
| Quantity, edit, delete | `minus` / `plus`, `pencil`, `trash` | `remove` / `add`, `edit`, `delete` |
| Back, next, dropdown | `chevron.left`, `chevron.right`, `chevron.down` | `chevron_left`, `chevron_right`, `expand_more` |
| Image placeholder, warning, lock | `photo`, `exclamationmark.circle`, `lock` | `image`, `error`, `lock` |
| Register calculator, barcode scan | `plus.forwardslash.minus`, `barcode.viewfinder` | `calculate`, `barcode_scanner` |

Four SF Symbols do not exist and have substitutes in `ICONS`: calculator
(`plus.forwardslash.minus`), handshake (`doc.text`), bread (`birthday.cake`), vertical ellipsis
(`ellipsis`).

## 6. Skill overrides

| Skill says | This file |
| --- | --- |
| `expo-native-ui`, `expo-overview`: check `@expo/ui` first | Paper is the component library (rule 6) |
| `expo-native-ui`, `expo-design-system`: `Color` from `expo-router` in a `Platform.select` palette | Theme keys in `src/themes.js` (§2) |
| `expo-native-ui`, `vercel-react-native-skills` `ui-styling`: `boxShadow` strings | Flat, ruled, outlined surfaces; Paper handles its own elevation |
| `expo-native-ui`: always a navigation stack title | `PageHeader` (§4) |
| `expo-native-ui`: inline styles, not `StyleSheet.create` | `StyleSheet.create` (rule 9) |
| `expo-design-system`: a local `ThemedText` wrapper | Paper `Text` with a variant |
| `vercel-react-native-skills` `ui-styling`: hierarchy by weight and colour | The nine variants |
| `vercel-react-native-skills` `ui-menus`: zeego native menus | Paper `Menu` — a native menu takes OS colours and cannot draw the accent "+ New …" row, and zeego needs a rebuild |

## 7. Not used here

No Modernist design-system classes — the mockups' `styles.css` is a web stylesheet. No Archivo. No
custom toggle — Paper's `Switch`, recoloured. No hand-shaped avatars — use `Avatar.Text label=""`
rather than a `View` with a hand-written radius. No per-screen colour picking.
