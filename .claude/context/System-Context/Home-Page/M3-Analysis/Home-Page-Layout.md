## Home Page — Component Breakdown

### Image 1 — Mobile

| # | M3 Component | Notes / Variant |
|---|---|---|
| 1 | **Top App Bar** (small) | `Appbar.Content` title "Merchant" — auto-picks variant (per typography rule §3). Leading slot: `Avatar` (circular). Background: `primary`; content `onPrimary`. |
| 2 | **Section Header** | "Quick Actions" — `titleMedium`. |
| 3 | **Icon Button** | Search icon (magnifying glass) — `IconButton` with `icon="magnify"`. |
| 4 | **Button (Filled)** | "Create New System" — `Button` with `mode="contained"` and `icon="plus"`. Label uses `labelLarge` (auto-picked, rule §3). Background `primary`, text `onPrimary`. |
| 5 | **Section Header** | "Active Systems" — `titleMedium`. |
| 6 | **Card** (list item, repeated ×3) | "Cafe 67" — `Card` (contained/filled, background `surfaceVariant`). Contains: <br>• Leading `Icon` (coffee cup) inside a small container (could be `Avatar`-style surface) <br>• Title "Cafe 67" — `titleMedium` <br>• `Button` **Edit** — `mode="contained"`, `icon="pencil"`, `labelLarge` (auto). Background `primary`, text `onPrimary`. <br>• `Button` **Remove** — `mode="contained"`, `icon="delete"`, `labelLarge` (auto). Background `error`, text `onError`. |
| 7 | **Navigation Bar** | 4 destinations: Home, Notifications, Settings, Account. Each `NavigationBar.Item` with `icon` (home / bell / cog / account) + label. Labels use `labelMedium` (auto-picked by Paper). Background `surfaceContainer`; inactive `onSurfaceVariant`; active indicator `secondaryContainer`; active icon/text `onSurface`. |

---

### Image 2 — Tablet

| # | M3 Component | Notes / Variant |
|---|---|---|
| 1 | **Top App Bar** (large / medium) | `Appbar.Content` title "Merchant" — auto-picks variant (rule §3). Leading: `Avatar`. Trailing: `Appbar.Action` (bell — notifications) and `Appbar.Action` (person — account). Background `primary`, content `onPrimary`. |
| 2 | **Headline** | "Your POS Systems" — `headlineSmall` (screen title above real content, per typography §2). |
| 3 | **Body Text** | "Manage, edit, and monitor your custom point-of-sale system." — `bodyMedium`. |
| 4 | **Action Card** | "Create New System" — a tappable `Card` (elevated/contained) that acts as a button. Contains: <br>• Circular `Icon` (plus) inside an `Avatar`-style container <br>• Title "Create New System" — `titleMedium` <br>• Subtitle "Make your own point-of-sale system." — `bodySmall`. |
| 5 | **Card** (grid item, repeated ×4) | "Cafe 67" — `Card` with: <br>• `Card.Cover` — image (product photo) <br>• `Card.Title` — "Cafe 67" — **must pass** `titleVariant="titleMedium"` (rule §5: default is body type) <br>• `Card.Actions` — `Button` **Edit** (`mode="contained"`, `icon="pencil"`, `labelLarge` auto; background `primary`, text `onPrimary`) and `Button` **Remove** (`mode="contained"`, `icon="delete"`, `labelLarge` auto; background `error`, text `onError`). <br>The grid is 2 columns — likely `FlatList` with `numColumns={2}`. |

---

**Notable variance vs. mobile:** The tablet layout swaps the mobile `NavigationBar` for a wider content grid and promotes the "Create New System" action from a filled `Button` to a full `Card`-level affordance (visual hierarchy shift driven by screen width, not type scale — no variant swap per rule §6).

Ready for your next image.