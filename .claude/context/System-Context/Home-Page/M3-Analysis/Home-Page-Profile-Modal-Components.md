## Component Name: ProfileDialog

A profile view/modal for the logged-in merchant, available in two layouts: a **full-screen page** on mobile and a **centered dialog** on tablet. Both follow the same data model: identity header (avatar + name), account details, and action buttons.

---

### Mobile — Full-Screen ProfileView

| # | M3 Component | Variant / Notes |
|---|---|---|
| 1 | **Top App Bar** (small) | Leading `Appbar.Action` (back arrow) + `Appbar.Content` title "Profile". Background `primary`, content `onPrimary`. |
| 2 | **Banner / Header Image** | Cover photo behind the avatar. *(Not a Paper component — plain `Image`.)* |
| 3 | **Avatar** (large) | Circular profile photo, overlapping the banner. |
| 4 | **FAB (mini)** | Camera icon overlay on the avatar — used to edit profile photo. Background `primary`, icon `onPrimary`. |
| 5 | **Button** (filled) | "Sign Out" — `mode="contained"` with `icon="logout"`. Background `error`, text `onError`. Label `labelLarge` (auto, rule §3). |
| 6 | **Headline** | "Shinox Superman" — `titleMedium` (account name, workhorse role). |
| 7 | **Body Text** | "shinoxxvn@gmail.com" — `bodySmall` (secondary data, email). |
| 8 | **Section Label** | "ACCOUNT" — `labelMedium` (uppercase by style convention). |
| 9 | **Card** (elevated) | Contains 3 `List.Item`s: <br>• **Account Information** — leading `Icon` (person), trailing chevron (`IconButton` with `chevron-right`). <br>• **Your Businesses** — leading `Icon` (grid), trailing chevron. <br>• **Manage Devices** — leading `Icon` (phone), trailing chevron. <br>Titles — `bodyLarge` by Paper default, but since our scale forbids it, use `bodyMedium` for these list-row titles (dense). |
| 10 | **Section Label** | "SECURITY & PRIVACY" — `labelMedium`. |
| 11 | **Card** (elevated) | 2 `List.Item`s: <br>• **Privacy Policy** — leading `Icon` (shield), trailing chevron. <br>• **Terms of Service** — leading `Icon` (handshake), trailing chevron. |
| 12 | **Section Label** | "PREFERENCES" — `labelMedium`. |
| 13 | **Card** (elevated) | 1 `List.Item`: <br>• **Appearance** — leading `Icon` (moon), trailing `Switch`. |
| 14 | **Navigation Bar** | 4 destinations: Home, Notifications, Settings, Account. Each `NavigationBar.Item` with icon + `labelMedium` label (auto-picked). Active: `secondaryContainer` indicator + `onSurface` icon/text. Inactive: `onSurfaceVariant`. |

---

### Tablet — ProfileDialog (Modal)

| # | M3 Component | Variant / Notes |
|---|---|---|
| 1 | **Dialog** | Centered modal container. Background `surfaceContainerHigh` (or `surface`). |
| 2 | **Avatar** (large) | Circular profile photo. |
| 3 | **FAB (mini)** | Camera icon overlay — edit profile photo. Background `primary`, icon `onPrimary`. |
| 4 | **Headline** | "Partick Kalbo" — `titleMedium` (account name). |
| 5 | **Card** (contained/elevated) | Wrapper for "Account Details". Background `surfaceContainerLow` (or `surfaceVariant`). |
| 6 | **Section Header** | "Account Details" — `titleMedium` (with leading `Icon` person). |
| 7 | **Field Labels** | "FULL NAME", "PHONE NUMBER", "EMAIL ADDRESS", "ACCOUNT ID" — `labelMedium` (uppercase, dense). |
| 8 | **Field Values** | "Patrick Niño A. Caro", "+63 9876543210", "patrickcaro@gmail.com", "ACC 001-067" — `bodyMedium`. |
| 9 | **Button** (outlined) | "Go Back" — `mode="outlined"` with `icon="arrow-left"`. Label `labelLarge` (auto). |
| 10 | **Button** (filled) | "Sign Out" — `mode="contained"` with `icon="logout"`. Background `error`, text `onError`. Label `labelLarge` (auto). |

---

### Key Notes

- **Avatar sizing** is responsive (larger on tablet), but type scale remains constant — no `variant` swap per rule §6.
- The mobile version uses **sections** (`ACCOUNT`, `SECURITY & PRIVACY`, `PREFERENCES`) while the tablet version condenses the same data into a single `Account Details` card with a **2×2 grid layout**.
- The **Sign Out** button keeps the same `error` color role in both layouts.
- Tablet dialog omits the `Top App Bar` and `Navigation Bar` — it's a modal layer, not a full screen.