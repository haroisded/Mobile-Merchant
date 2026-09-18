# Layout and responsiveness

Phones and tablets, iOS and Android. No web. Pairs with [`typography.md`](./typography.md); what a
screen looks like is [`visual-language.md`](./visual-language.md).

## Rules

1. Never set a card's width or height. Set a minimum width and derive the column count.
2. Derive that count from the **container's** measured width via `onLayout`. Never from
   `useWindowDimensions()`; never call `Dimensions.get()` at module scope.
3. On a wider container, grid cards get **more columns**; row cards get a **second pane**, never
   more width.
4. Exactly one width threshold, `WIDE_MIN`, measured on the merchant shell's root container. No
   `isTablet`, no device checks, no second breakpoint, no separate tablet screens.
5. Fix an image's `aspectRatio`, never its pixel height. Cap text with `numberOfLines`.
6. Content fills its pane, left-aligned. Only running prose gets a maximum measure — `maxWidth: 640`
   with no `alignSelf`.
7. Never use `Card.Cover` in a grid. Never render `Dialog` without an explicit `maxWidth`.
8. Space with `gap` between siblings and `padding` inside a container, never margins between
   siblings. Every value is a step on the 4-point scale (§6).
9. Changing `numColumns` on a `FlatList` requires changing its `key` in the same render.
10. Anything not ruled on here follows the React Native and Expo skills. Where a skill contradicts
    this file, this file wins.

---

## 1. Columns

```
columns = floor(availableWidth / minCardWidth)
```

```tsx
const MIN_CARD = 180

function useColumns(minWidth = MIN_CARD) {
  const [width, setWidth] = useState(0)
  return {
    columns: Math.max(1, Math.floor(width / minWidth)),
    onLayout: (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width),
  }
}
```

A phone gets two, a small tablet three or four, a large tablet five or six — no threshold, no device
check. It also survives split-screen and Stage Manager, which a screen-width breakpoint does not.

**With `FlatList`:** `numColumns={columns}` **and `key={columns}`** (React Native throws otherwise),
`columnWrapperStyle={{ gap }}`, and items take `flexBasis: \`${100 / columns}%\`` rather than
`flex: 1` so a partial last row does not stretch.

**With `FlashList` 2.x** (what the merchants grid uses):

- No `columnWrapperStyle`, no `estimatedItemSize` — both dropped in v2. `contentContainerStyle`
  survives.
- Cells are positioned absolutely, so a flex `gap` reaches nothing between them. Carry the gutter on
  the cell — half each side — and take the same half off the container padding.
- A partial last row does not stretch; no blank-padding fix needed.
- `key={columns}` stays as insurance only.
- Pure JavaScript in 2.x — adding it needs no native rebuild.

**Reach for FlashList on length**, not by default. FlatList is correct for a list bounded by
something small.

## 2. Two kinds of card

| Kind | Example | On a wide container |
| --- | --- | --- |
| **Grid card** | product tile, item with a photo | more columns |
| **Row card** | order line, stock entry, log row | a second pane — never a wider row |

A list of rows on a tablet becomes **list left, detail right**. With expo-router: render both panes
when the container is wide, push a route when it is narrow. Same screens, same route table.

## 3. Never fix a card's height

Type scales with the OS accessibility setting, `lineHeight` included. Any hardcoded card height
breaks at 150% text.

| Part | Rule |
| --- | --- |
| Image | Fix the ratio — `aspectRatio: 1` or `4/3` on the wrapper |
| Text | `numberOfLines={2}` on a name, `1` on a SKU |
| Card | No `height`. Siblings in a row stretch to the tallest |
| Font scale | `maxFontSizeMultiplier={1.3}` on grid-card text only |

Controls are not cards — a stepper button, a toggle, a thumbnail, a 44dp touch target may have fixed
sizes.

## 4. Paper components that need handling

Verified against `react-native-paper@5.15.3`.

- **`Card.Cover` hardcodes `height: 195`.** Use `expo-image` inside a `View` with `aspectRatio` in a
  grid. Fine in a single-column detail view.
- **`Card.Content` already pads 16 on every side.** Do not nest your own padding inside it.
- **`Dialog` has no maximum width.** Always pass `style={{ maxWidth: 560, alignSelf: 'center' }}`.
  A dialog is a floating surface, so centring it is allowed.
- **`Card` is a `Surface`** — keep `patches/react-native-paper+5.15.3.patch`, which adds `flexGrow`
  to the iOS `Surface` flex computation. Prefer `flex: 1` over `flexGrow` on card items.
