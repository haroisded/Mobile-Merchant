import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import type { Database } from './database.types';
import { secureStorage } from './secure-storage';


const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;


if (!url || !publishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_KEY. ' +
      'Copy .env.example to .env, fill it in, then restart the dev server.'
  );
}


// Typed from the real schema, which is what makes runtime validation of reads unnecessary: every
// .from('merchants').select() is checked end to end against the migration rather than against a
// hand-written Zod mirror of it (instruction_mds/data-layer.md §4).
//
// Regenerate whenever a migration lands. A stale database.types.ts is worse than none — it
// type-checks against a schema that no longer exists:
//   supabase gen types typescript --linked > src/lib/database.types.ts
export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    // Keychain / Keystore rather than plaintext AsyncStorage, and still load-bearing: without a
    // `storage` the client falls back to an in-memory adapter (GoTrueClient.js:237-251) and the
    // session dies with the process.
    storage: secureStorage,
    flowType: 'pkce',

    // The only instrumentation that reaches inside detectSessionInUrl on web, where failures
    // are otherwise completely silent. __DEV__ is stripped from release builds; debug output
    // can contain token material.
    debug: __DEV__,
  },
});


if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
