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

### version 2 — CreateSystemModal revamp (`revamps/Thu_09-10-2026_13.59.58.10`)

Only CreateSystemModal changed. No other component on this page was touched, and no interactive
outside the modal was added, removed or rewired.

- **AccountStep** (was UsernameStep) — gained an **Email Address** field 🏁 beside the username.
  The step's Next now gates on both. This is `merchants.contact_email`, the business's published
  contact address, NOT a mirror of `auth.users.email` — see the deviation table below.
- **BusinessIdentityStep** (was BusinessDetailsStep) — gained a **Phone Number** field 🏁 and
  swapped Store Description for **Store Address** 🏁 under the same 0/255 counter.
- **Phone Input Group** 🏁 — a Paper `Menu`-anchored country selector beside one number input.
  Picking a country swaps the dial prefix on the front of whatever is already typed. The country
  list is twelve entries in `src/features/merchants/schema.ts`; no dependency was added.
- **StoreCategoryStep** — copy only: the subtitle is now "What type of business are you
  establishing?" and Continue 🏁 carries a trailing arrow.
- **Tablet combined view** — the single card body is now two labelled sections, **Personal
  Details** and **Business Identity**, with the paired single-line fields two to a row.
- **Data layer** — `supabase/migrations/20260910000000_merchants_contact_and_address.sql` renames
  `merchants.description` to `address` and adds `contact_email` and `phone` with shape checks;
  `src/lib/database.types.ts` regenerated. The placeholder `systems/[id].tsx` reads `address`, which
  is the only file outside the feature folder the rename touched.

### version 3 — RemoveSystemDialog (`revamps/Fri_09-11-2026_4.36.56.31`)

Only the SystemCard Remove path changed. No other interactive on this page was added, removed or
rewired, and no migration was needed — `merchants_delete_own` has existed since
`20260908131200_merchants.sql`.

- **SystemCard — Remove Button** 🏁 — was rendered inert since version 1; now opens the
  confirmation for that card's system. Edit stays inert.
- **RemoveSystemDialog** (`src/features/merchants/RemoveSystemDialog.tsx`) — the M3
  destructive-confirmation pattern: `Dialog.Icon` tinted `error`, a centred `Dialog.Title` naming
  the system, the consequence in `bodyMedium`, a `labelMedium` instruction, an outlined `TextInput`,
  and a Cancel/Delete pair both `mode="contained"` with only Delete carrying the `error` role.
  Delete is disabled until the typed name matches, so a mismatch sends no request — the sequence
  diagram's first branch is a disabled button, not a rejected call.
- **Hosted by the Home screen, not by the card** 🏁 — `index.tsx` holds `removing: Merchant | null`
  and the card calls `onRemove()`. FlashList recycles its cells, so "which merchant is being
  deleted" held inside one could reappear against a different row; one dialog above the list has no
  recycling to survive. It is also the shape CreateSystemModal already uses.
- **Data layer** — `useDeleteMerchantMutation` in `src/features/merchants/queries.ts`: one
  `delete().eq('id', …)`, invalidating `merchantsKey.lists()` only. No `owner_id` filter, for the
  same reason the list query has none.
- **Plain `useState`, not react-hook-form + Zod.** The confirmation is one equality check with no
  message to render — the feedback *is* the disabled button. Zod earns its place where there are
  fields, per-field errors and a schema shared with a mutation (`docs/data-layer.md` §4); pulling
  in a resolver for `typed.trim() === merchant.name` would be the abstraction to delete.

### version 4 — side effects of the Merchant-Page shell (System-History 9.1)

No Home-Page interactive was added, removed or rewired. These changes come from the Merchant-Page
pass:

- **ProfileDialog's body moved** to `src/features/profiles/ProfileScreen.tsx`, because a second route
  now renders it: `src/app/(app)/profile.tsx`, pushed from inside a system. The Account tab renders
  it with `onBack` → `router.navigate('/')`, which is what it did before. It does not get the
  "Back to your systems" button, which exists only on the in-system route. Section labels are now
  written in normal case ("Account", "Full name"); the `labelMedium` token uppercases them, so they
  render as before.
- **The theme foundation landed**, and every screen on this page follows it:
  - `roundness: 0` squares cards, buttons, dialogs, the FAB and text inputs.
  - The type scale shrinks text: `titleMedium` 16→14, `bodyMedium` 14→13, `bodySmall` 12→11,
    `labelLarge` 14→12, `headlineSmall` 24→19, `headlineMedium` 28→24.
  - `labelMedium` is now 10, bold, tracked and **uppercase**. CreateSystemModal's field labels and
    category tile labels therefore render in capitals.
  - Icon names Feather has now draw from Feather: `home`, `bell`, `plus`, `camera`, `chevron-right`,
    `arrow-left`. The rest keep MaterialCommunityIcons: `home-outline`, `bell-outline`, `account`,
    `cog`, `magnify`, `logout`, `view-grid`. On the Navigation Bar this means a focused tab
    (`home`, `bell`) draws a Feather glyph while its unfocused state (`home-outline`, `bell-outline`)
    draws a MaterialCommunityIcons one. `docs/visual-language.md` §6 records that mix and accepts it
    until the names are changed.
