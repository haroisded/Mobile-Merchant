# Device testing rules

How an agent tests a page or feature on the Android emulator. Read it before the first `adb`
command of a pass. What a screen should look like is [`visual-language.md`](./visual-language.md)
and [`layout.md`](./layout.md); how its data should behave is [`data-layer.md`](./data-layer.md).
This file is only how to exercise both on a running app without paying for the build.

## Rules

1. Never start the emulator or the app yourself. No `npm run android`, `expo run:android`,
   `emulator -avd …`, `npx expo start` or AVD creation. Stop and ask the human to open the emulator
   with the dev build installed and Metro running, and wait for them to say it is ready.
2. Before any other command, run `adb devices`. Exactly one `device` line means go. None, or only
   `offline` / `unauthorized`, means ask the human again, not start one.
3. Once the human says it is ready, you may do **anything** in the emulator: navigate, tap, type,
   sign in and out, pick any Google account or profile in the chooser, complete a Facebook login,
   create and remove merchants, toggle the network, force-stop and relaunch the app. Irreversible
   actions, **Delete account** above all, are allowed, but name each one in the report.
4. Test the page or feature in scope on all three layers, not just the one the change touched:
   the **frontend** (the screen), the **backend** (the rows and the logs), and the **app** (the
   navigation and the states around the screen). §3.
5. Read the screen as text before pixels. `uiautomator dump` first; a screenshot only when the
   check is visual, saved to the scratchpad; logs only as a filtered dump, never a stream. §4.
6. Stay on the page or feature you were asked about. Do not wander the rest of the app.
7. End with a report: what was exercised, pass or fail per layer, every irreversible action taken,
   and what stayed unverified with what would verify it. The same goes into the pass's
   System-History entry under **Verification**.
8. This file is the mechanics. How a run is organised — which cases, the temp-fold files
   (`flow-*.md`, `findings-*.md`), the findings loop the device Flow feeds, the circuit breaker,
   System-Test-History, silent operation — is [`testing-workflow.md`](./testing-workflow.md). A failed
   case is logged as a finding, never fixed mid-Flow. No `Tests.md` goes in a page directory.

The rest of this file is why, and the commands. Read it before overriding a rule, not before
following one.

**Contents**

