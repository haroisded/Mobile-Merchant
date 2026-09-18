import * as SecureStore from 'expo-secure-store';

/**
 * Where supabase.ts keeps the session, and StoreTheme.ts the one-word theme preference.
 *
 * AsyncStorage writes plaintext — an unencrypted SQLite row on Android, an unencrypted file on
 * iOS. Anything with filesystem access on a rooted or jailbroken device, and any unencrypted
 * device backup, reads the refresh token straight out of it and can mint access tokens with it
 * until it is revoked. SecureStore puts the same string behind the iOS Keychain and the Android
 * Keystore instead.
 *
 * Structurally a SupportedStorage — getItem/setItem/removeItem, each allowed to return a promise
 * (auth-js/lib/types.d.ts:1556). Left unannotated on purpose: the type lives in @supabase/auth-js,
 * which is a transitive dependency this project does not declare, and createClient checks the
 * shape structurally at the call site anyway.
 */

// AFTER_FIRST_UNLOCK rather than the WHEN_UNLOCKED default (SecureStore.d.ts:72), under which a
// read while the device is locked fails outright. supabase.ts stops auto-refresh whenever the app
// leaves the foreground, so that read should never be attempted — this deletes the failure mode
// instead of depending on that. The item still never leaves the device: expo-secure-store never
// sets kSecAttrSynchronizable, so iCloud Keychain does not carry it.
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

// No chunking here, deliberately. Tutorials and other scaffolds split the session across numbered
// keys to stay under a 2048-byte SecureStore limit; that limit belonged to the RSA hybrid
// encryptor, which HybridAESEncryptor.kt:37 keeps only as a read path for Android API 22 and
// below — under SDK 57's floor. The live write path is AESEncryptor into SharedPreferences, and
// setItemAsync (SecureStore.js) validates only that the value is a string. Chunking now buys
// nothing and costs a torn-write window across the pieces.

// Every key auth-js writes is the storage key plus a suffix: `-user`, `-code-verifier`,
// `-flows-code-verifier`, and `-flow-<32 hex>-code-verifier` (helpers.js:268). All of them satisfy
// SecureStore's key rule, /^[\w.-]+$/ (SecureStore.js:152), so no key needs escaping. A `/` would
// throw, and auth-js only ever puts one in a *value* (helpers.js:392).

export const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key, options),

  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value, options),

  removeItem: (key: string) => SecureStore.deleteItemAsync(key, options),
};
