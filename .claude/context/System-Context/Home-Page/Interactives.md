# Home Page ( this is after authentication )
*( note ):* keep the `sign-out` and `delete-account` functionality, we will still be using them 
later on, they're important 


## UI Components or Modals within this Page

- **Top App Bar**
- **Create New System Button** (mobile) / **Action Card** (tablet)
- **SystemCard** (repeated in Active Systems grid)
- **Navigation Bar**
- **CreateSystemModal** (multi-step wizard)
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

**CreateSystemModal**
- Back IconButton (Top App Bar)
- Next Button (Step 1 — UsernameStep)
- Next Button (Step 2 — BusinessDetailsStep)
- SelectableCard options (Step 3 — StoreCategoryStep, 10 tappable cards)
- Continue Button (Step 3)
- TextInputs (editable, but not "clickable" per se — they accept focus/tap)

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

2. **Top App Bar Avatar / Account Icon → ProfileDialog**
   - Tapping the Avatar (mobile) or Account Appbar.Action (tablet) opens the ProfileDialog (full-screen on mobile, centered modal on tablet).

3. **SystemCard Edit → Edit Flow**
   - Tapping Edit on any SystemCard triggers the edit flow for that specific system (likely opens a modal or navigates to edit screen — not detailed in provided specs).

4. **SystemCard Remove → Delete Confirmation**
   - Tapping Remove on any SystemCard triggers a delete confirmation flow (likely a dialog) before removal.

5. **Navigation Bar → Tab Switching**
   - Tapping any destination (Home, Notifications, Settings, Account) switches the active tab, updating the page content accordingly.

6. **CreateSystemModal Internal Interactions (Mobile)**
   - Step 1: Enter username → tap Next → progresses to Step 2.
   - Step 2: Enter store name/description → tap Next → progresses to Step 3.
   - Step 3: Select a category (SelectableCard) → tap Continue → creates the system → closes modal → home page refreshes with new SystemCard.
   - Back Icon: At Step 2/3, navigates to previous step; at Step 1, closes the modal.

7. **CreateSystemModal Internal Interactions (Tablet)**
   - All steps visible in one scrollable card. Tap Next → creates the system → closes modal → home page refreshes.

8. **ProfileDialog Internal Interactions**
   - Tap Sign Out → logs out the merchant.
   - Tap Camera FAB → opens image picker to update profile photo.
   - Tap list items (Account Information, Your Businesses, etc.) → navigates to respective sub-screens.
   - Toggle Appearance Switch → toggles light/dark theme preference.
   - Tap Back Arrow / Go Back → closes the dialog and returns to Home Page.