1. [Why the human opens the emulator](#1-why-the-human-opens-the-emulator)
2. [What "anything" covers](#2-what-anything-covers)
3. [The three layers](#3-the-three-layers)
4. [Commands](#4-commands)
5. [What is deliberately not here](#5-what-is-deliberately-not-here)

---

## 1. Why the human opens the emulator

Booting an AVD and running `expo run:android` is minutes of native compile and Gradle output, then
a polling loop until Metro has served the bundle. For an agent every line of that is tokens spent
before the first tap. The human opens the emulator in seconds, and it is usually already running
from their own work.

The dev build only needs Metro. A JS-only change reaches the emulator through Fast Refresh with no
rebuild, so an agent never needs to build for a change under `src/`. A change that does need a
native rebuild — a new native dependency, `app.json` plugins — is a thing to tell the human, not
to run.

iOS is out of scope: this machine is Windows, so there is no simulator to ask for.

---

## 2. What "anything" covers

The human's authorisation is standing: once they have opened the emulator for you, you do not ask
again before each action. That includes the two places earlier passes stopped:

- **The Google account chooser.** Signing in means picking an account there. System-History 9.1
  stopped at the sign-in screen for exactly this reason; it is no longer a stopping point.
- **Profile actions.** Signing out, and Delete account from the Account tab or from Profile inside
  a system.

Delete account removes the `auth.users` row on the hosted project, and the cascade takes the
profile and every merchant with it (`ARCHITECTURE.md`, The database). It cannot be undone. It is
allowed; say in the report which account it was.

---

## 3. The three layers

**Frontend — the screen.** Compare against the page's mockup and `visual-language.md`: square
corners, theme colours, the accent only where §4 of that file lists it, left alignment, the right
Paper piece for each pattern. `app.json` locks the app to portrait, so a phone AVD only ever shows
the narrow anatomy. The wide one (rail, `DataTable`, side-by-side Register) needs a tablet AVD —
ask the human for one when the check needs it.

**Backend — the rows.** After an action that writes, confirm the write through the Supabase MCP
server `.mcp.json` already points at: a read-only `select` with `execute_sql`, scoped to the row the
action should have produced, and checked for the right `owner_id` or `merchant_id`. `get_logs` for
auth or Postgres errors when something failed. Reads only; the test data comes from the app, never
from SQL written by the agent.

**App — the states around the screen.**

- The auth flow: sign-in, sign-out and Delete account, and what the screen does across each. The
  cases and when they are mandatory are [`testing-workflow.md` §11](./testing-workflow.md) — one
  list, not two. This bullet used to carry the whole rule and was skipped for the whole of
  `test-001`, which is why the rule moved to the file that decides what a Flow must contain.
- Back navigation: the Android back chain, Profile back versus Back to your systems.
- Offline: turn the network off and confirm the paused copy renders instead of an endless spinner
  (`data-layer.md` §5), then turn it on and confirm a queued write lands.
- Errors: a failed action shows `failureMessage` copy, never a provider string.

---

## 4. Commands

`adb` is on `PATH`. The package is `com.haroised.mobilemerchant`.

| To | Run |
| --- | --- |
| Check the device | `adb devices` |
| Read the screen as text | `adb shell uiautomator dump /sdcard/ui.xml` then `adb exec-out cat /sdcard/ui.xml` |
| Tap | `adb shell input tap <x> <y>` — take the centre of a node's `bounds` from the dump |
| Swipe or scroll | `adb shell input swipe <x1> <y1> <x2> <y2> 300` |
| Type | `adb shell input text "<text>"` — `%s` for a space |
| Back, Enter | `adb shell input keyevent 4`, `adb shell input keyevent 66` |
| Screenshot | `adb exec-out screencap -p > <scratchpad>/screen.png`, then read the file |
| JS logs | `adb logcat -d -s ReactNativeJS:*` — `-d` dumps and exits |
| Clear logs first | `adb logcat -c` |
| Go offline / online | `adb shell svc wifi disable` + `adb shell svc data disable`, then `enable` |
| Restart the app | `adb shell am force-stop com.haroised.mobilemerchant` then `adb shell monkey -p com.haroised.mobilemerchant 1` |
| Metro unreachable | `adb reverse tcp:8081 tcp:8081` |
| Read a screen that never goes idle | `adb shell "timeout 12 uiautomator dump /sdcard/ui.xml"` — without `timeout`, a spinner or animation makes the dump wait forever |
| Check the emulator is not starved | `adb shell "grep MemAvailable /proc/meminfo; cat /proc/loadavg"` |

**Text before pixels.** A `uiautomator` dump gives every node's text and bounds for a fraction of
what an image costs, and it is what the taps need anyway. Take a screenshot when the question is
visual — a corner, a colour, an alignment — and not to find a button.

**Black screenshots.** System-History 9.1 recorded `adb screencap` returning black frames on this
setup. If that happens, keep going on the dump and say which visual checks it left unverified.

**A frozen emulator.** On 2026-09-14 the 2 GB Medium_Phone AVD ran out of memory mid-run:
`MemAvailable` 0 kB, load average 46, `system_server` and the app both in `D` state, and every dump,
screenshot and `am` command hung. Nothing inside the emulator recovers from that — ask the human to
give the AVD more RAM (4 GB) and cold boot it. Run every `adb` call a script chains behind a
host-side timeout, so a hang ends the call instead of the session. Two more things from the same
runs:

- `adb shell pkill -f uiautomator` matches its own shell's command line. Do not use it.
- Android's "Display over other apps" settings page opened twice mid-run, the second time with no
  swipe anywhere near it. It follows the dev client losing Metro (`Cannot connect to Expo CLI` in
  the logs): the dev client wants that permission for its floating **Tools** bubble and sends the
  device there. Leave it ungranted. Back from it returns to a restarted app, so relaunch instead —
  `am force-stop`, then `monkey` (the table above) — and dismiss the intro sheet and developer menu
  a relaunch opens (Continue, then Close).

---

## 5. What is deliberately not here

**No agent-started emulator or build.** §1. It is the cost this file exists to remove.

**No web target as a stand-in.** `npm run web` needs no emulator, but it is a different app for
the purposes of a test: `secure-storage.ts` writes to AsyncStorage instead of SecureStore, Google
sign-in is a redirect instead of the native sheet, and `layout.md` covers phones and tablets only.
It stays the right tool for session logic (README, Verify); it is not device testing.

**No screenshot per step.** §4.

**No mutating SQL to set up test data.** A row inserted by hand skips the RLS policies and the
form validation the test exists to exercise. Create it through the app.

**No UI automation framework.** Maestro or Detox would give repeatable flows, and a dependency,
config and a second place tests live. Nothing here runs unattended yet; add one when a flow is run
often enough to be worth scripting.

**No `Tests.md` in a page directory.** Version 10.3 briefly required one; the human replaced that
rule with [`testing-workflow.md`](./testing-workflow.md), where a run's cases live in
`.claude/context/temp-fold` while it runs and in `.claude/context/System-Test-History` after it.

**No `rm` inside an `adb shell` string, and no `//node` XPath, in a PowerShell command.** The
PowerShell tool's safety check reads both as deleting a system path and blocks the whole command.
Let `uiautomator dump` overwrite its file, read it only when the dump reports success, and walk the
XML with `GetElementsByTagName('node')`.
