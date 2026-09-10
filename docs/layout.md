# Layout and responsiveness rules

Phones and tablets, iOS and Android. No web. Sits alongside
[`typography.md`](./typography.md) — the two interlock, because the reason text never scales
on a breakpoint is the same reason a card never gets wider on one.

## Rules

1. Never set a card's width or height. Set a minimum width and derive the column count.
2. Derive that count from the **container's** measured width via `onLayout`. Never make a layout
   decision from `useWindowDimensions()`, and never call `Dimensions.get()` at module scope.
3. On a wider container, grid cards get **more columns**. Row cards get a **second pane** — never
   more width.
4. Changing `numColumns` on a `FlatList` requires changing its `key` in the same render. `FlashList`
   does not, and takes neither `columnWrapperStyle` nor `estimatedItemSize` — §3.
5. Fix an image's `aspectRatio`, never its pixel height. Cap text with `numberOfLines`.
6. Give single-column content `maxWidth: 640, alignSelf: 'center'`.
7. Never use `Card.Cover` in a grid — it hardcodes `height: 195`. Never render `Dialog` without an
   explicit `maxWidth` — it has none of its own.
8. No `isTablet`, no breakpoint constants, no separate tablet screens.

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
9. [What is deliberately not here](#9-what-is-deliberately-not-here)

---

## 1. The one rule

**On a bigger screen, show more things. Do not grow the things.**

A card's width is not a value you set. You set its *minimum* width and let the container work out how
many fit:

```
columns = floor(availableWidth / minCardWidth)
```

A phone gets two, a small tablet three or four, a large tablet five or six — with no breakpoint
constant, no device check, and no `isTablet` anywhere in the codebase. It also survives split-screen
and Stage Manager, which a screen-width breakpoint does not (§4).

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
fatter rows.

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

With `FlatList`:

- `numColumns={columns}` **and `key={columns}`**. React Native throws on a `numColumns` change
  without a key change forcing a remount — this is not optional.
- Item style `flex: 1`, `columnWrapperStyle={{ gap: 12 }}`. `gap` is native in React Native 0.86; no
  margin arithmetic.
- **A final row with fewer items will stretch them across the full width.** Either pad the data with
  blank placeholders, or give the item `flexBasis: \`${100 / columns}%\`` instead of `flex: 1`.

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
Always pass `style={{ maxWidth: 560, alignSelf: 'center' }}`.

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
same data, two presentations, chosen by measured width.

**`List.Item` sits outside the theme** — it reads a raw `fontSize` from its own stylesheet rather
than a variant (`typography.md` §3). Restyle through `titleStyle` / `descriptionStyle` if it drifts
from the scale.

---

## 7. Images

`expo-image` is already a dependency and this is where it earns its place.

- `contentFit="cover"` inside a `View` with `aspectRatio` — never a fixed pixel height.
- Set a `placeholder` so the grid does not jump as images resolve.
- Its disk cache is what makes scrolling a catalog twice cheap.

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
| Column count | Type scale — always a Paper variant |
| Gutters and padding (two steps, not a ramp) | Corner radius, border width, elevation |
| List becomes list-detail | Icon sizes |
| Visible table columns | Touch target minimums (44dp) |
| Actions inline vs. in a menu | Image aspect ratios |

And one clamp that applies on every screen size: **single-column content gets a maximum measure.** A
form, a detail pane, a settings list — `maxWidth: 640, alignSelf: 'center'`. Without it a text field
spans the full width of an iPad and reads as broken.

---

## 9. What is deliberately not here

**No breakpoint constants and no `isTablet`.** Column count is derived from measured width. A device
class is a worse proxy for available space than the space itself, and it is wrong the moment the app
is not full-screen.

**No separate tablet screens.** One screen, one route, a branch on measured width where the layout
genuinely differs. Two copies of a screen drift within a month.

**No `react-responsive` or equivalent.** It is a media-query library for the web. `onLayout` is the
native answer and it needs no dependency.

**No fixed card heights, anywhere.** §5.
