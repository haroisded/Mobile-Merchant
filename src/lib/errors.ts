import { onlineManager } from '@tanstack/react-query';

// What a failed action puts on screen when there is no connection. One string, because the cause is
// the same everywhere and the advice does not change with the action.
export const OFFLINE_MESSAGE = "You're offline. Reconnect and try again.";

/**
 * The message a failed action shows the user. Never the provider's own string.
 *
 * A PostgREST or GoTrue message is written for whoever is reading the logs — it names columns,
 * policies and constraints — so putting it on screen tells the user nothing they can act on and
 * leaks the shape of the schema. The caller passes copy written for the user instead, and this
 * function only decides whether the connection is the better explanation.
 *
 * It deliberately does not take the error. Discarding that string IS the fix, so a parameter
 * carrying a value nothing reads would only imply otherwise — and `anti-slop/no-unknown-parameters`
 * rejects an `unknown` parameter unless it is named `cause`, which a caught value is not.
 *
 * `onlineManager` rather than sniffing the error shape: src/lib/query.ts already wires it to
 * expo-network, so it is the app's one answer to "is there a connection", and a fetch failure has
 * no stable shape to match on across supabase-js, GoTrue and the platform's own fetch.
 */
export function failureMessage(fallback: string): string {
  return onlineManager.isOnline() ? fallback : OFFLINE_MESSAGE;
}
