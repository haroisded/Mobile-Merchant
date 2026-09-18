# Profile — acceptance tests

Covers the **Profile** screen: the **Themes** row under **Preferences**, and the actions around it
(**Sign Out**, **Delete account**). The rows **Account Information**, **Your Businesses**,
**Manage Devices**, **Privacy Policy** and **Terms of Service** are not built yet — tapping them is
meant to do nothing, so they are not tested here.

## Test 1 - Title: The Themes row looks right

### What will be tested?
That the row is there, named **Themes**, with a paint palette on the left and a round-arrows button
on the right.

### What do you need before starting?
- Signed in, on a phone.

### Steps
1. Open **Profile** (the Account tab, or the account button inside a system).
2. Scroll to **Preferences**.
3. Look at the row.

### What's the expected output?
- The row reads **Themes**.
- On its left is a paint palette picture, not an empty square.
- On its right is a button with two arrows going in a circle, not an empty square.

## Test 2 - Title: The button changes the app between light and dark

### What will be tested?
That tapping the round-arrows button changes how the whole app looks, straight away.

### What do you need before starting?
- Signed in, on **Profile**, on a phone.

### Steps
1. Note whether the screen is light or dark.
2. Tap the round-arrows button on the **Themes** row.
3. Look at the screen.
4. Tap the button again.

### What's the expected output?
- After step 2 the screen changes to the other one — light becomes dark, or dark becomes light — with
  no waiting and no blank screen.
- After step 4 it is back to how it started.

## Test 3 - Title: The choice is still there after closing the app

### What will be tested?
That the app remembers which one was picked.

### What do you need before starting?
- Signed in, on **Profile**, on a phone.

### Steps
1. Tap the round-arrows button so the app is the opposite of what it started as.
2. Close the app fully (swipe it away from recent apps).
3. Open the app again.

### What's the expected output?
- The app opens in the one that was picked in step 1.
- It does not show the other one first, not even for a moment.

## Test 4 - Title: The choice beats the phone's own setting

### What will be tested?
That once the tester has picked, the phone's own dark-mode setting stops deciding.

### What do you need before starting?
- Signed in, on **Profile**, on a phone, and the phone's own dark mode turned **off**.

### Steps
1. In the app, tap the round-arrows button until the app is dark.
2. Leave the app and turn the phone's own dark mode **on**, then **off** again.
3. Return to the app.

### What's the expected output?
- The app stays dark the whole time.

## Test 5 - Title: The clock and the phone's icons stay readable

### What will be tested?
That the strip at the very top of the screen is readable in both.

### What do you need before starting?
- Signed in, on **Profile**, on a phone.

### Steps
1. Make the app light, and look at the clock and battery icons at the top of the screen.
2. Make the app dark, and look at them again.

### What's the expected output?
- The clock, battery and signal icons are clearly readable both times.
- Write down what the buttons at the very **bottom** of the screen (back, home) look like in each —
  they are known not to be handled yet, so report them rather than treat them as a failure.

## Test 6 - Title: Tapping the button many times quickly

### What will be tested?
That fast repeated taps do not leave the app half-changed.

### What do you need before starting?
- Signed in, on **Profile**, on a phone.

### Steps
1. Tap the round-arrows button eight times as fast as possible.
2. Stop and look at the screen.

### What's the expected output?
- The app settles on one of the two, all of it matching — no part of the screen left in the other one.
- Nothing freezes and the app does not close.

## Test 7 - Title: The rest of the app follows

### What will be tested?
That the choice is not only on the Profile screen.

### What do you need before starting?
- Signed in, on **Profile**, on a phone.

### Steps
1. Tap the round-arrows button.
2. Go back to the systems list.
3. Open a system and open **Products**.
4. Open one product.

### What's the expected output?
- Every screen in steps 2 to 4 is in the one that was just picked.

## Test 8 - Title: Themes on a tablet

### What will be tested?
That a tablet also gets the row, in its wider layout.

### What do you need before starting?
- Signed in, on a tablet. (The app is locked to portrait, so do not rotate it.)

### Steps
1. Open **Profile**.
2. Find **Preferences**.
3. Tap the round-arrows button.

### What's the expected output?
- **Preferences** and the **Themes** row are on the screen, under the account details card.
- The tablet's screen changes between light and dark the same way the phone's does.

## Test 9 - Title: Sign out and sign back in as the same person

### What will be tested?
That signing out does not undo the choice.

### What do you need before starting?
- Signed in, on **Profile**, on a phone.

### Steps
1. Tap the round-arrows button so the app is the opposite of what it started as.
2. Tap **Sign Out**.
3. Look at the sign-in screen.
4. Sign in again as the same person.

### What's the expected output?
- The sign-in screen in step 3 is already in the picked one.
- After step 4 the app is still in the picked one.

## Test 10 - Title: Sign in as a different person

### What will be tested?
That the choice belongs to the phone, not to the account.

### What do you need before starting?
- Two accounts on the same phone.

### Steps
1. As the first person, make the app dark. Sign out.
2. Sign in as the second person.
3. Open **Profile** and look at their name and email.

### What's the expected output?
- The app is dark for the second person too.
- The name and email shown are the second person's — none of the first person's details appear, not
  even for a moment.

## Test 11 - Title: Delete the account

### What will be tested?
That deleting the account ends the session and leaves the phone's look alone.

### What do you need before starting?
- A throwaway account that has at least one system, on a phone, with the app set to dark.

### Steps
1. Open **Profile** and tap **Delete account**.
2. Confirm.
3. Sign up again with the same way of signing in.

### What's the expected output?
- Step 2 lands on the sign-in screen, still dark.
- Step 3 starts with no systems.

## Test 12 - Title: No internet

### What will be tested?
That changing the look needs nothing from the internet.

### What do you need before starting?
- Signed in, on **Profile**, on a phone.

### Steps
1. Turn on airplane mode.
2. Tap the round-arrows button twice.
3. Close the app fully and reopen it.

### What's the expected output?
- Step 2 works both times, with no error and no spinner.
- Step 3 opens in the one that was picked.

## Test 13 - Title: A call arrives, and a long time in the background

### What will be tested?
That the look survives being interrupted.

### What do you need before starting?
- Signed in, on **Profile**, on a phone, app set to the opposite of the phone's own setting.

### Steps
1. Receive a call (or open a notification), then return to the app.
2. Leave the app in the background for 10 minutes, then return.

### What's the expected output?
- The app is in the picked one both times, and no sign-in is asked for.

## Test 14 - Title: Phone storage almost full

### What will be tested?
That the app can still remember the choice on a phone in poor shape.

### What do you need before starting?
- A phone with almost no free storage.

### Steps
1. Tap the round-arrows button.
2. Close the app fully and reopen it.

### What's the expected output?
- Step 1 changes the screen.
- Step 2 opens in the picked one. If it does not, write that down — it means the choice could not be
  saved.

---

**Sample records:** none. Nothing on this screen creates, edits or deletes a record of its own, so
the two-record cycle in the acceptance-test rules does not apply here. Test 11 is the one thing that
removes data, and it removes the account itself.
