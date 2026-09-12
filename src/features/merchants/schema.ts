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

// The address limit the counter shows the user. The same 255 is a check constraint on the
// table — this one reports it before a round trip, that one is what actually enforces it.
export const ADDRESS_MAX = 255;

// The country list behind the phone field's picker.
//
// Deliberately NOT a dependency. `country-codes-list` and friends ship all ~250 countries as one
// data blob, and Metro does no tree-shaking, so the whole set lands in the bundle whether the
// picker renders ten rows or every row (the RN optimization guide's "Avoid Barrel Exports" and
// "Experiment With Tree Shaking" chapters). `Intl` is no help either: it has no dial codes at any
// Hermes version. So the smallest thing that works is the list this app actually serves, and
// adding a country is one line here.
//
// If real phone *validation* is ever needed rather than a dial prefix, that is libphonenumber-js
// and nothing smaller — but it is not what the wizard asks for.
export const COUNTRIES = [
  { iso: 'PH', name: 'Philippines', dial: '+63' },
  { iso: 'US', name: 'United States', dial: '+1' },
  { iso: 'CA', name: 'Canada', dial: '+1' },
  { iso: 'GB', name: 'United Kingdom', dial: '+44' },
  { iso: 'AU', name: 'Australia', dial: '+61' },
  { iso: 'SG', name: 'Singapore', dial: '+65' },
  { iso: 'MY', name: 'Malaysia', dial: '+60' },
  { iso: 'ID', name: 'Indonesia', dial: '+62' },
  { iso: 'TH', name: 'Thailand', dial: '+66' },
  { iso: 'VN', name: 'Vietnam', dial: '+84' },
  { iso: 'HK', name: 'Hong Kong', dial: '+852' },
  { iso: 'JP', name: 'Japan', dial: '+81' },
] as const;

export type Country = (typeof COUNTRIES)[number];

// The flag, from the ISO code, with no image asset and no `Image` at all: an alpha-2 code maps onto
// the two regional-indicator codepoints that render as that flag. 0x1f1e6 is 🇦 and 'A' is 0x41,
// so the offset between them is the whole conversion.
//
// The M3 analysis specifies a flag `Image`. This is the same pixels with no asset pipeline, no
// bundle weight and nothing to keep in step with the list above. docs/typography.md §6 already
// records that the system font carries emoji here, which is what makes it safe.
export function countryFlag(iso: string): string {
  return String.fromCodePoint(
    ...[...iso.toUpperCase()].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 0x41)
  );
}

// What the user typed, reduced to the one shape the column accepts. Everything a person uses as
// spacing — `+63 917 555 0100`, `(02) 8123-4567` — is punctuation around the digits, so stripping
// to digits and re-adding the leading + is the whole normalization.
//
// It runs at the mutation boundary, not inside the schema as a `.transform()`. A transform would
// split z.input from z.output and hand react-hook-form a field value whose type is not the type the
// resolver produces, for no gain the user can see — the form validates the raw string, the database
// stores the normalized one.
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

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

  // Step 1, and the one field on this form whose destination is worth stating twice: it writes to
  // merchants.contact_email, the *business's* published address. It is NOT auth.users.email, which
  // stays the person's sign-in identity and is still never copied into a table (ARCHITECTURE.md).
  // A user with two merchants can publish two different contact addresses; a mirror of auth could
  // not express that, and would go stale the first time they changed their sign-in email.
  //
  // The 254 mirrors merchants_contact_email_shape, which bounds the column at 3..254. Without it a
  // long address passes the form, reaches Postgres, and comes back as a constraint violation the
  // user sees as a generic failure with no field named — the same reason ADDRESS_MAX exists.
  contactEmail: z
    .email({ error: 'Enter a valid email address.' })
    .max(254, 'Email address is too long.'),

  // Step 2. `.trim()` before `.min(1)` so a name of pure spaces fails here rather than at the
  // merchants_name_length check constraint.
  name: z.string().trim().min(1, 'Enter a store name.').max(80, 'Store name is too long.'),

  // Optional: the wizard's own progression gate requires only the store name to leave step 2.
  // Validated against the NORMALIZED value so the message answers "is this a phone number?" rather
  // than "did you punctuate it the way we wanted?". E.164 proper, so the first digit cannot be 0 —
  // a stricter test than the merchants_phone_shape constraint, which is the right direction: the
  // client may refuse what the database would accept, never the reverse.
  phone: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\+[1-9]\d{6,14}$/.test(normalizePhone(value)), {
      error: 'Enter a valid phone number.',
    }),

  address: z.string().trim().max(ADDRESS_MAX, `Keep it under ${ADDRESS_MAX} characters.`),

  // Step 3. No default, so the required-enum message fires instead of a category being silently
  // preselected.
  category: storeCategory,
});

export type CreateSystemValues = z.infer<typeof createSystemSchema>;
