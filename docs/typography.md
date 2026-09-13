# Typography rules

Native only — iOS and Android, phone and tablet. Everything below is enforced by convention and one
lint rule, not by a component: there is no local `Text` wrapper to route through, and there must not
be one. See [CLAUDE.md §3](../CLAUDE.md#3-the-ui) for the wider UI rules this sits under, and
[`visual-language.md`](./visual-language.md) for how the Merchant mockups map onto the variants
below.

## Rules

1. Render every string with `Text` from `react-native-paper`, passing a `variant`.
2. Never write `fontSize`, `lineHeight`, `fontWeight`, `letterSpacing`, `fontFamily` or
   `textTransform` at a call site. They live in `src/themes.js`. `anti-slop/no-design-literals` fails
   `npm run lint` on the first five anywhere under `src/` except that file.
3. Never import `Text` from `react-native`.
4. Use only the nine variants in §2: `display`, `headlineMedium`, `headlineSmall`, `amount`,
   `titleMedium`, `bodyMedium`, `bodySmall`, `labelMedium`, `labelLarge`. Adding a tenth is a
   decision — write down what it is for.
5. Never pass `variant` to `Button`, `Chip`, `Dialog.Title` or `Appbar.Content`; they choose their
   own, and §2 overrides the keys they choose. Do pass `titleVariant="titleMedium"` to `Card.Title`,
   whose default is body type.
6. Never swap a variant on a breakpoint or a device check — including to reproduce a mockup that
   draws the same text 1–3px apart on tablet and mobile.
7. Set `maxFontSizeMultiplier={1.3}` on table and list-row text. Never cap body text, forms,
   dialogs, or error messages.
8. The system font. No typeface is loaded. §6.

The rest of this file is why. Read it before overriding a rule, not before following one.

**Contents**

1. [The one rule](#1-the-one-rule)
2. [The variants you type](#2-the-variants-you-type)
3. [The variants Paper picks for you](#3-the-variants-paper-picks-for-you)
4. [Text does not scale with screen width](#4-text-does-not-scale-with-screen-width)
5. [Capping the OS font scale](#5-capping-the-os-font-scale)
6. [What is deliberately not here](#6-what-is-deliberately-not-here)

---

## 1. The one rule

**Every string renders through `Text` from `react-native-paper` with a `variant`, and the theme is
the only place a size is ever defined.**

Paper's `Text` reads `theme.fonts[variant]` off `PaperProvider`'s context and puts that object first
in its style array (`react-native-paper/src/components/Typography/Text.tsx:98-99`), so
`src/themes.js` is already the single choke point every piece of text passes through. Nothing needs
building to get that property, and it reaches further than a hand-rolled wrapper would — `Button`,
`Card.Title`, `Appbar.Content` and `HelperText` resolve through the same theme.

Which gives three prohibitions:

- **No local `Text` component.** A second text primitive means two right answers and a choice at
  every call site. The typed `Text` in §2 is Paper's own component with a wider type, not a second
  one.
- **No inline `fontSize`, `lineHeight`, `fontWeight`, `letterSpacing`, `fontFamily` or
  `textTransform`.** If a size is needed that no variant provides, the variant list is wrong — fix
  the theme, not the call site.
- **No `Text` from `react-native`.** It bypasses the theme entirely and renders unstyled.

Changing the scale globally is `configureFonts` in `src/themes.js`, applied once. Every Paper
component follows on the next render.

---

## 2. The variants you type

The Merchant mockups (`.claude/context/Revamped Merchant UI/`) set text at roughly thirty sizes
between 8.5 and 34px, most of them one screen's rounding of another's. Built literally, every screen
would carry its own numbers. The scale below is those sizes collapsed to nine roles.

Two roles, `display` and `amount`, are not MD3 keys and are added. The other seven override MD3
keys, chosen so the components that pick a key for themselves (§3) land on the same scale.

| Variant | Size / leading | Weight | Use | In the mockups |
| --- | --- | --- | --- | --- |
| `display` | 30 / 34 | 800 | the one hero line on a screen that has one — Home's greeting, the "paid" figure after a sale | 31 / 25, receipt 34 / 30 |
| `headlineMedium` | 24 / 28 | 800 | a screen's title — Products, Discounts, the name in a detail header | 26 tablet / 23 mobile, detail 24, form 22 |
| `headlineSmall` | 19 / 24 | 800 | a heading inside a screen, Home's destination tiles, every dialog and sheet title | section 17, tiles 16–17, dialog 20 / 18 |
| `amount` | 20 / 24 | 800 | a money figure that is the point of its block — grand total, detail price | 21, 20 / 17 |
| `titleMedium` | 14 / 18 | 600 | list-row names, product names, the rail's brand line | 13–14 |
| `bodyMedium` | 13 / 18 | 400 | field values, descriptions, default body | 12.5–13.5 |
| `bodySmall` | 11 / 15 | 400 | secondary data — SKU, hints, sub-lines, timestamps | 10.5–12 |
| `labelMedium` | 10 / 14 | 700, tracking 1, **uppercase** | kickers, field labels, table column headers, badges, status tags | 9–10, tracked, uppercase |
| `labelLarge` | 12 / 16 | 600 | rail and drawer labels; `Button` and `Chip` pick it themselves | 11–12.5 |

`titleLarge` is also overridden, to 19 / 24 at 700, only because `Appbar.Content` picks it for the
header's "Merchant" title (§3). Never type it.

### The uppercase lives in the token

`labelMedium` carries `textTransform: 'uppercase'`. Paper's `Text` builds its style as
`[font, style]` (`Text.tsx:99`), so every key in the variant object reaches the native `Text`, not
only the five `MD3Type` declares. Write the copy in normal case; the token uppercases it.

`MD3Type` has no `textTransform` field. `src/themes.js` is plain JavaScript, so `tsc` never checks
its font objects against `MD3Type` and no local type is needed to carry the key.

### Where those sizes come from

`src/themes.js`, through one `configureFonts` call shared by both themes. It landed with the merchant
shell. The Home-Page screens resized with it, because they already used `headlineMedium`,
`headlineSmall`, `titleMedium`, `bodyMedium`, `bodySmall` and `labelMedium`.

Adding the keys, in both theme objects:

```js
import { configureFonts, MD3LightTheme } from 'react-native-paper';

const fonts = configureFonts({
  config: {
    // An MD3 key merges over its default (fonts.tsx:101-110), so name only what changes.
    headlineMedium: { fontSize: 24, lineHeight: 28, fontWeight: '800' },
    // A new key has no default to merge over, so it carries every property itself.
    display: {
      fontFamily: MD3LightTheme.fonts.default.fontFamily,
      fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.5,
    },
  },
});

export const LightTheme = { ...MD3LightTheme, roundness: 0, colors: { ...MD3LightTheme.colors, ...lightColors }, fonts };
```

**The trap is a config with no variant key.** `configureFonts` checks whether every value in
`config` is a non-object (`fonts.tsx:88-98`) and, if so, treats the whole thing as a *flat* config
and merges it into **all fifteen variants**. So `config: { fontSize: 26 }` — one level shallower
than the example — silently resizes the entire typescale. Always key by variant.

**Both themes need the key.** `LightTheme` and `DarkTheme` are separate objects, and `fonts` on one
does not reach the other.

**Custom keys need a typed `Text`.** Paper types `variant` to the MD3 keys. `customText` (exported at
`src/index.tsx:68`) is the same component cast to a wider variant type (`Text.tsx:185`):
`customText<'display' | 'amount' | …>()`. It is exported once, as `AppText` from `src/lib/theme.ts`;
import that wherever `display` or `amount` is used. It is a cast, not a new component, so rule 1 still holds.

### Not in the list, and why

| Cut | Reason |
| --- | --- |
| `displayLarge` / `Medium` / `Small` (57/45/36) | Marketing hero type. `display` at 30 covers the one hero line an app screen has |
| `headlineLarge` (32) | Sits between `display` and `headlineMedium` and does the job of neither |
| `titleSmall` (14) | Collides with `titleMedium`, which is 14 on this scale |
| `bodyLarge` (16) | No role left: the only 16–17px text in the mockups is Home's tiles, which are headings |
| `labelSmall` (11) | Collides with `bodySmall`; the small uppercase role is `labelMedium` |

### Rejected: a 12px floor for labels

The previous version of this file cut 11px as too small to read at arm's length and floored every
label at 12. The mockups put every field label, kicker and column header at 9–10px.

`labelMedium` at 10 accepts that **for uppercase, bold, tracked text only** — cap height and weight
carry it where a lowercase 10 would not. Nothing read as a sentence goes below `bodySmall` at 11.

---

## 3. The variants Paper picks for you

Verified against `react-native-paper@5.15.3`. Do not pass a `variant` to these — they choose one,
and overriding it breaks the component's own spacing. §2 overrides the keys instead, so they follow
the scale anyway:

| Component | Variant | Source |
| --- | --- | --- |
| `Button`, `Chip` | `labelLarge` | `Button/Button.js:163`, `Chip/Chip.js:154` |
| `Dialog.Title` | `headlineSmall` | `Dialog/DialogTitle.js:58` |
| `Appbar.Content` | `titleLarge` / `headlineSmall` / `headlineMedium` by `mode` — the Merchant header is the default small mode, so `titleLarge` | `Appbar/utils.js:72-75` |

Two that need attention:

**`Card.Title` defaults to `bodyLarge` for the title and `bodyMedium` for the subtitle**
(`Card/CardTitle.js:41,46`) — body type for a heading, and `bodyLarge` is not on this scale. Pass
`titleVariant="titleMedium"` so a card title reads as a title.

**`List.Item` uses no variant at all.** It reads a raw `fontSize` out of its own stylesheet, so its
text sits outside the theme. A list row will not follow a scale change made in `src/themes.js` —
restyle it through `titleStyle` / `descriptionStyle`, which is a style prop and not a call-site
size, or build the row from `Text` variants.

---

## 4. Text does not scale with screen width

**Never swap a variant on a breakpoint.** No `isWide ? 'headlineMedium' : 'headlineSmall'`.

The mockups appear to ask for it: Products' title is 26 on the tablet frame and 23 on the phone one.
Those are two drawings rounded independently, not a rule, and one variant absorbs a 3px difference.

Reading distance barely changes between a phone and a handheld tablet — both sit around 30-40 cm — so
physical text size should stay constant. What changes on a tablet is how much fits and how long the
lines get: 14pt across 400dp gives roughly 45 characters per line, near optimal; the same 14pt across
1000dp gives 110, which is unreadable because of the measure, not the size.

For a data-heavy app it is worse than neutral. A tablet's value is more rows visible at once. Scale
the type up with the viewport and the extra screen is spent making each row taller, so the larger
device shows less.

The tablet exception is real but a breakpoint cannot serve it: a tablet on a counter or mounted on a
cart is read at 60-70 cm, and a tablet in someone's hands is not — **viewport width cannot tell you
reading distance.** The lever for that is user preference, and it already exists. React Native honors
the OS accessibility text setting on both platforms and scales `lineHeight` with it, so absolute
leading stays proportional:

- iOS — `RCTTextAttributes.mm:141`, `lineHeight * self.effectiveFontSizeMultiplier`
- Android — `TextAttributes.kt`, `effectiveLineHeight` converts through `toPixelFromSP()`, which
  applies `fontScale`; `letterSpacing` too

So a user who needs larger text sets it once, system-wide, and every Paper component follows. Nothing
to build.

**What does respond to width:** which anatomy renders (rail or drawer, table or card list — see
[`layout.md` §9](./layout.md#9-one-threshold-five-pairs)), column count, gutters and padding, and how
many table columns are visible. That is where the tablet layout work belongs.

---

## 5. Capping the OS font scale

Dense data and a 200% accessibility setting fight each other — a table at that scale is unusable.

Paper already exposes React Native's `maxFontSizeMultiplier` on the components that matter, including
separately for a list row's two lines (`titleMaxFontSizeMultiplier`, `descriptionMaxFontSizeMultiplier`)
and on `Card.Title`.

The division:

- **Cap around `1.3`** on tables, list rows, and anything laid out in columns — content that is
  scanned.
- **Never cap** body text, dialogs, form fields, or error messages — content that is read, and where
  the accessibility setting exists to do its job.

A cap is a layout decision. Applying one globally defeats the setting entirely.

---

## 6. What is deliberately not here

Recorded so it is not re-litigated.

**No Archivo.** The mockups are set in Archivo at 400–800. The human chose the system font on
2026-09-13: it needs no font asset and no loading gate before the first render, at the cost of a
plainer look. The sizes and weights in §2 carry over unchanged. Revisiting it is one `fontFamily` per
token in `src/themes.js` and a font load in the root layout — nothing at any call site.

**No port of Bluesky's ALF typography system.** It was evaluated. Its central mechanism —
`normalizeTextStyles()` treating `lineHeight` as a ratio of the already-scaled font size — exists
because that codebase applies a second, JS-side scale multiplier that touches only `fontSize`, so its
leading would desync without the ratio math. There is no second scale axis here, and React Native
already scales absolute `lineHeight` correctly (§4). The rest of that system is web machinery: the
`!IS_NATIVE` lineHeight fallback, the `numberOfLines={1}` react-native-web overflow fix,
`-webkit-text-size-adjust`, and web-only `role` attributes on heading elements. None of it applies.

**No in-app text-size control.** It is the correct shape for one — three steps mapped over the
typescale via `configureFonts`, held in state, passed to `PaperProvider` — and roughly eight lines
when it is wanted. It is not wanted until a settings screen exists to expose it, and the OS setting
already covers the need.

**No emoji-splitting.** Bluesky splits emoji into a nested `Text` forced to the system font because
Inter carries no emoji glyphs. This project loads no custom typeface, and the system font has emoji.
