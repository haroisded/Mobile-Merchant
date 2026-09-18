# Typography

Native only. Paired with [`layout.md`](./layout.md) and [`visual-language.md`](./visual-language.md).

## Rules

1. Render every string with Paper's `Text`, passing a `variant`. Import from `@/components/text`,
   never from `react-native-paper`.
2. Never import `Text` from `react-native`.
3. Never write `fontSize`, `lineHeight`, `fontWeight`, `letterSpacing`, `fontFamily` or
   `textTransform` at a call site. They live in `src/themes.js`. `anti-slop/no-design-literals`
   fails `npm run lint` on the first five anywhere under `src/` except that file.
4. Use only the nine variants in §1. Adding a tenth is a decision — write down what it is for.
5. Never pass `variant` to `Button`, `Chip`, `Dialog.Title` or `Appbar.Content`. Do pass
   `titleVariant="titleMedium"` to `Card.Title`.
6. Never swap a variant on a breakpoint or a device check.
7. `maxFontSizeMultiplier={1.3}` on table and list-row text. Never cap body text, forms, dialogs or
   error messages.
8. System font. No typeface is loaded.

---

## 1. The nine variants

| Variant | Size / leading | Weight | Use |
| --- | --- | --- | --- |
| `display` | 30 / 34 | 800 | the one hero line on a screen that has one — Home's greeting, the paid figure |
| `headlineMedium` | 24 / 28 | 800 | a screen's title; the name in a detail header |
| `headlineSmall` | 19 / 24 | 800 | a heading inside a screen, Home's tiles, every dialog and sheet title |
| `amount` | 20 / 24 | 800 | a money figure that is the point of its block |
| `titleMedium` | 14 / 18 | 600 | list-row names, product names, the rail's brand line |
| `bodyMedium` | 13 / 18 | 400 | field values, descriptions, default body |
| `bodySmall` | 11 / 15 | 400 | secondary data — SKU, hints, sub-lines, timestamps |
| `labelMedium` | 10 / 14 | 700, tracking 1, **uppercase** | kickers, field labels, column headers, badges, status tags |
| `labelLarge` | 12 / 16 | 600 | rail and drawer labels; `Button` and `Chip` pick it themselves |

`titleLarge` is also overridden (19 / 24, 700) only because `Appbar.Content` picks it. Never type it.

`labelMedium` carries `textTransform: 'uppercase'` in the token. Write copy in normal case.

## 2. Defining them

One `configureFonts` call in `src/themes.js`, shared by both themes:

```js
import { configureFonts, MD3LightTheme } from 'react-native-paper';

const fonts = configureFonts({
  config: {
    // An MD3 key merges over its default — name only what changes.
    headlineMedium: { fontSize: 24, lineHeight: 28, fontWeight: '800' },
    // A new key has no default to merge over — it carries every property.
    display: {
      fontFamily: MD3LightTheme.fonts.default.fontFamily,
      fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.5,
    },
  },
});
```

Three things that will bite:

- **Always key by variant.** `configureFonts` treats a config whose values are all non-objects as a
  *flat* config and merges it into all fifteen variants. `config: { fontSize: 26 }` silently resizes
  the entire typescale.
- **Both themes need the key.** `LightTheme` and `DarkTheme` are separate objects.
- **Custom keys need a typed `Text`.** Paper types `variant` to MD3 keys only. `AppText` from
  `src/lib/theme.ts` is Paper's own component cast to a wider variant type — import it wherever
  `display` or `amount` is used.

## 3. Variants Paper picks itself

Verified against `react-native-paper@5.15.3`. Do not pass a `variant` to these:

| Component | Variant |
| --- | --- |
| `Button`, `Chip` | `labelLarge` |
| `Dialog.Title` | `headlineSmall` |
| `Appbar.Content` | `titleLarge` in default small mode |

Two exceptions:

- **`Card.Title`** defaults to `bodyLarge` / `bodyMedium` — body type for a heading. Pass
  `titleVariant="titleMedium"`.
- **`List.Item` uses no variant at all** — it reads a raw `fontSize` from its own stylesheet and will
  not follow a theme change. Restyle through `titleStyle` / `descriptionStyle`, or build the row
  from `Text` variants.

## 4. Text does not scale with width

No `isWide ? 'headlineMedium' : 'headlineSmall'`. Reading distance barely changes between a phone
and a handheld tablet, so physical text size stays constant. What changes on a tablet is how much
fits and how long lines get — 14pt across 1000dp gives ~110 characters, unreadable because of the
measure, not the size. For a data-heavy app, scaling type up spends the extra screen making rows
taller, so the larger device shows less.

The lever for reading distance is the OS accessibility setting, which React Native already honours on
both platforms and which scales `lineHeight` with it. Nothing to build.

What *does* respond to width: which anatomy renders, column count, gutters and padding, visible table
columns ([`layout.md` §5](./layout.md)).

## 5. Capping the font scale

- **Cap at `1.3`** on tables, list rows and anything laid out in columns — content that is scanned.
- **Never cap** body text, dialogs, form fields or error messages — content that is read.

Paper exposes `maxFontSizeMultiplier`, plus `titleMaxFontSizeMultiplier` and
`descriptionMaxFontSizeMultiplier` for list rows and `Card.Title`. A global cap defeats the setting.

## 6. Not used here

No Archivo or any loaded typeface — system font only. Changing it is one `fontFamily` per token in
`src/themes.js` plus a font load in the root layout; nothing at a call site. No local `Text` wrapper
or `ThemedText`. No in-app text-size control — the OS setting covers it. No emoji-splitting.