- **RemoveSystemDialog's instruction** moved from `labelMedium` to `bodySmall`. Uppercasing it would
  change the case of the system name the user has to type exactly.
- **The SystemCard tap destination** is now the Merchant-Page shell, at its Home destination.

### version 5 — the app bar's leading circle becomes the Merchant's logo (System-History 11.1)

- **The leading slot is a logo, not an avatar.** `Avatar.Icon icon="account"` wrapped in a
  `TouchableRipple` is replaced by `Avatar.Text label=""` — Paper's own circle with no glyph and no
  initials. The human's instruction: it is the Merchant's logo, and a blank logo has no features.
- **It is no longer a control.** The `TouchableRipple` and its `openAccount` handler are gone,
  because a brand mark that opens a screen is the confusion this replaces. Nothing is stranded:
  Account is the last tab of the Navigation Bar on a narrow container, and the bar's own
  `Appbar.Action icon="account-circle"` 🏁 on a wide one. **This supersedes the version 1 line
  above** — "the account action ✅ and the avatar both open the Account tab" recorded what version 1
  shipped and stays as the log of it; only the account action still does.
- **No `borderRadius` by hand.** The ripple wrapper needed one to stay circular; `Avatar.Text` is
  round through Paper's own stylesheet. `styles.avatar` (`borderRadius: 18, marginLeft: 8`) becomes
  `styles.logo` (`marginLeft: 8`). `docs/visual-language.md` §7 is what permits a round identity mark
  under `roundness: 0`.
- **Standing context written.** `system-context.txt` gained its Home-Page section — the page's scope,
  its single width branch, this logo rule, and that `CreateSystemModal` is the only writer of a
  merchant row.

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
| Account tab (renders ProfileScreen) | `src/app/(app)/(tabs)/account.tsx` |
| ProfileDialog body — identity, lists, Sign Out, Delete account | `src/features/profiles/ProfileScreen.tsx` |
| Notifications, Settings stubs | `src/app/(app)/(tabs)/{notifications,settings}.tsx` |
| Navigation Bar (Paper bar as a custom `tabBar`) | `src/app/(app)/(tabs)/_layout.tsx` |
| SystemCard tap destination — the Merchant-Page shell's Home | `src/app/(app)/systems/[id]/index.tsx` |
| SystemCard | `src/features/merchants/SystemCard.tsx` |
| CreateSystemModal + SelectableCard, SectionHeader, Phone Input Group | `src/features/merchants/CreateSystemModal.tsx` |
| RemoveSystemDialog (typed-confirmation delete) | `src/features/merchants/RemoveSystemDialog.tsx` |
| Merchant reads/writes, query keys | `src/features/merchants/queries.ts` |
| Form schema, category enum, `CATEGORY_META`, `COUNTRIES`, `countryFlag`, `normalizePhone` | `src/features/merchants/schema.ts` |
| Profile read (display name, email) | `src/features/profiles/queries.ts` |
| Column count from measured width | `src/lib/columns.ts` |
| QueryClient, `STALE`, online/focus wiring | `src/lib/query.ts` |
| `failureMessage` — user-facing copy for a failed action | `src/lib/errors.ts` |
| Generated schema types | `src/lib/database.types.ts` |
| `merchants` table, RLS, `current_merchant_ids()` | `supabase/migrations/20260908131200_merchants.sql` |
| `contact_email`, `phone`, `description` → `address` | `supabase/migrations/20260910000000_merchants_contact_and_address.sql` |

Two of these are already shared beyond this page, which is why they are keyed on the resource and
not on Home-Page: `features/profiles/queries` is imported by both the Account screen and
`CreateSystemModal`, and `features/merchants` is imported by `systems/[id]/_layout.tsx`, which
belongs to the Merchant-Page. `ProfileScreen` is rendered by the Merchant-Page's `profile.tsx` as
well as by the Account tab.

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

### version 2

Every interactive the revamp specifies is wired, so nothing was left inert this pass. Two things it
implies were still not built:

- **`merchants.contact_email` is nullable, and the form is what requires it.** The three merchant
  rows that already existed were created before the column did, and there is nothing true to
  backfill them with. Tighten to `not null` once they have one.
- **Nothing reads `contact_email` or `phone` back.** They are collected and stored; the Systems
  Page is where a business's own contact details would be shown, and that page is not this one.

