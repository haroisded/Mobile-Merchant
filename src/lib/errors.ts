import { PostgrestError } from '@supabase/supabase-js';
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

/**
 * The PostgREST error behind a failed call, so a screen can choose its copy for a case it expects —
 * `23505` a duplicate name, `23503` a row still in use — without ever rendering the message itself.
 *
 * `instanceof` rather than probing the shape, which only works because every query ends in
 * `.throwOnError()`. postgrest-js constructs the PostgrestError class only on that path
 * (dist/index.mjs:506, :526); the `error` a call returns without it is a plain object, and a thrown
 * copy of that is never an instance — which silently sent every caller to the generic copy until the
 * Products device run caught it. Anything else (a dropped connection, an Error thrown in a queryFn) is
 * correctly "not one": null, and the caller falls back to failureMessage's copy.
 */
export function postgrestError(cause: Error | null): PostgrestError | null {
  return cause instanceof PostgrestError ? cause : null;
}
