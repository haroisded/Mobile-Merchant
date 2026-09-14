# Visual language — the Merchant screens

How the mockups in `.claude/context/Revamped Merchant UI/` become theme keys and React Native Paper
components. It sits beside [`typography.md`](./typography.md), which owns every text size, and
[`layout.md`](./layout.md), which owns how a screen fills its width. This file owns the rest: colour,
corners, rules, the accent, icons, and which Paper piece builds each pattern the mockups draw.

**What exists today.** The new theme keys in §3, `roundness: 0` and the Feather icon renderer
landed with the merchant shell (`src/app/(app)/systems/[id]/_layout.tsx`), the first screen built
from these mockups. The shell is also the only screen built from them so far: the rest of this file
is still spec, written down so the next screen reuses these parts instead of inventing its own.

## Rules

1. The mockups are the picture; this file is the rule. Where the two disagree, this file wins. Where
   this file is silent, follow the mockup and add the missing row here in the same pass.
2. Build only what is inside a device frame. The canvas around the frames — the `#f3f2f2` page, the
   `#201e1d` ink, the 38px headings, the "Jump to" buttons, the captions — is presentation, never
   a screen.
3. Every colour is a theme key from §3. A mockup colour with no row in §3 is a missing key: add it to
   both themes and to §3, never inline it. `anti-slop/no-design-literals` fails lint on colour
   literals under `src/` outside `src/themes.js`.
4. Corners are square. `roundness: 0` in both themes squares Paper's components; never add a
   `borderRadius` by hand. Avatars stay circular (§5).
