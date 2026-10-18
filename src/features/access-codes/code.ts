// Access codes as the app reads them: a typed code as claim_access_code takes it, a code as people say it, and
// the state the Codes tab shows. Import-free, so tools/check-logic.mjs can assert it. Nothing here lets anyone in:
// the database decides every claim (supabase/migrations/20261013213537_access_codes.sql).

/** Characters in a code: six of 23456789ABCDEFGHJKLMNPQRSTUVWXYZ, which nobody misreads (no 0/O, 1/I). */
export const CODE_LENGTH = 6;

/** What someone typed, as the code it means: upper case, without the dash and spaces — as claim_access_code reads it. */
export const normalizeCode = (typed: string) => typed.replace(/[\s-]/g, '').toUpperCase();

/** A code as people read and say it: A4F-7K2. */
export const formatCode = (code: string) => `${code.slice(0, 3)}-${code.slice(3)}`;

export type CodeStatus = 'active' | 'claimed' | 'used' | 'expired';

/**
 * Expired, else Used (approved requests fill every use), else Claimed (pending ones hold the uses left), else
 * Active. A declined request frees its use, as claim_access_code counts; a code for many people (max_uses null) is
 * never used up or claimed. Expired at the very instant: the claim refuses expires_at <= now().
 */
export function codeStatus(
  code: { expires_at: string | null; max_uses: number | null },
  requests: readonly { status: string }[],
  now: Date
): CodeStatus {
  if (code.expires_at !== null && Date.parse(code.expires_at) <= now.getTime()) return 'expired';
  if (code.max_uses === null) return 'active';
  const approved = requests.filter((request) => request.status === 'approved').length;
  const pending = requests.filter((request) => request.status === 'pending').length;
  if (approved >= code.max_uses) return 'used';
  return pending > 0 && approved + pending >= code.max_uses ? 'claimed' : 'active';
}

/** The new-code form's Expires choices. Custom is the end of a picked day, where the store is. */
export const EXPIRY_CHOICES = [
  { value: '5', label: '5 min' },
  { value: '30', label: '30 min' },
  { value: '60', label: '1 hour' },
  { value: 'custom', label: 'Custom' },
  { value: 'never', label: 'Never' },
] as const;

export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number]['value'];

/** create_access_codes' expiry arguments. One left out is the function's default: none. */
type ExpiryArgs = { p_expires_minutes?: number; p_expires_on?: string };

/** The form's expiry as create_access_codes' arguments: minutes from now, the end of `day`, or neither — never. */
export function expiryArgs(choice: ExpiryChoice, day: string): ExpiryArgs {
  if (choice === 'custom') return { p_expires_on: day };
  if (choice === 'never') return {};
  return { p_expires_minutes: Number(choice) };
}

const MINUTE = 60 * 1000;

/**
 * The Codes tab's expiry line: minutes under an hour (rounded up, so the last seconds still say 1 min), hours under
 * a day, then the last day it works. `lastDay` names that day for the instant just before it stops.
 */
export function expiryText(expiresAt: string | null, now: Date, lastDay: (beforeExpiry: Date) => string) {
  if (expiresAt === null) return 'No expiry';
  const left = Date.parse(expiresAt) - now.getTime();
  if (left <= 0) return 'Expired';
  const minutes = Math.ceil(left / MINUTE);
  if (minutes < 60) return `${minutes} min left`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h left`;
  return `Until ${lastDay(new Date(Date.parse(expiresAt) - 1))}`;
}

/** What claim_access_code answers. Only `requested` sent a request. */
export type ClaimStatus =
  | 'requested'
  | 'invalid'
  | 'expired'
  | 'used_up'
  | 'own_system'
  | 'already_member'
  | 'already_requested'
  | 'declined'
  | 'too_many_attempts';

/** The words for each answer. The store's name comes only with the answers that know which store it is. */
export function claimMessage(status: ClaimStatus, merchantName: string | null) {
  const system = merchantName ?? 'this store';
  switch (status) {
    case 'requested':
      return `Request sent. You'll be let into ${system} once its owner approves.`;
    case 'invalid':
      return "That code doesn't exist. Check it with the person who sent it.";
    case 'expired':
      return 'That code has expired. Ask for a new one.';
    case 'used_up':
      return 'That code has already been used. Ask for a new one.';
    case 'own_system':
      return `${system} is your own store.`;
    case 'already_member':
      return `You're already in ${system}. Open it from Home.`;
    case 'already_requested':
      return `You've already asked to join ${system}. Wait for its owner to approve you.`;
    case 'declined':
      return `The owner of ${system} declined you for this code. Ask them for another.`;
    case 'too_many_attempts':
      return 'Too many wrong codes. Try again in 15 minutes.';
  }
}
