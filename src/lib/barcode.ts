/**
 * Which of the camera's barcode reports count (src/screens/scan). The camera reports a barcode on every frame it
 * stays in view, and one frame can misread a skewed or half-seen barcode as another valid code — seen on the
 * emulator, where a slanted EAN-13 came back once as a UPC-A that is no product's. So a code counts only once
 * CONFIRM_FRAMES frames running agree on it, and then only when it is not the code just taken: at the Register
 * (`repeats`) the same code counts again after SAME_CODE_MS out of view, so holding a jar up adds one and showing
 * it twice adds two; on the Item form never — taking the label's picture pauses the scanner for longer than that,
 * and the code it reports again would cover what the label said. Import-free: npm run check:logic runs it.
 */
export const CONFIRM_FRAMES = 3;
export const SAME_CODE_MS = 2000;

export type Sightings = { code: string; frames: number; taken: string; at: number };

export const noSightings = (): Sightings => ({ code: '', frames: 0, taken: '', at: 0 });

/** Records one frame's code in `seen` and answers whether it counts as a new scan. */
export function sighted(seen: Sightings, code: string, now: number, repeats: boolean) {
  seen.frames = code === seen.code ? seen.frames + 1 : 1;
  seen.code = code;
  if (seen.frames < CONFIRM_FRAMES) return false;
  const fresh = code !== seen.taken || (repeats && now - seen.at >= SAME_CODE_MS);
  seen.taken = code;
  seen.at = now;
  return fresh;
}
