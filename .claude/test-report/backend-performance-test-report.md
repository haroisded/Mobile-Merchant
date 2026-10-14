# Backend performance — test report

Run on 2026-10-15 (UTC 2026-10-14 17:30–17:58) by the agent: the Android phone emulator on the human's Metro (:8081, dev
build), the owner account and Toy 1, and the Supabase project's own logs. What prompted it: on the APK, sign-out,
Delete account and screens that load several things at once are sometimes very slow.

**Bar for PASS:** the server-and-network part of the step is under 1 s on every run. FAIL carries what was measured.

## How it was measured, and what a dev build can show

Supabase's performance is measured at Supabase, so the build does not change it.

- **Edge logs** (`query_logs`, source `edge_logs`): every request's start, `response.origin_time` (edge → server → edge)
  and `x_envoy_upstream_service_time` (inside the API server). The APK makes the same requests, so these numbers are the
  APK's.
- **`pg_stat_statements`**: database time per query, as a delta across the run.
- **`EXPLAIN ANALYZE`**: in rolled-back transactions, as the owner, for system creation and account deletion.
- **logcat markers on the device:** `log -t PERF` at each tap, plus auth-js's `debug: __DEV__` lines. These show when a
  session is saved or removed.
- **Not representative:** JavaScript and drawing in a dev build. A screen "seen" time comes from a uiautomator poll of
  about 1 s and is an upper bound. App start is also inflated, because the dev build loads its bundle from Metro.
- **Re-checking on the APK:** use the edge-log query at the end of this file.

## Test 1 - Title: Network distance (this PC → Supabase)
**Status:** PASS
**Run:** 2026-10-15

- **Edge:** Cloudflare Hong Kong (HKG). TCP connect takes 58–108 ms; a warm REST request from this PC, the emulator's
  network, takes a median of ~150 ms (141–171 ms).
- **Edge → project:** 60–83 ms; `/auth/v1/health` shows `origin_time` 60–65 ms with 0 ms upstream.
- **Moving the project's region would gain little.** About 150 ms per request is distance.

## Test 2 - Title: Systems list right after sign-in or app start (5 requests at once)
**Status:** FAIL
**Run:** 2026-10-15

On a cold API server, each of the 5 requests takes 0.7–2.9 s:

| When | Idle before | Upstream per request | Origin per request |
|---|---|---|---|
| 17:38:09 (owner sign-in) | ~5 min | 2.88–3.00 s | 3.34–3.40 s |
| 17:45:03 (Toy 1 sign-in) | 1 m 40 s | 1.82–1.92 s | 1.92–2.03 s |
| 17:47:50 (Toy 1 sign-in) | 43 s | 1.12–1.23 s | 1.27–1.32 s |
| 17:51:39 (app relaunch) | 31 s | 0.67–0.71 s | 0.93–0.95 s |
| 17:57:33 (cold app start) | ~3 min | 0.90–0.96 s | 1.56–1.61 s |
| 17:51:08 (warm) | 4 s | 0.09–0.21 s | 0.15–0.28 s |

- **The requests waited for new database connections.** `pg_stat_activity` shows PostgREST opening one connection per
  request after a pause (the first new backend started 0.66–0.92 s after the requests reached the edge).
- **The queries themselves are fast.** `pg_stat_statements` puts each at a few ms.
- **Idle limit.** Connections idle for more than roughly 30–40 s were replaced at their next use. That fits PostgREST's
  default 30 s idle limit, which the hosted project does not expose.
- **The notification poll does not keep them warm,** because it runs once a minute.

## Test 3 - Title: Any request on a connection that has not run it yet
**Status:** PASS
**Run:** 2026-10-15

Each database connection loads table and function definitions the first time it runs a query. The same query, cold and
warm:

| Query | First run on a connection | Warm |
|---|---|---|
| `uoms` list with its RLS check | 69.6 ms (771 buffers) | 1.3 ms (4 buffers) |
| `my_permissions` | 110.6 ms | 0.8 ms |

- **Device-run deltas (first run on that connection):** warehouses 300 ms, my_permissions 115 ms, system_settings
  83 ms, cost_centers 48 ms, accounts 41 ms, uoms 4 ms.
- **This is why requests take 120–250 ms upstream on most screens** even when warm. A screen's parallel requests land on
  connections that have not seen those queries.
- **RLS is not the cost.** `private.permitted_merchant_ids` is evaluated once per query (a hashed SubPlan with one loop),
  not once per row.

## Test 4 - Title: Open a system
**Status:** FAIL
**Run:** 2026-10-15

