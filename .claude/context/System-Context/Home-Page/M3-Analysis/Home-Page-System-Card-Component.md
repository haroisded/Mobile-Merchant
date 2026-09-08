## Component Name: SystemCard (POS System Summary Card)

A `Card` used in the home page grid to represent a created point-of-sale system. It follows the standard `Card` anatomy: media, title, and actions.

---

| # | M3 Component | Variant / Notes |
|---|---|---|
| 1 | **Card** (contained/elevated) | Outer container. Background `surfaceContainerLow` (or `surfaceVariant` depending on elevation). |
| 2 | **Card.Cover** | Top image (cafe photo). |
| 3 | **Card.Title** | "Cafe 67" — **must pass** `titleVariant="titleMedium"` (rule §5: default is `bodyLarge`, which is forbidden; must be overridden to `titleMedium`). |
| 4 | **Card.Actions** | Bottom row container for buttons. |
| 5 | **Button** (filled) | "Edit" — `mode="contained"` with `icon="pencil"`. Background `primary`, text `onPrimary`. Label `labelLarge` (auto-picked by Paper, rule §3). |
| 6 | **Button** (filled) | "Remove" — `mode="contained"` with `icon="delete"`. Background `error`, text `onError`. Label `labelLarge` (auto-picked by Paper, rule §3). |

---

### Key notes

- No inline `fontSize`, `lineHeight`, `fontWeight`, or `letterSpacing` — all sizes come from theme variants.
- The `Card.Title` is the only place where a `titleVariant` must be explicitly passed (per rule §5), since Paper defaults it to `bodyLarge` (which is cut from our scale).
- The `Edit` and `Remove` buttons use the same `labelLarge` automatically — no `variant` prop passed (rule §5).