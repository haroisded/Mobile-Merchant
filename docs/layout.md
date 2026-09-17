# Layout and responsiveness rules

Phones and tablets, iOS and Android. No web. Sits alongside
[`typography.md`](./typography.md) — the two interlock, because the reason text never scales
on a breakpoint is the same reason a card never gets wider on one. What a screen *looks* like is
[`visual-language.md`](./visual-language.md); this file is how it fills the width it is given.

## Rules

1. Never set a card's width or height. Set a minimum width and derive the column count. Panes and
   chrome — the rail, a form's section list, the register's item pane — are not cards; their widths
   are the named constants in §9.
2. Derive that count from the **container's** measured width via `onLayout`. Never make a layout
   decision from `useWindowDimensions()`, and never call `Dimensions.get()` at module scope.
3. On a wider container, grid cards get **more columns**. Row cards get a **second pane** — never
   more width.
4. Changing `numColumns` on a `FlatList` requires changing its `key` in the same render. `FlashList`
   does not, and takes neither `columnWrapperStyle` nor `estimatedItemSize` — §3.
5. Fix an image's `aspectRatio`, never its pixel height. Cap text with `numberOfLines`.
6. Content fills its pane and stays left-aligned. A form is a two-column field grid on a wide pane
   and one column on a narrow one. Only running prose gets a maximum measure, and it is left-aligned
   too — never `alignSelf: 'center'`.
7. Never use `Card.Cover` in a grid — it hardcodes `height: 195`. Never render `Dialog` without an
   explicit `maxWidth` — it has none of its own.
8. Exactly one width threshold, `WIDE_MIN`, measured with `onLayout` on the merchant shell's root
   container. It picks between the five pairs in §9 and nothing else. No `isTablet`, no device
   checks, no second breakpoint, no separate tablet screens.
9. Space with `gap` between siblings and `padding` inside a container, never margins between
   siblings. Every value is a step on the 4-point scale in §11.
10. Anything this file does not rule on — list performance, images, safe areas, keyboard, scroll
    insets — follows the React Native and Expo skills. Where a skill contradicts a rule here, this
    file wins. §12.

The rest of this file is why. Read it before overriding a rule, not before following one.

**Contents**

