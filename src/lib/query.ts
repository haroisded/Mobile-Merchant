import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState } from 'react-native';

// The one place a millisecond literal is written. Query hooks name a constant from here rather than
// inlining `5 * 60 * 1000`, so the freshness policy is readable in one file instead of scattered
// across every feature folder (.claude/instruction_mds/data-layer.md §5).
export const STALE = {
  SECONDS: { THIRTY: 30 * 1000 },
  MINUTES: { ONE: 60 * 1000, FIVE: 5 * 60 * 1000 },
  // Stale at once, so every visit asks again. Leaving `staleTime` off a query does not do this: it takes
  // the client's five-minute default below.
  ALWAYS: 0,
  // Reference data a migration seeds and no client can write (countries, currency presets): it cannot
  // change while the app runs, so it is fetched once and never refetched, invalidation included.
  STATIC: 'static' as const,
};

// The most rows a ledger report or a list of documents asks for in one request; the report says so when it
// has that many (src/components/ledger-filters.tsx).
//
// ponytail: one page, newest first. Past it a report needs paging — FlashList over an infinite query
// (.claude/instruction_mds/frontend.md §4.2) — until then its filters are how an older row is reached.
export const LEDGER_PAGE = 200;

// Module scope, like the auth subscription in Store/StoreUser.ts and the refresh listener in
// supabase.ts: one listener for the life of the process, so there is nothing to tear down.
//
// Without this, queries never learn they are offline — React Query's default online detection is a
// browser `online`/`offline` event that does not exist in React Native, so it assumes permanently
// connected and every request fails on its own timeout instead of pausing.
//
// expo-network rather than @react-native-community/netinfo purely because it is already a
// dependency.
onlineManager.setEventListener((setOnline) => {
  // The listener fires on *changes*. It never reports the state the app launched in, so a device
  // that starts offline would look online until connectivity happened to change. getNetworkStateAsync
  // fills that first value in; `initialised` stops the async answer landing after — and overwriting
  // — a real event that has already arrived.
  let initialised = false;

  const subscription = Network.addNetworkStateListener((state) => {
    initialised = true;
    setOnline(!!state.isConnected);
  });

  Network.getNetworkStateAsync()
    .then((state) => {
      if (!initialised) setOnline(!!state.isConnected);
    })
    .catch(() => {
      // Rejects on some platforms and SDK versions. The listener is the primary source; losing the
      // initial reading degrades to React Query's optimistic default rather than breaking anything.
    });

  return subscription.remove;
});

// React Native has no window focus event either, so `refetchOnWindowFocus` has nothing to listen to
// until AppState is wired to focusManager.
//
// This is NOT the AppState listener in supabase.ts. That one starts and stops Supabase's token
// refresh timer; this one tells React Query the app came back to the foreground. Both exist, and
// neither substitutes for the other.
AppState.addEventListener('change', (status) => {
  focusManager.setFocused(status === 'active');
});

// A factory, not a shared singleton. The provider builds one client per signed-in user and throws it
// away on account switch — see the `key` on QueryProvider in src/app/_layout.tsx.
export const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // Fail fast and show the user a result with a retry control, rather than three silent
        // attempts with backoff while the screen sits on a spinner. Opt back in per query.
        retry: false,

        // On mobile this fires on every app resume, which is far more often than on the web where
        // the default was chosen. Enable per query where it earns it.
        refetchOnWindowFocus: false,

        staleTime: STALE.MINUTES.FIVE,
      },
    },
  });
