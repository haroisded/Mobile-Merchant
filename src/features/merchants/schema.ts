import * as z from 'zod';

// Zod earns its place here because this is *form input* — user-typed, untrusted, and needing
// per-field messages. Reads are not validated with it: the generated database.types.ts already
// expresses the schema, and a Zod mirror of a migration is the migration written twice in two
// languages, drifting from the day it is committed (docs/data-layer.md §4).

// The single source of the category list on the client. The values are the Postgres enum's labels
// verbatim, and two call sites pin the two lists equal at compile time with no type assertion:
//
//   CATEGORY_META[merchant.category]   in SystemCard.tsx  -> every DB value must exist here
//   .insert({ category: values.category })  in queries.ts -> every value here must exist in the DB
//
// Add a category in a migration of its own (`alter type public.store_category add value`), then
// here, then regenerate database.types.ts. Miss either half and typecheck fails, which is the point.
export const storeCategory = z.enum(
  [
    'restaurant',
    'cafe',
    'clothing',
    'grocery',
    'bakery',
    'electronics',
    'pharmacy',
    'bookstore',
    'fitness',
    'other',
  ],
  { error: 'Pick a category.' }
);

export type StoreCategory = z.infer<typeof storeCategory>;

// `satisfies`, not a type annotation. Both make a missing category a compile error, but annotating
// the binding would widen every value to `string` and throw away the literal types the object
// actually has — which is what anti-slop/no-known-value-widening rejects. This keeps the inference
// and still checks the shape.
//
// Icon names are MaterialCommunityIcons, which is what PaperProvider's `settings.icon` renders
// (src/app/_layout.tsx).
export const CATEGORY_META = {
  restaurant: { label: 'Restaurant', icon: 'silverware-fork-knife' },
  cafe: { label: 'Cafe', icon: 'coffee' },
  clothing: { label: 'Clothing', icon: 'tshirt-crew' },
  grocery: { label: 'Grocery', icon: 'cart' },
  bakery: { label: 'Bakery', icon: 'bread-slice' },
  electronics: { label: 'Electronics', icon: 'laptop' },
  pharmacy: { label: 'Pharmacy', icon: 'pill' },
  bookstore: { label: 'Bookstore', icon: 'book-open-variant' },
  fitness: { label: 'Fitness', icon: 'dumbbell' },
  other: { label: 'Others', icon: 'dots-horizontal' },
} satisfies Record<StoreCategory, { label: string; icon: string }>;

// The description limit the counter shows the user. The same 255 is a check constraint on the
// table — this one reports it before a round trip, that one is what actually enforces it.
export const DESCRIPTION_MAX = 255;

// One schema for the whole wizard, shared by the form resolver and the mutation, so the thing
// validated and the thing written cannot disagree (docs/data-layer.md §4).
//
// The mobile flow gates each step with `trigger([...fields])` over a subset of THIS schema. There
// are deliberately no per-step schemas: three schemas plus a merge is three places for the rules to
// drift, and the tablet layout submits all the fields at once anyway.
export const createSystemSchema = z.object({
  // Step 1. Writes to profiles.display_name, not to the merchant row — it is the person's name,
  // not the business's.
  displayName: z.string().trim().min(1, 'Enter a username.').max(80, 'Username is too long.'),

  // Step 2. `.trim()` before `.min(1)` so a name of pure spaces fails here rather than at the
  // merchants_name_length check constraint.
  name: z.string().trim().min(1, 'Enter a store name.').max(80, 'Store name is too long.'),
  description: z.string().trim().max(DESCRIPTION_MAX, `Keep it under ${DESCRIPTION_MAX} characters.`),

  // Step 3. No default, so the required-enum message fires instead of a category being silently
  // preselected.
  category: storeCategory,
});

export type CreateSystemValues = z.infer<typeof createSystemSchema>;
