import { Directory, File } from 'expo-file-system';

// The device's own file pickers, through expo-file-system 57.0.7 — Android's Storage Access Framework
// (node_modules/expo-file-system/android/.../FilePickerContract.kt: ACTION_OPEN_DOCUMENT and
// ACTION_OPEN_DOCUMENT_TREE), iOS's document picker. The one file that touches a file outside the app's own
// storage (.claude/instruction_mds/structure.md rule 6). No permission is asked for and none is in app.json:
// the person picks, and the system hands over that one file or folder.
//
// The module ships with `expo` and was already in the development build, so adding it to package.json needed
// no rebuild. Rejected: expo-document-picker and expo-sharing — two native packages and a rebuild, for a share
// sheet in place of "pick a folder" (the human's call, 2026-10-13).

/**
 * The picker never opened. Android, seen on the emulator on 2026-10-13: once the system has rebuilt the app's
 * window while the app was open — the text size changed in Settings — the module's picker launcher is no
 * longer registered (expo-modules-core's AppContextActivityResultRegistry.kt unregisters it with the old
 * window), and every pick rejects with "Attempting to launch an unregistered ActivityResultLauncher" until the
 * app is restarted. Nothing in JavaScript can register it again, so the screen says to restart.
 */
export class PickerUnavailableError extends Error {}

// What a picker's rejection means: the failure above, which is thrown on — or the person leaving the picker,
// which is nothing. A dismissal rejects too (PickerCancelledException, FileSystemModule.kt).
function leftPicker(cause: unknown): null {
  if (String(cause).includes('unregistered ActivityResultLauncher')) throw new PickerUnavailableError();
  return null;
}

/**
 * The name and text of a text file the person picks — null when they leave the picker without choosing.
 * Throws PickerUnavailableError when the picker did not open, and whatever reading meets when the file can't
 * be read as text.
 *
 * The (initialUri, mimeType) form, though the options form is the newer one: that one answers `canceled` for
 * every rejection (src/File.ts), the failure above included, and a button that does nothing is the result.
 * One type, so the widest that still means a CSV: by its ending a .csv file is text/csv or
 * text/comma-separated-values. iOS has no type for a wildcard and offers every file; the header check is what
 * refuses the wrong one.
 */
export async function pickTextFile(): Promise<{ name: string; text: string } | null> {
  let picked: File | File[];
  try {
    picked = await File.pickFileAsync(undefined, 'text/*');
  } catch (cause) {
    return leftPicker(cause);
  }
  const file = Array.isArray(picked) ? picked[0] : picked;
  return { name: file.name, text: await file.text() };
}

/**
 * Writes `text` as a new file in a folder the person picks, and answers the name it was given — the system
 * numbers it when the folder already has one ("items (1).csv") — or null when they leave the picker. Throws
 * PickerUnavailableError when the picker did not open, and whatever writing meets when the folder refuses the
 * file.
 *
 * There is no "save as" in the module (no ACTION_CREATE_DOCUMENT), hence the folder. Android does not let an
 * app use the Downloads folder itself or the top of the storage: Documents, or a folder inside either, works.
 */
export async function saveTextFile(name: string, mimeType: string, text: string): Promise<string | null> {
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch (cause) {
    return leftPicker(cause);
  }
  const file = folder.createFile(name, mimeType);
  file.write(text);
  return file.name;
}