5. The accent goes only where §4 lists it.
6. Every primitive is a Paper component ([CLAUDE.md §3](../CLAUDE.md#3-the-ui) rule 1). §5 names
   the Paper piece for each mockup pattern; a pattern missing from §5 gets a row before it gets code.
7. Icons render Feather first and fall back to MaterialCommunityIcons (§6).
8. Nothing is centred: headings, copy, and the labels of full-width buttons all start at the left
   edge.

The rest of this file is why. Read it before overriding a rule, not before following one.

**Contents**

1. [Why a translation file](#1-why-a-translation-file)
2. [Screens and their mockups](#2-screens-and-their-mockups)
3. [Colour tokens](#3-colour-tokens)
4. [The accent](#4-the-accent)
5. [Mockup patterns, built with Paper](#5-mockup-patterns-built-with-paper)
6. [Icons](#6-icons)
7. [What is deliberately not here](#7-what-is-deliberately-not-here)

---

## 1. Why a translation file

The mockups are HTML with every value written on the element: roughly thirty font sizes, a dozen
slate hex codes, paddings of 7, 8, 9, 10, 11 and 12px, all rounded independently per frame.
Rebuilding them literally gives every screen its own numbers, and a later session reading the same
mockup rounds them differently again.

This file collapses them to a closed set: about twenty colour keys, nine type variants, one width
threshold and one table of Paper pieces. A new screen is built from those, so two sessions building
two screens from two mockups end up with the same parts.

The previous docs could not do that job. They were written for stock Material 3: rounded corners,
elevation, a centred reading column, six type sizes starting at 12. The Merchant mockups are square,
ruled, left-aligned and dense. The rules kept their mechanism — one theme file, Paper variants,
measured width — and changed their values.

---

## 2. Screens and their mockups

| Screen | Mockup | Also read |
| --- | --- | --- |
| Shell — header, rail, drawer | `POS Shell.dc.html` | — |
| Home | `Home Screen.dc.html` | — |
| Register | `Register Screen.dc.html` | — |
| Products | `Products Screens.dc.html` | `uploads/products-screen-spec.md` — every field and rule the form carries |
| Discounts | `Discounts Screens.dc.html` | — |

Each mockup draws a tablet frame (1024 × 768) and a mobile frame (390 × 844). They are two anatomies,
not two sizes — [`layout.md` §9](./layout.md#9-one-threshold-five-pairs).

The mockups disagree with each other in three places. These are settled:

- **The rail's destinations.** `POS Shell` lists seven and omits Discounts. The three later mockups
  list eight: Home, Register, Dashboard, Products, Discounts, Employees, Features, Audit. The eight
  win.
- **Home's ink.** `Home Screen` draws its rules and text in the Modernist near-black `#201e1d`.
  Every other mockup uses the theme's slate. Build Home in slate like the rest.
- **The mobile header title.** It reads "Merchant" everywhere except mobile Register, which reads
  "Register". Follow each mockup as drawn.

`ai-agents-read-first.txt` in that directory forbids editing it. Read it, never write into it.

---

## 3. Colour tokens

Every hex in a device frame, mapped to a theme key. Both tables are in `src/themes.js`, in
`lightColors` and `darkColors`.

### Already in the theme

| Mockup value | Key | Used for |
| --- | --- | --- |
| `#1E293B` | `primary` | header and rail ground, primary buttons, selected segment, detail-card header strip |
| `#1E293B` | `onSurface` | body text, names, amounts, 2px structural rules |
| `#FFFFFF` | `onPrimary` | text and icons on `primary` |
| `#FFFFFF` | `surface` / `background` | screen and pane ground |
| `#475569` | `secondary` | secondary labels, unselected segment text, column headers |
| `#CBD5E1` | `outlineVariant` | field borders, 1px rules between blocks |
| `#E2E8F0` | `surfaceVariant` | thumbnail placeholders, tag fills, hairlines between rows |
| `#BA1A1A` | `error` | Void, Delete, destructive kickers, Paused status |
| `#FFF2F0` / `#7A1512` | `errorContainer` / `onErrorContainer` | the "hard delete is blocked" callout |
| `rgba(17,23,33,.55)` | `backdrop` | dialog and sheet scrim |

The callout's mockup tint is slightly lighter than `errorContainer` (`#FFDAD6`). The existing pair is
reused rather than adding a near-duplicate key.

### New keys

| Mockup value | Key | Light | Dark (proposed) | Used for |
| --- | --- | --- | --- | --- |
| `#ec3013` | `accent` | `#EC3013` | `#EC3013` | §4 only |
| `#FFFFFF` on accent | `onAccent` | `#FFFFFF` | `#FFFFFF` | text on an accent fill |
| `#64748B` | `onSurfaceMuted` | `#64748B` | `#A3AEBE` | hints, SKUs, sub-lines, Draft and Scheduled status |
| `#94A3B8` | `onSurfaceFaint` | `#94A3B8` | `#7C8898` | placeholders, "Opt" markers, Inactive and Expired status |
| `#F1F5F9` | `surfaceMuted` | `#F1F5F9` | `#1E2632` | selected row, active form section, type badge fill |
| `#F8FAFC` | `surfaceSubtle` | `#F8FAFC` | `#1A212C` | toolbars, the receipt pane, date fields on cart lines |
| `rgba(255,255,255,.14)` | `primaryHighlight` | `rgba(255,255,255,0.14)` | `rgba(0,0,0,0.12)` | the active rail and drawer item |

The accent stays `#EC3013` in dark mode: `POS Shell` keeps the same red on its dark palette. The other
dark values follow the existing dark ramp (`outline`, `elevation.level1`, `elevation.level2`) and are
not yet checked on a device.

Paper types `theme.colors` to MD3 keys only. The new keys need one typed hook,
`useAppTheme()`, returning `useTheme<AppTheme>()` — a generic, not a type assertion, so it passes
`.oxlintrc.json`. It lives in `src/lib/theme.ts`.

---

## 4. The accent

The mockups use the red like a highlighter: a few small, specific places. It goes **only** here:

- **Register's tile on Home** — the one filled tile. The mockup's own caption says why: Register is
  the reason the tablet is switched on.
- **The active rail or drawer item's 4px bar.**
- **Kickers** — the small uppercase line above a screen or dialog title.
- **The required-field `*`** and inline field actions ("Auto-generate", "Scan", "+ Add rate").
- **A toggle that is on**, and the stepper's progress bar.
- **Discount state on a cart** — applied discount lines in the totals, "Eligible" and "Apply" tags,
  the eligible-discount strip.
- **The left rule of a note callout**, and the Cart count badge on the selected mobile tab.

Everything else is ink on white. Destructive actions use `error`, never `accent`: the two reds must
stay distinguishable.

### Status colours

One mapping, used in every list and detail header:

| Status | Colour |
| --- | --- |
| Active | `onSurface` |
| Draft, Scheduled | `onSurfaceMuted` |
| Inactive, Expired | `onSurfaceFaint` |
| Paused | `error` |

---

## 5. Mockup patterns, built with Paper

`roundness: 0` squares everything below that has a radius, because Paper multiplies it into each
component's corners: `Button/Button.tsx:283`, `SegmentedButtons/SegmentedButtonItem.tsx:165`,
`Card/Card.tsx:270`, `Dialog/Dialog.tsx:110`, `TextInput/Addons/Outline.tsx:44`.

### Structure

| Pattern | Build |
| --- | --- |
| 2px rule under a page header, above a totals block, between Home's sections | `View` with `height: 2` and `backgroundColor: onSurface` |
| 1px rule between blocks | `outlineVariant`; between list rows, `surfaceVariant` |
| Page header | `labelMedium` kicker in `accent`, `headlineMedium` title, a `bodySmall` count, a contained `Button`; the 2px rule below — `src/components/PageHeader.tsx` |
| Section heading inside a screen | `headlineSmall` plus a `bodySmall` hint on the same baseline |

### The shell

| Pattern | Build |
| --- | --- |
| Header | `Appbar.Header` on `primary`: menu `Appbar.Action`, `Appbar.Content` title, bell and account actions |
| Rail (wide) and drawer (narrow) | the expo-router `Drawer` in the shell layout, `drawerType` `'permanent'` or `'front'` ([`layout.md` §9](./layout.md#9-one-threshold-five-pairs)); `drawerContent` built from the rows below; `drawerStyle` zeroes react-navigation's own hairline border and 16-radius drawer corners, which `roundness` cannot reach |
| Rail and drawer item | `TouchableRipple` holding `Icon` and a `labelLarge` label; active item on `primaryHighlight` with a 4px `accent` bar on the left edge |
| System badge ("67") | `Avatar.Text` on `onPrimary` |
| Collapse to icons | the menu action toggles `RAIL_EXPANDED` / `RAIL_COLLAPSED` |

### Lists

| Pattern | Build |
| --- | --- |
| Wide list | `DataTable`: a `labelMedium` `Text` as each `DataTable.Title`'s child (the title sets no variant of its own — `DataTable/DataTableTitle.tsx` has none), a `Checkbox.Android` column for bulk select, `IconButton` row actions |
| Narrow list | `FlashList` rows: thumbnail, `titleMedium` name, a badge, `bodySmall` meta, the amount right-aligned |
| Bulk action bar | a `surfaceVariant` strip: a clear `IconButton`, the count ("3 selected") in `labelLarge`, then text `Button`s; Delete in `error` |
| Low-stock badge | `labelMedium` in `error` — a warning, so never `accent` |
| Search | outlined dense `TextInput` with a `TextInput.Icon` search icon |
| Filter and sort controls | an outlined `Button` anchoring a `Menu` |
| Type badge | a `View` with a 1px `outlineVariant` border on `surfaceMuted`, holding `labelMedium` |
| Thumbnail placeholder | a `View` on `surfaceVariant` with an `Icon`; a real image is `expo-image` ([`layout.md` §7](./layout.md#7-images)) |

### Forms

| Pattern | Build |
| --- | --- |
| Product or Discount type selector | `SegmentedButtons` (the options wrap to two per row on narrow) |
| Section list (wide) | `TouchableRipple` rows; the active row on `surfaceMuted` with a 3px `accent` bar |
| Stepper (narrow) | "Step n of N" in `labelMedium`, `IconButton` back, a contained Next `Button`, a `ProgressBar` in `accent` |
| Field label | `labelMedium` above the control, the `*` in `accent`, the hint in `bodySmall` on the right |
| Text field | outlined dense `TextInput` with no floating `label`; `left` / `right` affixes carry `$` and units |
| Select | an outlined `TextInput`, not editable, anchoring a `Menu` — `src/components/MenuSelect.tsx` |
| Inline-create select (Category, Tax class, Supplier) | the Select with a last `Menu.Item` "+ New …" in `accent`, opening the confirm-or-picker dialog below; what is created comes back selected |
| Date or time field | the Select's shape with a `calendar` or `clock` icon, opening `DateTimePicker` from `@expo/ui/community/datetime-picker` — Android's own dialog; on iOS the inline picker inside the dialog pattern, with Done |
| Date list (Blackout dates) | `Chip`s with an `x` close icon, kept sorted, then an `accent` text `Button` "+ Add date" |
| Weekly hours editor | seven rows split by 1px `surfaceVariant`: a `Switch` in `accent`, the `titleMedium` day, and opening / closing time fields while open; "Closed" in `onSurfaceFaint` |
| Variant matrix row | one 1px `outlineVariant` box per combination: the `labelLarge` label ("Small · Hot"), then SKU, barcode, price difference and quantity in the field grid |
| Segmented field (Status, Duration Type) | `SegmentedButtons` |
| Toggle | Paper `Switch` with its on colour set to `accent`, and the on/off sentence as `bodyMedium` beside it |
| Tags | `Chip`s in a wrapping row, then a text `Button` "+ add tag" |
| Repeatable rows (Rate Tiers, Components) | rows with a remove `IconButton`, then an `accent` text `Button` "+ Add …" |
| Note callout | a `View` with a 3px left border in `accent` (or `error` for a warning) on `surfaceMuted`, holding `bodySmall` |
| Save as Draft / Publish | an outlined and a contained `Button`; pinned to the bottom edge on narrow |

### Detail and dialogs

| Pattern | Build |
| --- | --- |
| Detail header | thumbnail, `headlineMedium` name, type badge, a status badge on `primary`, `amount` price, Archive and Edit `Button`s |
| Detail card | `Card mode="outlined"`; its header strip is a `View` on `primary` holding `labelMedium` in `onPrimary`; key and value rows in `bodySmall` and `bodyMedium` |
| Confirm or picker (wide) | `Portal` + `Dialog` with `maxWidth` ([`layout.md` §6](./layout.md#6-paper-components-that-need-handling)); the kicker in `accent`, or `error` for a delete |
| Confirm or picker (narrow) | `Portal` + `Modal`, bottom-anchored, full width, with a 2px `primary` top rule |
| Either of the two above | `src/components/AdaptiveDialog.tsx`, given the shell's width decision (`useShellWide()`) |

### Register

| Pattern | Build |
| --- | --- |
| Quantity stepper | two `IconButton`s (minus and plus) around a `titleMedium` count, inside a 1px `outlineVariant` border |
| Mode, order type, payment method | `SegmentedButtons`; payment methods wrap on narrow |
| Totals block | `bodyMedium` rows, discount rows in `accent`, a 1px rule, `amount` grand total |
| Complete Sale / Charge | a contained full-width `Button`, label left and amount right |
| Items / Cart (narrow) | `SegmentedButtons` across the top; the cart count in an `accent` badge |
| Held-sale and discount pickers | the picker dialog or sheet above, with `TouchableRipple` rows |

### Home

| Pattern | Build |
| --- | --- |
| Greeting | `labelMedium` kicker, `display` greeting, `bodySmall` date and terminal |
| Destination tiles | a grid of `TouchableRipple` cells separated by 2px `onSurface` rules: `Icon`, `headlineSmall` name, `bodySmall` description. Register's cell fills with `accent`; columns come from `useColumns` |
| On the floor | `Avatar.Text` initials, `titleMedium` name, a status line with a small square dot in `accent` or `onSurfaceFaint` |

### Full-width buttons

A Paper `Button` centres its label. Where the mockups draw a full-width button — the mobile form
footer, Charge, Complete Sale, sheet actions — pass `contentStyle={{ justifyContent: 'flex-start' }}`.
It is a layout prop, not type or colour, so rule 3 allows it.

---

## 6. Icons

The mockups draw thin line icons (Lucide). Feather is the set Lucide grew from, and it is already
installed:

- **It works offline.** `@expo/vector-icons/build/Feather.js:3` imports the font from the package's
  own `vendor/react-native-vector-icons/Fonts/Feather.ttf`, which `expo-font` loads locally. There is
  no network fetch on native or web, and no new dependency.
- **It works with Paper.** Paper renders icon *names* through `PaperProvider`'s `settings.icon`,
  which `src/app/_layout.tsx` points at Feather first. That function is the whole change; Paper
  itself is untouched.

### Feather first, MaterialCommunityIcons as the fallback

Feather has 280-odd glyphs and no calculator or barcode scanner, and Paper's own names (`magnify`,
`menu-down`, `check`) are MaterialCommunityIcons names. So the renderer checks the name:

```tsx
settings={{
  icon: ({ name, color, size, allowFontScaling, testID }) =>
    // glyphMap is exposed on every icon set (createIconSet.d.ts:74)
    Object.hasOwn(Feather.glyphMap, name) ? (
      <Feather name={name} color={color} size={size} allowFontScaling={allowFontScaling} testID={testID} />
    ) : (
      <MaterialCommunityIcons name={name} color={color} size={size} allowFontScaling={allowFontScaling} testID={testID} />
    ),
}}
```

Some of Paper's built-in icons never reach this function at all — the `Appbar` back arrow, the
`Searchbar` magnifier, the `Snackbar` close button, `DataTable`'s sort arrows. They call their own
`MaterialCommunityIcon`, which loads `@expo/vector-icons/MaterialCommunityIcons` directly
(`MaterialCommunityIcon.tsx:45`), and keep working unchanged.

A name in both sets renders from Feather. `home`, `bell`, `menu`, `check` and `list` exist in both,
so the Home-Page screens' `home-outline` and `bell-outline` still resolve to MaterialCommunityIcons
until they are renamed.

### The mockup icons

Verified against `vendor/react-native-vector-icons/glyphmaps/Feather.json`:

| Mockup | Feather name |
| --- | --- |
| Menu, notifications, account | `menu`, `bell`, `user` |
| Home, Dashboard, Products | `home`, `bar-chart-2`, `list` |
| Discounts, Employees, Features, Audit | `percent`, `users`, `toggle-right`, `clipboard` |
| Search, filter, add, remove | `search`, `sliders`, `plus`, `x` |
| Quantity, edit, delete | `minus` / `plus`, `edit-2`, `trash-2` |
| Back, next, dropdown | `chevron-left`, `chevron-right`, `chevron-down` |
| Image placeholder, warning, lock (price override) | `image`, `alert-circle`, `lock` |

Register's calculator and the barcode-scan button have no Feather glyph. Pick a
MaterialCommunityIcons name for each when Register is built; the fallback renders it.

---

## 7. What is deliberately not here

**No Modernist design-system classes.** The mockups link a `styles.css` from a "Modernist" web design
system: Archivo, a red-on-warm-grey palette, `.btn`, `.card`. It is a web stylesheet and does not
reach React Native. Only its principles carried over — square corners, drawn rules, left alignment, a
sparing accent — and its palette was replaced by the theme's slate.

**No Archivo.** The human chose the system font on 2026-09-13.
[`typography.md` §6](./typography.md#6-what-is-deliberately-not-here).

**No custom square toggle.** The mockups draw a square switch. Paper's `Switch` is the platform's
native control, with rounded ends. A hand-built square toggle is a new primitive
([CLAUDE.md §3](../CLAUDE.md#3-the-ui) rule 1) that loses the native accessibility role, haptics and
platform behaviour, to change one shape. The native switch, recoloured, is the trade.

**No square avatars.** The mockups square the staff initials on Home. `Avatar.Text` is circular by
its own stylesheet, and squaring it means overriding that radius at the call site. Rule 4's
square-corner rule covers surfaces, not identity marks.

**No per-screen colour picking.** The mockups write a colour on almost every element. A colour that
feels like it needs a new shade is either a key already in §3 or a missing key to add to §3 —
never a literal, which the lint rule would reject anyway.