1. [The one rule](#1-the-one-rule)
2. [Two kinds of card, opposite answers](#2-two-kinds-of-card-opposite-answers)
3. [Computing columns](#3-computing-columns)
4. [Measure the container, never the window](#4-measure-the-container-never-the-window)
5. [Never fix a card's height](#5-never-fix-a-cards-height)
6. [Paper components that need handling](#6-paper-components-that-need-handling)
7. [Images](#7-images)
8. [What changes on a tablet](#8-what-changes-on-a-tablet)
9. [One threshold, five pairs](#9-one-threshold-five-pairs)
10. [What is deliberately not here](#10-what-is-deliberately-not-here)
11. [Spacing](#11-spacing)
12. [Skills, and where this file overrides them](#12-skills-and-where-this-file-overrides-them)

---

## 1. The one rule

**On a bigger screen, show more things. Do not grow the things.**

A card's width is not a value you set. You set its *minimum* width and let the container work out how
many fit:

```
columns = floor(availableWidth / minCardWidth)
```

A phone gets two, a small tablet three or four, a large tablet five or six — with no threshold, no
device check, and no `isTablet` anywhere in the codebase. It also survives split-screen and Stage
Manager, which a screen-width breakpoint does not (§4).

Column count is the case that needs no constant at all. Switching one anatomy for another — a drawer
for a rail, a card list for a table — cannot be derived from a width the same way, and gets exactly
one named threshold instead (§9).

The corollary, and the reason this file exists next to `typography.md`: growing a card on a tablet has
the same failure as growing type on a tablet. Reading distance did not change. Available room did.

---

## 2. Two kinds of card, opposite answers

Treating these the same is the most common mistake in this layout.

| Kind | Example | On a tablet |
| --- | --- | --- |
| **Grid card** | product tile, item with a photo | **more columns** |
| **Row card** | order line, stock entry, log row | **a second pane — never a wider row** |

A row card stretched across 1000dp is unreadable for exactly the measure reason a 110-character line
is. When a list of rows gets a tablet, it becomes **list on the left, detail on the right**, not
fatter rows. The Register mockup is this rule drawn out: the item pane, the cart and the payment
block sit side by side on a tablet rather than one wide list.

With `expo-router` that is: render both panes when the container is wide, push a route when it is
narrow. Same screens, same route table — the wide branch renders the detail component directly
instead of navigating to it.

That single decision delivers more tablet value than any amount of card resizing.

---

## 3. Computing columns

```tsx
const MIN_CARD = 180 // ponytail: one number, tune it on a real tablet

function useColumns(minWidth = MIN_CARD) {
  const [width, setWidth] = useState(0)
  return {
    columns: Math.max(1, Math.floor(width / minWidth)),
    onLayout: (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width),
  }
}
```

General list performance — virtualizing, memoized items, stable callbacks, item types, images in
rows — is not restated here. It is `vercel-react-native-skills` (`list-performance-*`) and the
Callstack `react-native-best-practices` skill (`js-lists-flatlist-flashlist`). What follows is only
what those do not say, or say wrong for the versions installed here.

With `FlatList`: `numColumns={columns}` **and `key={columns}`** (rule 4 — React Native throws
otherwise), `columnWrapperStyle={{ gap }}`, and a partial last row stretches unless the item takes
`flexBasis: \`${100 / columns}%\`` instead of `flex: 1`.

### With `FlashList`, which is what the merchants grid uses

`@shopify/flash-list` 2.x is a different layout system, not a drop-in with the same props. Verified
against `node_modules/@shopify/flash-list/src/FlashListProps.ts`:

- **There is no `columnWrapperStyle` and no `estimatedItemSize`.** Both were dropped in v2. The prop
  list is `Omit<ScrollViewProps, 'maintainVisibleContentPosition'>` plus its own, so
  `contentContainerStyle` survives but the FlatList-only props do not.
- **Cells are positioned absolutely**, at a width FlashList computes from `numColumns`. A flex `gap`
  therefore reaches nothing between them. Carry the gutter on the cell instead — half of it each
  side, so two neighbours meet at the full value, and take the same half off the container's padding
  so the outer edge is unchanged. `src/app/(app)/(tabs)/index.tsx` names that half `GUTTER`.
- **A partial last row does not stretch**, so the blank-padding fix above is not needed and should
  not be carried over. Deleting it is the point of the swap, not a side effect.
- `key={columns}` stays, but as insurance rather than a requirement — FlashList recomputes on a
  `numColumns` change on its own, and the key only changes when the container crosses a column
  boundary, which is already a full relayout.
- It is **pure JavaScript** in 2.x (no `codegenConfig`, no `android/`), so adding it needs no
  native rebuild.

**Reach for it on length, not by default.** FlatList is correct for a list whose row count is
bounded by something small; FlashList earns its place when a list can grow past roughly the screen
count several times over.

### The simpler version, when it is enough

Fixed-width cards in a wrapping row give an adaptive column count for free:

```tsx
<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
  {items.map(i => <ProductCard key={i.id} style={{ width: 180 }} />)}
</View>
```

The cost is a ragged right edge, since cards do not stretch to fill. For an internal admin screen
that is acceptable — take it, and move to `useColumns` only when the leftover gutter actually looks
wrong on a device.

---

## 4. Measure the container, never the window

**Do not use `useWindowDimensions()` to make layout decisions.** iPadOS Stage Manager and Android
split-screen hand the app a fraction of the screen, and window dimensions do not describe the width
the list actually received. A layout keyed on them is wrong in every multi-window case.

`onLayout` on the container is correct in all of them, including rotation and live resize.

**Never call `Dimensions.get()` at module scope.** It is a snapshot taken at import time that never
updates — not on rotation, not on resize, not on fold.

`useWindowDimensions()` remains fine for things that genuinely concern the window, such as sizing a
full-screen overlay.

---

## 5. Never fix a card's height

This is where layout and typography collide. Type does not scale with the viewport, but it **does**
scale with the OS accessibility setting, `lineHeight` included (`typography.md` §4). Any hardcoded
card height breaks at 150% text.

Fix the parts that are safe and let the rest absorb the difference:

| Part | Rule |
| --- | --- |
| **Image** | Fix the *ratio*, not the pixels — `aspectRatio: 1` (or 4/3) on the wrapper. It then scales with the card at every column count |
| **Text** | Cap the lines — `numberOfLines={2}` on a name, `1` on a SKU |
| **Card** | No `height`. Let it grow. Inside a `FlatList` row, siblings stretch to the tallest, so rows stay even |
| **Font scale** | `maxFontSizeMultiplier={1.3}` on grid-card text only |

That last one matters: without a cap, a 200% accessibility setting turns a four-column grid into one
card per screen. Cap what is scanned, never what is read — detail views, forms and dialogs stay
uncapped. Same division as `typography.md` §5.

Controls are not cards. A quantity stepper's buttons, a toggle, a thumbnail in a table row and the
44dp touch target can have fixed sizes; they hold one glyph or one image, not text that grows.

---

## 6. Paper components that need handling

Verified against `react-native-paper@5.15.3`.

**`Card.Cover` hardcodes `height: 195`** (`Card/CardCover.js:61`). It is a fixed pixel height, so it
does not scale with the card and defeats §5. Do not use it in a grid — use `expo-image` inside a
`View` with `aspectRatio` instead. It remains fine in a single-column detail view where 195 is the
intended height.

**`Card.Content` already pads 16 on every side** (`Card/CardContent.js:71-80`). Do not nest your own
padding inside it; you will get 32.

**`Dialog` has no maximum width.** Its container is `marginHorizontal: Math.max(left, right, 26)`
(`Dialog/Dialog.js:95`) — safe-area aware, but on a 1000dp tablet a confirmation dialog spans ~950dp.
Always pass `style={{ maxWidth: 560, alignSelf: 'center' }}`. A dialog is a floating surface, so
centring it on the screen is not the content centring rule 6 forbids.

**`Card` is a `Surface`, and `patches/react-native-paper+5.15.3.patch` exists because of it** — the
patch adds `flexGrow` to the iOS `Surface` flex computation, without which a card in a flex row would
not stretch. Prefer `flex: 1` over `flexGrow` on card items; it is the path Paper handles natively.
Keep the patch.

**Card mode in a dense grid.** `mode="outlined"` or `"filled"` reads better than the default
elevated; five columns of drop shadows turn into mud.

**Buttons inside a dense card.** Use `compact` and drop to an `IconButton` once the grid is at three
or more columns — a labelled "Add to order" button is fine at 180dp and is noise at 5 columns. Touch
targets stay at a 44dp minimum regardless of density.

**`DataTable` is a tablet component.** A table with more than three columns does not work on a phone.
The responsive move is: `List.Item` or cards on a narrow container, `DataTable` on a wide one — the
same data, two presentations. For the Merchant screens that choice is one of §9's pairs, not a
per-screen measurement.

**`List.Item` sits outside the theme** — it reads a raw `fontSize` from its own stylesheet rather
than a variant (`typography.md` §3). Restyle through `titleStyle` / `descriptionStyle` if it drifts
from the scale.

---

## 7. Images

Use `expo-image`, per `vercel-react-native-skills` `ui-expo-image` and `list-performance-images`,
which cover placeholders, caching and list rows. The one addition here: `contentFit="cover"` inside a
`View` with `aspectRatio`, never a fixed pixel height (§5).

**Request the size you will display.** Downloading a 3000px product photo to render it at 180dp is
the largest single performance mistake available in a card grid. Supabase Storage transforms on read:

```ts
supabase.storage.from('products').getPublicUrl(path, {
  transform: { width: 360, height: 360, resize: 'cover' },
})
```

Two conditions on that:

- **Image Transformations require the Pro plan or above.** On the free tier, generate a thumbnail at
  upload time and store both paths — same result, paid once on write instead of on every read.
- **Bucket the requested width** — 180 / 360 / 720, not the exact computed card width. A unique URL
  per device width defeats the CDN cache entirely.

Store the storage *path* in Postgres, never a URL. Signed URLs expire, and transform options are
baked into a signed token and cannot be changed afterwards.

---

## 8. What changes on a tablet

| Changes | Stays fixed |
| --- | --- |
| Which anatomy renders (§9) | Type scale — always a Paper variant |
| Column count | Corner radius (theme `roundness`), border width, elevation |
| Gutters and padding (two steps, not a ramp) | Icon sizes |
| List becomes list-detail | Touch target minimums (44dp) |
| Visible table columns | Image aspect ratios |
| Form field grid: two columns or one | Alignment — left, everywhere |

**Nothing is centred.** A form, a detail pane or a settings list fills its pane from the left edge.
Only running prose — a description, a paragraph of help — gets a maximum measure, `maxWidth: 640` on
its container with no `alignSelf`, so a paragraph still does not run 110 characters across an iPad.

---

## 9. One threshold, five pairs

The Merchant mockups draw every screen twice, and the two drawings are different anatomies, not the
same anatomy at two widths:

| Narrow | Wide | Where |
| --- | --- | --- |
| Drawer, off-canvas behind the menu button | Rail, permanent, collapsible to icons | the shell |
| Card list | `DataTable` with bulk select | Products and Discounts lists |
| Stepper: "Step n of N", Next, a progress bar | Section list beside the field grid | Products and Discounts forms |
| Items / Cart tabs, a Charge bar, payment in a bottom sheet | Items pane, cart and payment side by side | Register |
| Native `formSheet` | Paper `Dialog` | confirms and pickers |

Five pairs is five places a width decision is made, and they must all agree. A drawer beside a
`DataTable`, or a rail over a stepper, is a state no mockup draws.

So the decision is made once, on the shell's root container, and handed to the screens under it. It
is not recomputed by each screen from its own pane: a screen's pane is narrower than the shell by the
rail's width, so a per-screen measurement flips at a different point from the shell's.

The shell layout is an expo-router `Drawer` with `drawerType: 'permanent'` when wide and `'front'`
when narrow. The vendored navigator accepts both
(`expo-router/build/react-navigation/drawer/types.d.ts:117`).

The constants, beside `useColumns` in `src/lib/columns.ts`:

```ts
// ponytail: M3's "expanded" window class. Tune it on a real tablet.
export const WIDE_MIN = 840;

export const RAIL_EXPANDED = 116;  // icons + labels
export const RAIL_COLLAPSED = 72;  // icons only, after the menu button
export const DRAWER_WIDTH = 300;   // the narrow shell's off-canvas drawer
export const SECTION_LIST = 210;   // a form's section list, wide only
export const ITEM_PANE = 430;      // the register's items, wide only
```

`WIDE_MIN`, the two rail widths and `DRAWER_WIDTH` are in the file today, used by the shell, and
`SECTION_LIST`, used by the Products form. `ITEM_PANE` gets added with its first consumer, Register.

The decision reaches the screens through `ShellWideContext`, provided by the shell layout and read
with `useShellWide()` — also in `src/lib/columns.ts`. A context rather than a prop because the
screens are routes: the shell renders them through the navigator and has no props to pass.

840 is roughly where the wide Register fits: 116 of rail, 430 of items, and a cart still wide enough
for a line with its stepper and total. Portrait tablets below it — most iPads at 768–834 — get the
narrow anatomy. That is a deliberate trade, and the constant is the knob if a real counter tablet
says otherwise.

### Why a constant is allowed here when §1 refuses one

§1's refusal is about grids, where the column count follows from the width with no named number at
all. An anatomy switch does not follow from anything; something has to name the point where a drawer
becomes a rail. The rule keeps what made the refusal right: it is measured from a container, never
the window or the device, and it is one number, not a ramp.

### Rejected

- **`useColumns` in every screen.** It measures each screen's own pane, so the shell and the screen
  under it can disagree at the same width.
- **`useWindowDimensions`.** Wrong under split-screen and Stage Manager, for the reasons in §4.
- **A second threshold** for a middle layout. No mockup draws one.

---

## 10. What is deliberately not here

**No `isTablet` and no device classes.** A device class is a worse proxy for available space than the
space itself, and it is wrong the moment the app is not full-screen. The one threshold in §9 is a
measured width, not a device.

**No second threshold.** §9.

**No separate tablet screens.** One screen, one route, a branch on the shell's measured width where
the layout genuinely differs. Two copies of a screen drift within a month.

**No centred content column.** The earlier `maxWidth: 640, alignSelf: 'center'` clamp was right for
stock MD3. The Merchant mockups fill their panes and align everything left, and a centred form beside
a left-aligned table reads as two different products. Prose keeps the measure without the centring
(§8).

**No `react-responsive` or equivalent.** It is a media-query library for the web. `onLayout` is the
native answer and it needs no dependency.

**No fixed card heights, anywhere.** §5.

---

## 11. Spacing

The mockups pad with 7, 8, 9, 10, 11 and 12px, rounded independently per frame. Built literally,
every screen carries its own numbers and two screens never line up. Until 2026-09-17 nothing in these
docs ruled on spacing at all, which is where most of the small misalignments came from.

**One scale, a 4-point grid** — the `expo-design-system` skill's scale, with its two common
in-between steps named rather than scattered:

| Step | xs | sm | — | md | — | lg | xl | xxl |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Value | 4 | 8 | 12 | 16 | 20 | 24 | 32 | 48 |

- **`gap` between siblings, `padding` within a container** (rule 9). No `marginBottom` on children
  for rhythm. `vercel-react-native-skills` `ui-styling` and `expo-native-ui` say the same.
- **Pick the nearest step** when a mockup draws a value between two. The grid is the point.
- **Screen edge padding is one step, the same on every screen.** A narrow container and a wide one
  may differ by one step (§8, "two steps, not a ramp").
- **Pad a `ScrollView` through `contentContainerStyle`**, not the `ScrollView` itself, so the edge
  content is not clipped.
- Fixed-size controls (§5 — a stepper button, a 44dp target) are sizes, not spacing, and are not
  bound to the scale.

**Not yet in code.** The steps become a `spacing` key in both themes in `src/themes.js`, read through
`useAppTheme()`, in the next coding pass (System-History 12.1 backlog). Until then new code writes the
step values; existing screens are not reworked piecemeal.

### Rejected: spacing by density per screen

Letting each screen pick a dense or roomy spacing keeps the mockups' look screen by screen, and
brings back exactly the per-frame drift this section exists to stop.

---

## 12. Skills, and where this file overrides them

The React Native and Expo skills (`vercel-react-native-skills`, `expo-native-ui`, `expo-design-system`,
Callstack `react-native-best-practices`) own everything this file does not rule on (rule 10). Where
one of them contradicts a rule above, this file wins. The standing cases:

| Skill says | This file |
| --- | --- |
| `expo-native-ui`: prefer `useWindowDimensions` for sizing | Rule 2, §4: the container's `onLayout`, never the window, for any layout decision |
| `expo-native-ui`: `ScrollView contentInsetAdjustmentBehavior="automatic"` instead of safe-area views | Applies only under a native header. Every navigator here sets `headerShown: false` and draws Paper's `Appbar.Header`, which applies the top inset itself (`src/app/(app)/_layout.tsx`, `systems/[id]/_layout.tsx`). Revisit for `(tabs)` once it moves to `NativeTabs` ([`visual-language.md` §5](./visual-language.md#5-mockup-patterns-built-with-paper)) |

Every row is also in [`false-positives.md` §8](./false-positives.md#8-skills--rules-this-repo-overrides),
so a skill review that raises one costs a line, not an investigation.
