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

*Markers — see `INSTRUCTIONS-FOR-AI-AGENTS.txt`:*
*✅ implement now · 🏁 already implemented, leave alone · blank = render it, wire no behaviour*

**Top App Bar**
- Search IconButton (mobile)
- Notification Appbar.Action (tablet)
- Account Appbar.Action (tablet) 🏁

**Create New System Button** (mobile)
- Entire button (single clickable → opens CreateSystemModal) 🏁 *(implied by CreateSystemModal 🏁 ALL — a modal with no trigger is unreachable)*

**Action Card** (tablet)
- Entire card (single clickable → opens CreateSystemModal) 🏁 *(same trigger, wide layout)*

**SystemCard**
- Entire card (single clickable → goes to Systems Page w/the selected system) 🏁
- Edit Button
- Remove Button

**Navigation Bar**
- Home destination 🏁
- Notifications destination *(navigates to a stub screen — a bar cannot render a tab that switches to nothing; the screen itself is not built)*
- Settings destination *(same)*
- Account destination 🏁

**CreateSystemModal** ( 🏁 ALL ) *(revamped and rebuilt — `revamps/Thu_09-10-2026_13.59.58.10`)*
- Back IconButton (Top App Bar)
- Next Button (Step 1 — AccountStep) 🏁
- Next Button (Step 2 — BusinessIdentityStep) 🏁
- Country Selector (Phone Input Group — Menu anchor) 🏁
- SelectableCard options (Step 3 — StoreCategoryStep, 10 tappable cards)
- Continue Button (Step 3, trailing arrow icon) 🏁
- Next Button (tablet combined view) 🏁
- TextInputs (editable, but not "clickable" per se — they accept focus/tap):
  Username 🏁, Email Address 🏁, Store Name 🏁, Phone Number 🏁, Store Address 🏁

**ProfileDialog**
- Back Arrow (mobile Top App Bar) 🏁
- Camera FAB (edit profile photo overlay)
- Sign Out Button ( re-use the one already created ) 🏁
- List Item: Account Information (with chevron)
- List Item: Your Businesses (with chevron)
- List Item: Manage Devices (with chevron)
- List Item: Privacy Policy (with chevron)
- List Item: Terms of Service (with chevron)
- List Item: Appearance (Switch toggle)
- Go Back Button (tablet) 🏁
