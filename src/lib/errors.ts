import { PostgrestError } from '@supabase/supabase-js';
import { onlineManager } from '@tanstack/react-query';

// What a failed action puts on screen when there is no connection. One string, because the cause is
// the same everywhere and the advice does not change with the action.
const OFFLINE_MESSAGE = "You're offline. Reconnect and try again.";

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
 * The PostgREST error behind a failed write, when there is one — so a screen can pick its own copy for a
 * case it expects (a duplicate name is SQLSTATE 23505, an overlapping fiscal year 23P01) instead of the
 * generic failure line. `.throwOnError()` is what makes this a real PostgrestError rather than a plain
 * object (.claude/instruction_mds/data-layer.md §2). Anything else — a dropped connection, an Error thrown
 * in a mutationFn — is not one: null, and the caller falls back to failureMessage's copy.
 */
export function postgrestError(cause: Error | null): PostgrestError | null {
  return cause instanceof PostgrestError ? cause : null;
}

// A delete refused because a record of these still names the one deleted. Keyed by the referencing table,
// which Postgres names last in a 23503: `… violates foreign key constraint "…" on table "stock_settings"`.
const USED_BY = new Map([
  ['item_groups', "It's an item group's default. Clear it on the item group first."],
  ['item_group_taxes', "It's in an item group's Item Tax rows. Remove that row first."],
  ['tax_rules', 'A tax rule uses it. Change or delete that rule first.'],
  ['selling_settings', "It's the Default Price List in Selling Settings. Pick another there first."],
  ['stock_settings', "It's a default in Stock Settings. Pick another there first."],
]);

/**
 * The words for a delete refused by one of the settings, item groups or tax rules naming the record — null
 * for any other refusal, so each screen keeps its own copy for the references it already had.
 */
export function usedElsewhere(cause: Error | null): string | null {
  const error = postgrestError(cause);
  if (error?.code !== '23503') return null;
  return USED_BY.get(/on table "(\w+)"$/.exec(error.message)?.[1] ?? '') ?? null;
}

/** The line under a form or confirm: an offline wait, or what went wrong. */
export type Notice = { type: 'error' | 'info'; text: string };

/**
 * A mutation's notice. Paused before error: a write queued while offline is waiting, not failed
 * (.claude/instruction_mds/data-layer.md §5). `errorText` is the caller's copy for the failure it expects,
 * usually from failureMessage(). `fallback` is the screen's own error — a failed validation — shown
 * when the write has nothing to say.
 */
export function mutationNotice(
  mutation: { isPaused: boolean; isError: boolean },
  errorText: string,
  fallback: string | null = null
): Notice | null {
  if (mutation.isPaused) return { type: 'info', text: 'Waiting for a connection. This finishes on its own when you reconnect.' };
  if (mutation.isError) return { type: 'error', text: errorText };
  return fallback === null ? null : { type: 'error', text: fallback };
}
