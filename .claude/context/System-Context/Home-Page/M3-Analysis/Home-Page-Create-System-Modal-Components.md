## Component Name: CreateSystemModal (Multi-step Wizard)

A modal dialog (or full-screen step flow on mobile) for creating a new POS system. On **mobile** it is segmented into **3 steps** (`UsernameStep`, `BusinessDetailsStep`, `StoreCategoryStep`). On **tablet** all steps are combined into a single scrollable card view.

---

### Mobile — Step 1: UsernameStep

| # | M3 Component | Variant / Notes |
|---|---|---|
| 1 | **Top App Bar** (small) | `Appbar` with leading back icon + title "Merchant". Background `primary`, content `onPrimary`. |
| 2 | **Headline** | "Create your username" — `headlineSmall` (screen title above form). |
| 3 | **Body Text** | "Enter your preferred owner name." — `bodyMedium`. |
| 4 | **TextInput** (outlined) | "Enter username" — `mode="outlined"`. Placeholder/label `bodyMedium`. |
| 5 | **Button** (filled) | "Next" — `mode="contained"`, `labelLarge` (auto via Paper, rule §3). Background `primary`, text `onPrimary`. |

---

### Mobile — Step 2: BusinessDetailsStep

| # | M3 Component | Variant / Notes |
|---|---|---|
| 1 | **Top App Bar** (small) | Back icon + "Merchant". Background `primary`, content `onPrimary`. |
| 2 | **Headline** | "Establish your business" — `headlineSmall`. |
| 3 | **Body Text** | "Provide details that help..." — `bodyMedium`. |
| 4 | **Field Label** | "Store Name" — `labelMedium`. |
| 5 | **TextInput** (outlined) | "Enter store name" — `mode="outlined"`. |
| 6 | **Field Label** | "Store Description" — `labelMedium`. |
| 7 | **TextInput** (outlined, multiline) | "Enter store details" — `mode="outlined"`, `multiline={true}`. |
| 8 | **HelperText / Character Counter** | "0/255" — `labelMedium` (dense 12pt counter). |
| 9 | **Button** (filled) | "Next" — `mode="contained"`, `labelLarge` (auto). Background `primary`, text `onPrimary`. |

---

### Mobile — Step 3: StoreCategoryStep

| # | M3 Component | Variant / Notes |
|---|---|---|
| 1 | **Top App Bar** (small) | Back icon + "Merchant". Background `primary`, content `onPrimary`. |
| 2 | **Headline** | "Store Category" — `headlineSmall`. |
| 3 | **Body Text** | "Provide details that help..." — `bodyMedium`. |
| 4 | **SelectableCard** (grid, 2 columns) | 10 options (Restaurant, Cafe, Clothing, Grocery, Bakery, Electronics, Pharmacy, Bookstore, Fitness, Others). Each is a tappable outlined card with a leading `Icon` + label. <br>• **Selected state** ("Restaurant"): border `primary`, icon/text `primary`. <br>• **Unselected state**: border `outline`, icon/text `onSurfaceVariant`. <br>Label — `labelMedium`. |
| 5 | **Button** (filled) | "Continue" — `mode="contained"`, `labelLarge` (auto). Background `primary`, text `onPrimary`. |

---

### Tablet — Combined View (all steps in one modal)

| # | M3 Component | Variant / Notes |
|---|---|---|
| 1 | **Top App Bar** (small) | Back icon + "Merchant". Background `primary`, content `onPrimary`. |
| 2 | **Headline** | "Set up your business" — `headlineSmall` (no variant swap on breakpoint, rule §6). |
| 3 | **Body Text** | "Complete each section below..." — `bodyMedium`. |
| 4 | **Card** (elevated/contained) | Wrapper for the entire form. Background `surfaceVariant` (or `surfaceContainer`). |
| 5 | **Section Header** | "Business Identity" (with leading icon) — `titleMedium`. |
| 6 | **Field Label** | "Username" — `labelMedium`. |
| 7 | **TextInput** (outlined) | "Enter username" — `mode="outlined"`, in 2-column row layout. |
| 8 | **Field Label** | "Store Name" — `labelMedium`. |
| 9 | **TextInput** (outlined) | "Enter store name" — `mode="outlined"`, in 2-column row layout. |
| 10 | **Field Label** | "Store Details" — `labelMedium`. |
| 11 | **TextInput** (outlined, multiline) | "Enter store details" — `mode="outlined"`, `multiline={true}`. |
| 12 | **HelperText / Character Counter** | "0/255" — `labelMedium`. |
| 13 | **Field Label** | "Store Category" — `labelMedium`. |
| 14 | **SelectableCard** (grid, 3 columns) | Same 10 options, same selected/unselected states as mobile. Label — `labelMedium`. |
| 15 | **Button** (filled) | "Next" — `mode="contained"`, `labelLarge` (auto). Background `primary`, text `onPrimary`. Aligned bottom-right. |

---

### Key notes

- **Layout difference** (2-col vs 3-col grid on category cards) is a *width* response, not a *type scale* response — no variant swapped, per rule §6.
- The **step wizard** on mobile uses sequential screens with back navigation (implicit stepper), while the tablet consolidates into a single modal with a scrollable `Card` body.
- All `TextInput` fields use `mode="outlined"`.
- No inline `fontSize`, `lineHeight`, `fontWeight`, or `letterSpacing` anywhere — all sizes come from the theme variants above.