# Home Page — history

Built against `Interactives ( Priority ).md` as the filter: only ✅ interactions are wired. The
unticked controls still render, so the screens match the mockups.

## Components and Interactives Added

### version 1

- **Top App Bar** — `Appbar.Header` + `Appbar.Content title="Merchant"`. Narrow: avatar + search
  icon. Wide: avatar + bell + account action. The account action ✅ and the avatar both open the
  Account tab.
- **Create New System** — a filled `Button` on a 1-column container, a tappable Action `Card` on 2+.
  Both open CreateSystemModal. Treated as implied by "CreateSystemModal ✅ ALL" — a modal with no
  trigger is dead code.
- **SystemCard** (`src/features/merchants/SystemCard.tsx`) — row anatomy at 1 column (leading
  category avatar + title + actions), grid anatomy at 2+ (square category tile + title + actions).
  Whole-card press → `/systems/[id]` ✅.
- **Navigation Bar** — Paper `BottomNavigation.Bar` supplied as a custom `tabBar` to
  `expo-router/js-tabs` Tabs. Home ✅ and Account ✅ wired. Hides itself on a wide container, per the
  M3 tablet layout.
- **CreateSystemModal** (`src/features/merchants/CreateSystemModal.tsx`) — ALL interactives wired ✅:
  back, Next (step 1), Next (step 2), the 10 SelectableCards, Continue, every TextInput. Three
  sequential steps on a narrow container, one scrolling form on a wide one, sharing one Zod schema
  and one react-hook-form instance. Creating a system writes `profiles.display_name` and inserts the
  merchant, then invalidates both queries so the grid refreshes with no manual reload.
- **ProfileDialog** — shipped as the Account tab screen (`(tabs)/account.tsx`) rather than a Dialog,
  because it is a navigation destination and not a layer over something else. Back arrow ✅,
  Go Back ✅, Sign Out ✅. Sign-out and delete-account carried over unchanged from the previous
  `(app)/index.tsx`, which this screen replaces.
- **Data layer** — `public.merchants` + RLS + `private.current_merchant_ids()`
  (`supabase/migrations/20260908131200_merchants.sql`); `src/lib/database.types.ts`;
  `src/lib/query.ts` (QueryClient defaults, `STALE`, `onlineManager`/`focusManager`);
  `src/lib/columns.ts`; `src/features/merchants/{schema,queries}.ts`;
  `src/features/profiles/queries.ts`. The Supabase client is now typed `createClient<Database>`.

## Where the code lives

There is no `features/home/` folder. A page maps onto however many **resource** folders it touches,
plus its route files — `docs/structure.md` §3. This section is the page → code index that a page
folder would otherwise have been; keep it current when files move.

**Not versioned.** Unlike the log sections above and below, this table describes the page as it is
now. A later pass edits it in place — a path stranded under an old version heading would fail
`npm run check:history` the moment that file moves.

| Piece of this page | File |
| --- | --- |
| Home screen (app bar, header, card grid, create trigger) | `src/app/(app)/(tabs)/index.tsx` |
| Account screen / ProfileDialog | `src/app/(app)/(tabs)/account.tsx` |
| Notifications, Settings stubs | `src/app/(app)/(tabs)/{notifications,settings}.tsx` |
| Navigation Bar (Paper bar as a custom `tabBar`) | `src/app/(app)/(tabs)/_layout.tsx` |
| SystemCard tap destination | `src/app/(app)/systems/[id].tsx` |
| SystemCard | `src/features/merchants/SystemCard.tsx` |
| CreateSystemModal + SelectableCard | `src/features/merchants/CreateSystemModal.tsx` |
| Merchant reads/writes, query keys | `src/features/merchants/queries.ts` |
| Form schema, category enum, `CATEGORY_META` | `src/features/merchants/schema.ts` |
| Profile read (display name, email) | `src/features/profiles/queries.ts` |
| Column count from measured width | `src/lib/columns.ts` |
| QueryClient, `STALE`, online/focus wiring | `src/lib/query.ts` |
| Generated schema types | `src/lib/database.types.ts` |
| `merchants` table, RLS, `current_merchant_ids()` | `supabase/migrations/20260908131200_merchants.sql` |

Two of these are already shared beyond this page, which is why they are keyed on the resource and
not on Home-Page: `features/profiles/queries` is imported by both the Account screen and
`CreateSystemModal`, and `features/merchants` is imported by `systems/[id].tsx`, which belongs to the
Systems Page.

## Interactives not yet Added

### version 1