- **Card mode in a dense grid:** `mode="outlined"` or `"filled"`, not elevated.
- **Buttons in a dense card:** `compact`, dropping to `IconButton` at three or more columns. Touch
  targets stay 44dp minimum.
- **`DataTable` is a tablet component.** `List.Item` or cards narrow, `DataTable` wide.
- **`List.Item` sits outside the theme** — restyle through `titleStyle` / `descriptionStyle`.

## 5. One threshold, five pairs

The two mockup frames are different anatomies, not one anatomy at two widths:

| Narrow | Wide | Where |
| --- | --- | --- |
| Drawer, off-canvas | Rail, permanent, collapsible to icons | the shell |
| Card list | `DataTable` with bulk select | Products, Discounts lists |
| Stepper: "Step n of N", Next, progress bar | Section list beside the field grid | Products, Discounts forms |
| Items / Cart tabs, Charge bar, payment sheet | Items pane, cart and payment side by side | Register |
| Native `formSheet` | Paper `Dialog` | confirms and pickers |

All five must agree, so the decision is made **once** on the shell's root container and handed down.
A screen's own pane is narrower than the shell by the rail's width and would flip at a different
point.

The shell is an expo-router `Drawer` with `drawerType: 'permanent'` when wide and `'front'` when
narrow.

Constants, in `src/lib/columns.ts`:

```ts
export const WIDE_MIN = 840;

export const RAIL_EXPANDED = 116;  // icons + labels
export const RAIL_COLLAPSED = 72;  // icons only
export const DRAWER_WIDTH = 300;   // narrow shell's off-canvas drawer
export const SECTION_LIST = 210;   // a form's section list, wide only
export const ITEM_PANE = 430;      // register's items, wide only
```

840 is where the wide Register fits: 116 rail + 430 items + a usable cart. Portrait tablets below it
get the narrow anatomy.

The decision reaches screens through `ShellWideContext`, read with `useShellWide()`, also in
`src/lib/columns.ts`. A context, not a prop — screens are routes rendered by the navigator.

## 6. Spacing

One 4-point scale, exported as `spacing` from `src/themes.js` and carried on both themes:

| Step | xs | sm | ms | md | ml | lg | xl | xxl |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Value | 4 | 8 | 12 | 16 | 20 | 24 | 32 | 48 |

- `gap` between siblings, `padding` within a container. No `marginBottom` for rhythm.
- Pick the nearest step when a mockup draws a value between two.
- Screen edge padding is one step, the same on every screen. Narrow and wide may differ by one step.
- Pad a `ScrollView` through `contentContainerStyle`, not the `ScrollView` itself.
- A surviving negative margin cancels a Paper component's built-in inset, never sibling rhythm, and
  says so in a comment.
- Fixed-size controls are sizes, not spacing, and are not bound to the scale.

## 7. Images

Use `expo-image` with `contentFit="cover"` inside a `View` with `aspectRatio`.

**Request the size you will display.** Supabase Storage transforms on read:

```ts
supabase.storage.from('products').getPublicUrl(path, {
  transform: { width: 360, height: 360, resize: 'cover' },
})
```

- Image Transformations need the Pro plan. On free tier, generate a thumbnail at upload and store
  both paths.
- **Bucket the requested width** — 180 / 360 / 720, not the exact card width, or the CDN cache is
  defeated.
- Store the storage *path* in Postgres, never a URL. Signed URLs expire and bake transform options
  into the token.

## 8. What changes on a wide container

| Changes | Stays fixed |
| --- | --- |
| Which anatomy renders (§5) | Type scale |
| Column count | Corner radius, border width, elevation |
| Gutters and padding (one step) | Icon sizes |
| List becomes list-detail | Touch target minimums (44dp) |
| Visible table columns | Image aspect ratios |
| Form field grid: two columns or one | Alignment — left, everywhere |

## 9. Skill overrides

| Skill says | This file |
| --- | --- |
| `expo-native-ui`: prefer `useWindowDimensions` for sizing | The container's `onLayout` (rule 2) |
| `expo-native-ui`: `contentInsetAdjustmentBehavior="automatic"` instead of safe-area views | Applies only under a native header. Every navigator here sets `headerShown: false` and draws `Appbar.Header`, which applies the top inset itself. `NativeTabs` applies its own bottom inset on Android. Native sheets pad actions with `useSafeAreaInsets` |

## 10. Not used here

No `isTablet` or device classes. No second threshold. No separate tablet screens. No centred content
column. No `react-responsive`. No fixed card heights.