### version 3

Nothing the revamp specifies was left inert. One control it sits beside is still unwired, and two
things the sequence diagram offers were deliberately not built:

- **SystemCard — Edit Button** stays rendered with no `onPress`. The revamp is scoped to deleting
  ("purely for deleting merchant ( POS ) systems"), and the filter has not promoted Edit.
- **No audit log.** The diagram marks `audit_log` optional. There is no such table, and adding one
  to record a delete nobody reads back is a table plus a trigger plus a policy for no consumer.
  It becomes worth building when someone can be asked who deleted what — which needs
  `merchant_members`, and that is `docs/tenancy.md` §4's "later, deliberately".
- **Hard delete, not the soft-delete alternative.** The diagram offers `deleted_at` as a note. Soft
  delete means a nullable column, a filter on every read of the table forever, and a row that
  still counts against a name the user believes they freed. The dialog already promises the delete
  is permanent, and `on delete cascade` is what makes that true in one statement. Revisit only if
  undo is actually asked for.

### version 4

Nothing on this page was newly left inert. One visible inconsistency is left in place on purpose:

- **Mixed icon sets on the Navigation Bar.** A focused tab draws Feather (`home`, `bell`) and its
  unfocused state draws MaterialCommunityIcons (`home-outline`, `bell-outline`). Renaming the tab
  icons to one set is a Home-Page change nobody asked for in this pass.

### version 5

- **The logo itself.** The circle is blank because nothing in the schema carries a logo: `merchants`
  has `name`, `address`, `category`, `contact_email`, `phone` and `currency`, and `profiles` has
  `avatar_url` — a person's photo, not a business's mark. Rendering it is one swap to
  `Avatar.Image source={{ uri }}`, marked with a `ponytail:` comment at the call site so
  `/ponytail-debt` harvests it. No column was added on spec: where a logo would be stored, and
  whether it is per-merchant or one brand mark for the app, is not settled — and the Home-Page lists
  every merchant, so it cannot be showing any one of them.

## Deviations from the M3 analysis

Resolved in favour of the project rules, which are authoritative:

| Analysis said | Shipped | Why |
| --- | --- | --- |
| `Card.Cover` on SystemCard | `aspectRatio: 1` tile + `Icon` | `Card.Cover` hardcodes height 195 (`Card/CardCover.js:61`); `docs/layout.md` rule 7 |
| `surfaceContainer` / `Low` / `High` | No colour prop passed | Those roles do not exist in react-native-paper 5.15.3. Paper's own defaults already resolve to the intended layers: `Card mode="contained"` → `surfaceVariant`, `BottomNavigation.Bar` → `elevation.level2` with a `secondaryContainer` indicator, `Dialog` → `elevation.level3` |
| Appbar background `primary` / content `onPrimary` | Paper's default | Hand-picking a colour with no reason to; `docs/typography.md` rule 5 also forbids passing `variant` to `Appbar.Content` |
| Profile list titles "use `bodyMedium`" | Paper's default | `List.Item` reads a raw fontSize outside the theme and takes no `variant` (`docs/typography.md` §3). Restyle via `titleStyle` only if it visibly drifts |
| Tablet Profile is a centred `Dialog` | A tab screen with `maxWidth: 640` | It is a destination, not a layer. The one surviving `Dialog` (delete-account) got `maxWidth: 560` since `Dialog` has no maximum of its own |
| Country selector shows a flag `Image` (v2) | Flag **emoji** derived from the ISO code | Same pixels with no asset pipeline, no bundle weight and nothing to keep in step with the country list. `docs/typography.md` §6 records that the system font carries emoji here |
| Phone group's `TextInput` holds the dial prefix "+63" (v2) | The same single input holds the whole number; the picker swaps the prefix on its front | A field that only ever holds a prefix collects no phone number. This is still one control, exactly as the analysis lists it, and it is usable |
| Confirmation `TextInput` is "pre-filled with the system name" (v3) | `placeholder`, so the field opens **empty** | A confirmation field that arrives already matching enables Delete on open and confirms nothing — it would delete the safety mechanism the same analysis calls the safety mechanism. The revamp's own `sequence-diagram-code.txt` has the user type it ("Types 'Cafe 67' and clicks Delete"), so the two files disagree and the behavioural one wins on behaviour. A greyed name in the mockup is what a placeholder looks like |
| Warning icon sits **outside** `Dialog.Icon`, because the built-in "tints with `secondary`" (v3) | Paper's `Dialog.Icon` with `color={colors.error}` | `secondary` is only its fallback — `color \|\| theme.colors.secondary` (`Dialog/DialogIcon.js:62`). Passing the role gives the specified appearance plus Paper's own centred wrapper and 24 top padding, instead of hand-building the same thing |
| Dialog background `surfaceContainerHigh` (or `surface`) (v3) | No colour prop passed | Same as v1: that role does not exist in react-native-paper 5.15.3. `Dialog` already resolves to `elevation.level3` |