Rendered, with no `onPress` — they are visible but do nothing:

- Top App Bar — Search IconButton (narrow)
- Top App Bar — Notification Appbar.Action (wide)
- SystemCard — Edit Button
- SystemCard — Remove Button
- ProfileDialog — Camera FAB
- ProfileDialog — List Item: Account Information
- ProfileDialog — List Item: Your Businesses
- ProfileDialog — List Item: Manage Devices
- ProfileDialog — List Item: Privacy Policy
- ProfileDialog — List Item: Terms of Service
- ProfileDialog — List Item: Appearance (Switch, no `onValueChange`)

Not built, and why:

- **No images anywhere.** A category icon on a `surfaceVariant` tile at `aspectRatio: 1` stands in
  for the photo the mockup shows. No Storage bucket, no image picker, no image column. `Card.Cover`
  is not used regardless — it hardcodes `height: 195`, which `docs/layout.md` rule 7 forbids in a
  grid.
- **`/systems/[id]` is a placeholder.** It exists so the ✅ whole-card tap has a real destination.
  The Systems Page proper is its own page.
- **Notifications and Settings are stub screens.** Both destinations are unticked, but a
  `BottomNavigation.Bar` cannot render a tab that switches to nothing, so they navigate to
  placeholders rather than sitting dead in the bar.
- **On a wide container the nav bar is hidden**, per the M3 tablet layout, so Notifications and
  Settings are unreachable there. The Appbar carries bell (inert) and account (✅).
- **`private.current_merchant_ids()` ships with no caller.** It is the seam the first real business
  table's policies will use; writing it now is what stops that table shipping an
  `auth.uid() = owner_id` policy that then has to be rewritten (`docs/tenancy.md` §2).

## Deviations from the M3 analysis

Resolved in favour of the project rules, which are authoritative:

| Analysis said | Shipped | Why |
| --- | --- | --- |
| `Card.Cover` on SystemCard | `aspectRatio: 1` tile + `Icon` | `Card.Cover` hardcodes height 195 (`Card/CardCover.js:61`); `docs/layout.md` rule 7 |
| `surfaceContainer` / `Low` / `High` | No colour prop passed | Those roles do not exist in react-native-paper 5.15.3. Paper's own defaults already resolve to the intended layers: `Card mode="contained"` → `surfaceVariant`, `BottomNavigation.Bar` → `elevation.level2` with a `secondaryContainer` indicator, `Dialog` → `elevation.level3` |
| Appbar background `primary` / content `onPrimary` | Paper's default | Hand-picking a colour with no reason to; `docs/typography.md` rule 5 also forbids passing `variant` to `Appbar.Content` |
| Profile list titles "use `bodyMedium`" | Paper's default | `List.Item` reads a raw fontSize outside the theme and takes no `variant` (`docs/typography.md` §3). Restyle via `titleStyle` only if it visibly drifts |
| Tablet Profile is a centred `Dialog` | A tab screen with `maxWidth: 640` | It is a destination, not a layer. The one surviving `Dialog` (delete-account) got `maxWidth: 560` since `Dialog` has no maximum of its own |

One note for the modal, found while building: Paper's `Modal` styles only the backdrop
(`Modal.js:144`) and leaves its content `transparent` (`:175`) — unlike `Dialog`, it does not give
you a surface. `contentContainerStyle` sets `elevation.level3` explicitly so the two read as the
same layer.

## Status

**Not versioned** — one current value, replaced in place by each pass.

**In-Complete** (version 1) — every priority interaction is wired, and their markers in
`Interactives ( Priority ).md` are now 🏁. The 11 controls listed above render inert by design,
waiting for the filter to promote them.

**Verified on a phone (narrow, `columns === 1`)** — run on the Medium_Phone AVD, plus typecheck,
lint and a full Metro bundle of the whole route tree.

**The wide branch (`columns > 1`) has never rendered on a device.** The Pixel Tablet AVD boots with
no default route in its routing table, so it can reach neither Metro nor Supabase — an emulator
fault, not an app one, and that AVD has a history of it. Everything below is written and compiles
but is unexercised, so treat it as the first thing to check on the next working tablet:

- the bottom navigation bar hiding itself
- the 2-column card grid, and the blank-padding that stops a partial last row stretching
- SystemCard's grid anatomy (square category tile) rather than its row anatomy
- the Action Card create trigger, in place of the filled button
- CreateSystemModal as one scrolling form rather than three steps
- Account Appbar.Action 🏁 and the Go Back button 🏁, which exist only on this branch
