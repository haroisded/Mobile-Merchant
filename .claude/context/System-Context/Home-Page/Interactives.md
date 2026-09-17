# Home Page ( this is after authentication )
*( note ):* keep the `sign-out` and `delete-account` functionality, we will still be using them 
later on, they're important 


## UI Components or Modals within this Page

- **Top App Bar**
- **Create New System Button** (mobile) / **Action Card** (tablet)
- **SystemCard** (repeated in Active Systems grid)
- **Navigation Bar**
- **CreateSystemModal** (multi-step wizard)
- **RemoveSystemDialog** (destructive confirmation)
- **ProfileDialog** (profile view/dialog)

---

### Clickable Components

**Top App Bar**
- Search IconButton (mobile)
- Notification Appbar.Action (tablet)
- Account Appbar.Action (tablet)

**Create New System Button** (mobile)
- Entire button (single clickable → opens CreateSystemModal)

**Action Card** (tablet)
- Entire card (single clickable → opens CreateSystemModal)

**SystemCard**
- Entire card (single clickable → goes to Systems Page w/the selected system)
- Edit Button
- Remove Button

**Navigation Bar**
- Home destination
- Notifications destination
- Settings destination
- Account destination

**CreateSystemModal** *(revamped — `revamps/Thu_09-10-2026_13.59.58.10`)*
- Back IconButton (Top App Bar)
- Next Button (Step 1 — AccountStep)
- Next Button (Step 2 — BusinessIdentityStep)
- Country Selector (Phone Input Group, Step 2 / tablet — Menu anchor)
- SelectableCard options (Step 3 — StoreCategoryStep, 10 tappable cards)
- Continue Button (Step 3, trailing arrow icon)
- Next Button (tablet combined view, aligned bottom-right)
- TextInputs (editable, but not "clickable" per se — they accept focus/tap):
  Username, Email Address, Store Name, Phone Number, Store Address

**RemoveSystemDialog** *(added — `revamps/Fri_09-11-2026_4.36.56.31`)*
- Confirmation TextInput (accepts focus/tap; the typed value gates Delete)
- Cancel Button
- Delete Button (disabled until the typed name matches the system name exactly)

**ProfileDialog**
- Back Arrow (mobile Top App Bar)
- Camera FAB (edit profile photo overlay)
- Sign Out Button
- List Item: Account Information (with chevron)
- List Item: Your Businesses (with chevron)
- List Item: Manage Devices (with chevron)
- List Item: Privacy Policy (with chevron)
- List Item: Terms of Service (with chevron)
- List Item: Appearance (Switch toggle)
- Go Back Button (tablet)

---

## Components Interactions within this Page

1. **Create New System Button / Action Card → CreateSystemModal**
   - Mobile: Tapping "Create New System" (filled Button) opens the wizard, starting at Step 1 (UsernameStep).
   - Tablet: Tapping the Action Card opens the same modal but in combined single-scroll view.

2. **Top App Bar Account Icon → ProfileDialog**
   - Tapping the Account Appbar.Action (tablet) opens the ProfileDialog (full-screen on mobile, centered modal on tablet).
   - The Avatar no longer does this. The leading circle is the **Merchant's logo** — blank while no logo exists, and not a control (System-History 11.1). On mobile the route in is the Account tab of the Navigation Bar.

3. **SystemCard Edit → Edit Flow**
   - Tapping Edit on any SystemCard triggers the edit flow for that specific system (likely opens a modal or navigates to edit screen — not detailed in provided specs).

4. **SystemCard Remove → RemoveSystemDialog**
   - Tapping Remove on any SystemCard opens the destructive confirmation for that system.
   - The dialog names the system in its title and asks for that name to be typed back. Delete stays disabled until the typed value matches exactly, so a mismatch sends no request at all.
   - Confirming deletes the merchant row; the grid refreshes and the card is gone. Cancel closes with nothing written.
   - A failure leaves the dialog open with the message on it, so the attempt is retried from where the user already is.

5. **Navigation Bar → Tab Switching**
   - Tapping any destination (Home, Notifications, Settings, Account) switches the active tab, updating the page content accordingly.

6. **CreateSystemModal Internal Interactions (Mobile)**
   - Step 1 (AccountStep): Enter username and email address → tap Next → progresses to Step 2. Both fields must pass before the step advances.
   - Step 2 (BusinessIdentityStep): Enter store name, phone number and store address → tap Next → progresses to Step 3. Store name is required; phone may be left empty but must be a valid number if filled.
   - Step 2 — Country Selector: tapping the flag + chevron trigger opens a Menu of countries. Selecting one swaps the dial prefix on the front of the number already typed.
   - Step 3: Select a category (SelectableCard) → tap Continue → creates the system → closes modal → home page refreshes with new SystemCard.
   - Back Icon: At Step 2/3, navigates to previous step; at Step 1, closes the modal.

7. **CreateSystemModal Internal Interactions (Tablet)**
   - Every field visible in one scrollable card, split into two sections — "Personal Details" (Username, Email Address) then "Business Identity" (Store Name, Phone Number, Store Address, Store Category). Tap Next → creates the system → closes modal → home page refreshes.

8. **ProfileDialog Internal Interactions**
   - Tap Sign Out → logs out the merchant.
   - Tap Camera FAB → opens image picker to update profile photo.
   - Tap list items (Account Information, Your Businesses, etc.) → navigates to respective sub-screens.
   - Toggle Appearance Switch → toggles light/dark theme preference.
   - Tap Back Arrow / Go Back → closes the dialog and returns to Home Page.