One note for the modal, found while building: Paper's `Modal` styles only the backdrop
(`Modal.js:144`) and leaves its content `transparent` (`:175`) — unlike `Dialog`, it does not give
you a surface. `contentContainerStyle` sets `elevation.level3` explicitly so the two read as the
same layer.

## Status

**Not versioned** — one current value, replaced in place by each pass.

**In-Complete** (through version 3) — every priority interaction is wired, including all of the
revamped CreateSystemModal and all of RemoveSystemDialog, and their markers in
`Interactives ( Priority ).md` are 🏁. The 10 controls still listed as inert render by design,
waiting for the filter to promote them. Version 4 added no interactive. Version 5 **removed** one —
the app bar avatar's tap-to-Account — because that circle is now the Merchant's logo and not a
control; `Interactives.md` item 2 was rewritten to match, and Account keeps two routes in (the
Account tab, and the wide bar's own action 🏁).

**Untested on a device** — versions 1–4 were exercised on the emulator, version 5 has not been. It is
also the first Home-Page change to land under the Authentication Compatibility rule
(`docs/testing-workflow.md` §11), and that rule has never been run against this page at all.

**Version 4 is not re-verified on a device.** The theme foundation changes every screen on this page:
square corners, the smaller type, uppercase `labelMedium`, and Feather glyphs. Only typecheck, lint
and a full export have run since. Walk the card grid, CreateSystemModal, RemoveSystemDialog and the
Account tab on the phone before trusting the device results below for the current build.

**Verified on a phone (narrow, `columns === 1`)** — run on the Medium_Phone AVD, plus typecheck,
lint and a full Metro bundle of the whole route tree.

**Re-run on the Medium_Phone AVD at version 5.2**, which closes the gap the three passes after the
original phone run had left. Signed in with Google, created a system through the full stepped
wizard, and deleted it. What that run actually proved:

- the **CreateSystemModal revamp** — all three steps, the category grid and the submit, ending with
  the card on the grid. The wizard writes both tables and the list refetches itself.
- **RemoveSystemDialog** — the dialog's copy, and Delete doing nothing with the field left empty.
- **The offline paused path**, which is what version 5.1 was designed around and had never been
  exercised: with no network the mutation pauses rather than failing, the dialog says so, the
  hardware back button still dismisses it, and on reconnect the queued delete lands and the card
  leaves the grid on its own.
- **The offline paused path for the list query**, after version 5.2 fixed it — see below.

**The three gaps version 5.2 left open were closed at version 5.3**, on the same AVD:

- **The dismiss lock during a live (online) delete.** With the request genuinely in flight — dialog
  open, no paused notice — a backdrop tap and a hardware back press both bounced off, and the dialog
  then closed on its own when the delete landed. What made it testable is recorded in
  [version 5.3](../../System-History/version-5.3.md): the emulator's `network delay`/`speed` console
  commands throttle **only the cellular path**, so on `AndroidWifi` they do nothing and the delete
  keeps finishing in ~200ms.
- **The typed-confirmation gate against a *wrong* name.** With `Cafe 6` in the field, Delete's
  clickable ancestor reported `enabled="false"`, and tapping it left the dialog open and the row in
  place. Read the state off that ancestor, never off the label: Paper renders the label as a plain
  `TextView`, so `Cancel` reports `clickable="false"` while plainly enabled.
- **The sign-in failure copy.** Signing in with the network down shows
  "You're offline. Reconnect and try again." — `failureMessage`'s offline branch, no GoTrue string.
  The native Google sheet opens from cached accounts regardless, so the failure only arrives after
  an account is chosen.

**The wide branch (`columns > 1`) has never rendered on a device.** The Pixel Tablet AVD boots with
no default route in its routing table, so it can reach neither Metro nor Supabase — an emulator
fault, not an app one, and that AVD has a history of it. Everything below is written and compiles
but is unexercised, so treat it as the first thing to check on the next working tablet:

- the bottom navigation bar hiding itself
- the 2-column card grid, and the blank-padding that stops a partial last row stretching
- SystemCard's grid anatomy (square category tile) rather than its row anatomy
- the Action Card create trigger, in place of the filled button
- CreateSystemModal as one scrolling form rather than three steps — and, since version 2, its two
  labelled sections and the paired two-to-a-row fields inside them
- Account Appbar.Action 🏁 and the Go Back button 🏁, which exist only on this branch
- RemoveSystemDialog's `maxWidth: 560` — the constraint only does anything past 560dp, so the
  narrow branch cannot show whether it holds