`my_permissions` origin by run:

| When | Origin |
|---|---|
| 17:40:02 | 0.44 s |
| 17:41:02 | 0.14 s (warm) |
| 17:50:36 | 0.51 s |
| 17:53:00 | 1.08 s (cold) |
| 17:57:41 | 0.16 s (warm) |

## Test 5 - Title: Dashboard, first visit
**Status:** PASS (after the fix below)
**Run:** 2026-10-15

- **Before:** the screen asked for System Settings (its time zone) and only then for its 5 reports. The reports went out
  1.0 s later at 17:40:47 and 0.68 s later at 17:50:43.
- **After:** System Settings is already loaded when the system opens. The reports go out at the tap: 17:53:07 and
  17:57:49, with no System Settings request on the Dashboard.
- **Reports:** 0.15–0.31 s origin each, in parallel.

## Test 6 - Title: Items list, then an item's form
**Status:** PASS
**Run:** 2026-10-15

- **Items:** 3 requests at once, 0.24–0.30 s origin.
- **Item form, first wave:** 5 requests at once, 0.56–0.85 s origin, on new connections.
- **Item form, second wave:** 3 more requests (cost centers, accounts, tax categories) 0.6–0.9 s later, 0.18–0.33 s
  origin each. That is a waterfall the form could avoid (Recommendation 4).

## Test 7 - Title: Create System
**Status:** FAIL
**Run:** 2026-10-15

- **The form's lists:** countries 0.13 s and currency presets 0.12 s origin.
- **Create (Toy 1, on the device):** 1.37 s in the database alone (`pg_stat_statements` delta). Tap to the new system on
  the list: ≤ 5.0 s (poll).
- **Rolled-back `EXPLAIN ANALYZE`:** 0.84–1.58 s for a connection's first inserts, 0.14–0.15 s once warm.
  - One trigger is most of it: `merchants_seed_30_defaults` → `private.seed_defaults_for`, at 816 ms cold and 111 ms warm.
  - It looks the country's time zone up in `pg_catalog.pg_timezone_names`, which reads all 1,196 zones on every call:
    55–60 ms per lookup, against 0.005–0.45 ms for `now() at time zone 'Asia/Manila'`.
  - The `system_settings_time_zone` trigger (`private.validate_time_zone`) does the same lookup again. It is the likely
    cause of the System Settings save's 690 ms average (13 saves in `pg_stat_statements`).

## Test 8 - Title: Sign out
**Status:** FAIL
**Run:** 2026-10-15

| Run | Tap → session removed | `/auth/v1/logout` origin | Before the request |
|---|---|---|---|
| Owner 17:43 | 1.74 s | 1.53 s (auth server itself 0.67 s) | ≤ 0.15 s |
| Toy 1 17:47 | 0.54 s | 0.32 s | ≤ 0.15 s |
| Owner 17:51 | 0.73 s | 0.45 s | ≤ 0.15 s |

- **The auth server's round trip is what varies.** auth-js waits for it before it clears the session, even with
  `scope: 'local'` (`GoTrueClient.js:3419-3441`).
- **Google sign-out is not the slow part.** Google's native sign-out and the JavaScript before the request take at most
  0.15 s.
- **After the session is cleared:** SIGNED_OUT takes 0.19–0.21 s. The sign-in screen was seen 2.6–3.8 s after the tap,
  but in a dev build drawing it is the slowest part, so the APK should be quicker.

## Test 9 - Title: Delete account (Toy 1, with one seeded system)
**Status:** FAIL
**Run:** 2026-10-15

From tap to session removed: 1.27 s.

| Step | Time |
|---|---|
| `delete_current_user` RPC | 0.61 s origin, of which 0.47 s in the database (the cascade through the system) |
| `/auth/v1/logout` afterwards | 0.26 s, answered 403: the user is already gone |

- **In rolled-back SQL, deleting a user** took 0.20 s with 3 systems on a warm connection and 0.46 s with 2 on a cold one.
- **The sign-in screen** was seen ≤ 3.4 s after the tap (poll).
- **Toy 1 afterwards:** its Supabase user and the test system are gone, as agreed. Its Google account is still on the
  phone, and signing in again creates a new user.

## Test 10 - Title: One run during a forced checkpoint (outlier)
**Status:** FAIL
**Run:** 2026-10-15

- **What happened:** at 17:52:08 the Google sign-in token call took 4.47 s (3.3 s upstream). The systems-list burst then
  took 11.1 s per request (8.4–10.6 s upstream).
