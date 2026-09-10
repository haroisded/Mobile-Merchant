## Component Name: CreateSystemModal (Multi-step Wizard)

*Merged from `revamps/Thu_09-10-2026_13.59.58.10`, which supersedes the original breakdown.* The
wizard flow is still 3 steps on mobile, but each step now collects different fields. The tablet
consolidated view has **two distinct sections** inside the card instead of one.

---

### What changed vs. the original

| Area | Original | Revamp |
|---|---|---|
| Mobile Step 1 | Username only | **Username + Email Address** — heading now "Create your account" |
| Mobile Step 2 | Store Name + Store Description | **Store Name + Phone Number (country picker + prefix) + Store Address (multiline)** |
| Mobile Step 3 | Category grid | Category grid — subtitle copy changed to "What type of business are you establishing?" |
| Tablet card body | One section: "Business Identity" | **Two sections: "Personal Details" and "Business Identity"** |

---

### Mobile — Step 1: AccountStep

| # | M3 Component | Variant / Notes |
|---|---|---|
| 1 | **Top App Bar** (small) | Leading `Appbar.Action` (back arrow) + `Appbar.Content` "Merchant". |
| 2 | **Headline** | "Create your account" — `headlineSmall`. |
| 3 | **Body Text** | "Add a username and an email for your account." — `bodyMedium`. |
| 4 | **Field Label** | "Username" — `labelMedium`. |
| 5 | **TextInput** (outlined) | "Enter username" — `mode="outlined"`. |
| 6 | **Field Label** | "Email Address" — `labelMedium`. |
| 7 | **TextInput** (outlined) | "Enter Email Address" — `mode="outlined"`, `keyboardType="email-address"`. |
| 8 | **Button** (filled) | "Next" — `mode="contained"`, `labelLarge` (auto). |

---

### Mobile — Step 2: BusinessIdentityStep

| # | M3 Component | Variant / Notes |
|---|---|---|
| 1 | **Top App Bar** (small) | Back arrow + "Merchant". |
| 2 | **Headline** | "Establish your business" — `headlineSmall`. |
| 3 | **Body Text** | "Provide details that help categorize and identify your business." — `bodyMedium`. |
| 4 | **Field Label** | "Store Name" — `labelMedium`. |
| 5 | **TextInput** (outlined) | "Enter store name" — `mode="outlined"`. |
| 6 | **Field Label** | "Phone Number" — `labelMedium`. |
| 7 | **Phone Input Group** | Composite row: a `Menu`-anchored **Country Selector** (flag + `chevron-down`) beside an outlined `TextInput` for the number — `keyboardType="phone-pad"`. |
| 8 | **Field Label** | "Store Address" — `labelMedium`. |
| 9 | **TextInput** (outlined, multiline) | "Enter store details and address" — `mode="outlined"`, `multiline={true}`. |
| 10 | **HelperText / Character Counter** | "0/255" — `labelMedium`. |
| 11 | **Button** (filled) | "Next" — `mode="contained"`, `labelLarge` (auto). |

---

### Mobile — Step 3: StoreCategoryStep

| # | M3 Component | Variant / Notes |
|---|---|---|
| 1 | **Top App Bar** (small) | Back arrow + "Merchant". |
| 2 | **Headline** | "Store Category" — `headlineSmall`. |
| 3 | **Body Text** | "What type of business are you establishing?" — `bodyMedium`. |
| 4 | **SelectableCard** (grid, 2 columns) | 10 options (Restaurant, Cafe, Clothing, Grocery, Bakery, Electronics, Pharmacy, Bookstore, Fitness, Others). Leading `Icon` + label. <br>• **Selected**: border `primary`, icon/text `primary`. <br>• **Unselected**: border `outline`, icon/text `onSurfaceVariant`. <br>Label — `labelMedium`. |
| 5 | **Button** (filled) | "Continue" with trailing arrow icon — `mode="contained"`, `labelLarge` (auto). |

---

### Tablet — Combined View (two sections)

| # | M3 Component | Variant / Notes |
|---|---|---|
| 1 | **Top App Bar** (small) | Back arrow + "Merchant". |
| 2 | **Headline** | "Set up your business" — `headlineSmall`. |
| 3 | **Body Text** | "Complete each section below to finish setting up your store." — `bodyMedium`. |
| 4 | **Card** (contained) | Wrapper for the entire form. |
| 5 | **Section Header** | **"Personal Details"** (leading person-card icon) — `titleMedium`. |
| 6 | **Field Label** | "Username" — `labelMedium`. |
| 7 | **TextInput** (outlined) | "Enter username" — `mode="outlined"`, 2-column row. |
| 8 | **Field Label** | "Email Address" — `labelMedium`. |
| 9 | **TextInput** (outlined) | "Enter Email Address" — `mode="outlined"`, 2-column row, `keyboardType="email-address"`. |
| 10 | **Section Header** | **"Business Identity"** (leading storefront icon) — `titleMedium`. |
| 11 | **Field Label** | "Store Name" — `labelMedium`. |
| 12 | **TextInput** (outlined) | "Enter store name" — `mode="outlined"`, 2-column row. |
| 13 | **Field Label** | "Phone Number" — `labelMedium`. |
| 14 | **Phone Input Group** | Country selector (`Menu` anchor w/ flag + `chevron-down`) + number `TextInput`. 2-column row. |
| 15 | **Field Label** | "Store Address" — `labelMedium`. |
| 16 | **TextInput** (outlined, multiline) | "Enter store details and address" — `mode="outlined"`, `multiline={true}`. Full width. |
| 17 | **HelperText / Character Counter** | "0/255" — `labelMedium`. |
| 18 | **Field Label** | "Store Category" — `labelMedium`. |
| 19 | **SelectableCard** (grid, 3 columns) | Same 10 options, same states as mobile. Label — `labelMedium`. |
| 20 | **Button** (filled) | "Next" — `mode="contained"`, `labelLarge` (auto). Aligned bottom-right. |

---

### Key notes

- **Field count grew** — Step 1 gained Email, Step 2 gained Phone Number with a country-picker
  composite and swapped Store Description for Store Address. Total collected fields went 4 → 7.
- **The phone input** is a composite, assembled from Paper parts: a `Menu`-anchored country
  selector beside an outlined `TextInput`. Neither half is a single Paper component.
- **Tablet still consolidates into one scrollable `Card`**, now split into two labeled sections.
- **No variant swaps across breakpoints** — the grid column count (2 → 3) is the only layout
  change; the type scale stays fixed (`docs/typography.md` rule 6).
- `Card`-internal section headers use `titleMedium`; all field labels use `labelMedium`; helper
  text and counters use `labelMedium`.

---

### Deviations taken while building

The project rules are authoritative where they and this analysis disagree; both entries below are
also recorded in `../history.md`.

| Analysis said | Shipped | Why |
|---|---|---|
| Country selector shows a flag `Image` | Flag **emoji**, derived from the ISO code | Same pixels, no asset pipeline, no bundle weight, nothing to keep in step with the country list. `docs/typography.md` §6 records that the system font carries emoji here |
| Phone group's `TextInput` holds the dial prefix "+63" | The same single input holds the **whole number**, and the picker swaps the prefix on its front | A field that only ever holds a prefix collects no phone number. One control, matching the analysis's own control list, that is actually usable |
| Backgrounds/foregrounds named `primary` / `onPrimary` on the app bar | Paper's defaults | Hand-picking a colour with no reason to (`CLAUDE.md` §3 rule 2), and `docs/typography.md` rule 5 forbids passing `variant` to `Appbar.Content` |
