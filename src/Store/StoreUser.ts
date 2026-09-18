import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '../lib/supabase';


type UserStore = {
  /**
   * Three states, not two: `undefined` until the first auth event arrives, `null` once
   * resolved and signed out, a `Session` once resolved and signed in.
   */
  session: Session | null | undefined;
};


/**
 * User state for the whole app. The session is the only field so far; anything else the signed-in
 * user needs (profile, preferences) belongs here next to it rather than in its own store.
 *
 * No setters: the store is written from one place, the subscription below.
 */
export const useUserStore = create<UserStore>( () => ({ session: undefined }) );

export const useSession = () => useUserStore((s) => s.session);

/**
 * Derived, never stored — two pieces of state could disagree. It has to be `=== undefined`
 * and not `!session`: `!undefined` and `!null` are both true, so `!session` cannot tell
 * "signed out" from "not known yet", and that is exactly the difference the splash depends on.
 */
export const useIsSessionLoading = () => useUserStore((s) => s.session === undefined);


// Subscribed at module scope, like the AppState listener in supabase.ts: one listener that should
// live as long as the app, so there is nothing to unsubscribe. Importing this module is what
// starts it. (Fast Refresh re-evaluating the file can register a duplicate in development; both
// write the same value, so it is a dev-only wart.)
//
// This one subscription is the only source of truth — no getSession() alongside it that could
// disagree. INITIAL_SESSION (restored from SecureStore) is emitted only after
// `await this.initializePromise` (GoTrueClient.js:3627,3635), so it lands a tick later rather than
// during this call. That gap is exactly what `undefined` names.
//
// The event is discarded on purpose: all six carry the current session, and the session alone
// decides what renders. Branching on the name would add states, not information.
//
// The callback stays synchronous. Not for the reason every tutorial gives — there is no auth lock
// to deadlock on unless you opt into the deprecated one — but because _notifyAllSubscribers awaits
// every callback in one Promise.all (GoTrueClient.js:4326-4334), so a slow one stalls the rest.
supabase.auth.onAuthStateChange((_event, session) => {
  useUserStore.setState({ session });
});