- **What it lined up with:** Postgres logged `checkpoint starting: immediate force wait` at 17:52:06 and a connection reset
  at 17:52:10. Auth and the API were slow together.
- **Reading:** a platform-side event on a small instance (aarch64, 224 MB `shared_buffers`, 60 connections) with no
  headroom. The checkpoint before it had written 49 MB of WAL, partly from my rolled-back test inserts. This run is not
  in any figure above.

## Fix made in this pass

`src/app/(app)/systems/[id]/_layout.tsx`: the system shell subscribes to `useSystemSettingsQuery`. System Settings now
loads beside `my_permissions` when a system opens, instead of on the first screen that needs it. That screen is the
Dashboard (its time zone) or any amount formatted by it.

| | Before | After |
|---|---|---|
| Dashboard reports start | 0.68–1.0 s after the tap | at the tap |
| System open | 1 request | 2 at once (0.14–1.08 s origin, same wave) |

- Every permission reads System Settings (`public.permission_rules`), and the client has `retry: false`, so nobody gets
  a retry storm.
- Checks: lint 0, typecheck 0, `check:logic` pass, fallow PASS, ponytail review: lean.

**Rejected, with the numbers:**
- **Running Google sign-out alongside Supabase's.** Everything before the logout request is ≤ 0.15 s of a 0.54–1.74 s
  sign-out.
- **Prefetching countries at app start.** That fetch costs 0.12–0.19 s once, on a rarely used form. It would also add
  2 requests to the sign-in burst, the coldest moment, where each extra request needs another new connection
  (Test 2).
- **`gcTime: Infinity` for reference data.** No measured cost to remove.

## Your prefetch idea, and `database-improvements.txt`

- **No conflict with `database-improvements.txt`.** Prefetching is client caching (TanStack Query), while that pass
  changed indexes, table storage and function bodies inside Postgres. A prefetch sends the same queries the screen would
  have sent.
- **Prefetch pays only for data the next screen is certain to wait on, fetched while nothing else is.** System Settings
  at system open is that case, and it is done (0.7–1.0 s off the first Dashboard).
- **Countries do not need it.** They are small (250 rows) and already never refetched once loaded. The slow part of
  creating a system is the database seed (Test 7), not the country list.

## Recommendations not done (each needs your go-ahead)

1. **Create System and the System Settings save: drop the `pg_timezone_names` lookups** in
   `private.seed_defaults_for` and `private.validate_time_zone`.
   - Validate a zone with `now() at time zone <zone>` inside an exception block instead.
   - Expected: Create System's database time from 1.4 s to well under 0.5 s cold, and the settings save from ~0.7 s to
     milliseconds.
   - Needs a migration with its revert.
2. **The cold API server after a pause (Test 2).** This is the most likely cause of the APK's "sometimes very slow".
   - **The hosted lever is compute size.** A larger instance starts connections and loads definitions faster. Not
     measured here: check the plan's compute in the dashboard first.
   - **The app-side lever is fewer requests at once.** The systems list sends 5 at sign-in. Access Codes, the access
     requests and the Notifications list could load when their tabs open, which means 2 new connections instead of 5.
     Re-measure with the query below before keeping it.
3. **Sign out:** clearing the session on the phone before the server answers would remove the 0.3–1.5 s wait. But it
   changes what happens offline (today an offline sign-out says "Couldn't sign out"), so it is not low-risk.
4. **Item form:** start its second wave (cost centers, accounts, tax categories) with the first.
5. **Schema-cache reloads (dev only).** Every migration makes PostgREST reload its schema cache, running
   `SELECT name FROM pg_timezone_names` (684 ms average, 153 calls). That happens after DDL, not in normal use.

## Re-measuring on the APK

Use the APK for a while, then run this through the Supabase MCP `query_logs`, with the time window set to the session:

```sql
select formatDateTime(timestamp, '%H:%i:%S') as t, log_attributes['request.method'] as m,
  substring(replaceRegexpAll(log_attributes['request.url'], '^https://[^/]+', ''), 1, 90) as url,
  log_attributes['response.status_code'] as st,
  toInt32OrZero(log_attributes['response.origin_time']) as origin_ms,
  toInt32OrZero(log_attributes['response.headers.x_envoy_upstream_service_time']) as upstream_ms
from logs where source = 'edge_logs' and log_attributes['request.headers.user_agent'] not like '%mgmt-api%'
order by timestamp
```

How to read the results:
- Requests sent together with large `upstream_ms` are a cold server (Test 2).
- A gap between two requests on one screen is a waterfall.
- `origin_ms` minus `upstream_ms` is the distance to the server.
