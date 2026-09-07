import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Native: mobilemerchant://  — allow-list this in Supabase as `mobilemerchant://**`.
 * Web:    http://localhost:8081 (createURL.web.js:15 strips the trailing slash).
 * Log it rather than assume it: createURL returns a different string per environment.
 */
export const redirectTo = Linking.createURL('/');


// configure() must run before any other GoogleSignin call. The package ships a web build whose
// methods only warn, so this is skipped on web to keep that warning out of the console.
if (Platform.OS !== 'web') {
  GoogleSignin.configure({
    // Android verifies the ID token against the *web* client ID — which is why .env.example has
    // no Android entry. iosClientId defaults to GoogleService-Info.plist; this project ships
    // none, so it is required here rather than optional.
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
}


/** A cancelled sign-in resolves quietly. Everything else throws. */
export type SignInResult = 'signed-in' | 'cancelled';

export async function signInWithGoogle(): Promise<SignInResult> {
  // The native module has no real web implementation, so web takes the browser flow instead.
  if (Platform.OS === 'web') return browserOAuth('google');

  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  // SignInResponse is success | cancelled in v16 — a cancel is a response, not a thrown error.
  if (!isSuccessResponse(response)) return 'cancelled';

  const idToken = response.data.idToken;
  if (!idToken) throw new Error('Google returned no ID token — check your client IDs.');

  // No redirect, no PKCE, no app scheme: this whole path is immune to redirect misconfiguration.
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;
  return 'signed-in';
}

/** Facebook has no native module here: Supabase hosts the whole handshake in the browser. */
export function signInWithFacebook(): Promise<SignInResult> {
  return browserOAuth('facebook');
}

export async function signOut() {
  // Supabase alone leaves the native Google session cached, so the next sign-in silently
  // reuses the last account instead of showing the picker.
  if (Platform.OS !== 'web') {
    await GoogleSignin.signOut().catch(() => {}); // never signed in with Google: nothing to clear
  }

  // The default scope is 'global', which ends the session on every device this user is signed
  // in on. It is also a server call, so it throws when offline — stranding the user signed in.
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

/**
 * Ends the account, not just the session — irreversible, so the screen confirms first.
 *
 * The delete itself runs in Postgres (`delete_current_user`, in the profiles migration) because no
 * client-side key may write to auth.users: the publishable key is in the app bundle, and the
 * service role key must never be. The cascade on public.profiles.id takes the profile row with it.
 */
export async function deleteAccount() {
  const { error } = await supabase.rpc('delete_current_user');
  if (error) throw error;

  // The account is gone, so there is no server-side session left to revoke — this is only here to
  // clear local storage and emit the SIGNED_OUT event the root layout's guard is watching for.
  await signOut();
}

/** A repeated query param arrives as an array; only the first copy is the value. */
function oneValue(param: Linking.QueryParams[string]): string | undefined {
  return Array.isArray(param) ? param[0] : param;
}


/** PKCE in a system browser, finished by a deep link back into the app. */
async function browserOAuth(provider: 'google' | 'facebook'): Promise<SignInResult> {
  // This call also writes the PKCE code verifier into the storage configured in supabase.ts.
  // That side effect is undocumented, and it is what the exchange below reads back.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      // Facebook's own cookie survives Cancel, so the next attempt re-offers the same account.
      // auth_type=reauthenticate forces its login screen, where another account can be entered.
      queryParams: provider === 'facebook' ? { auth_type: 'reauthenticate' } : undefined,
    },
  });
  if (error) throw error;


  // On web the library has already navigated the page away, and detectSessionInUrl performs the
  // exchange when it reloads on the ?code= URL. Nothing below this line runs there.
  if (Platform.OS === 'web') return 'signed-in';


  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    // iOS only: no shared browser cookies, so each attempt starts logged out of the provider.
    preferEphemeralSession: true,
  });

  if (result.type !== 'success') {
    // A Supabase allow-list miss looks identical to a user cancel here — the auth session only
    // reports that it closed, not why. Log the exact redirectTo the allow-list has to match.
    console.warn('[auth] auth session closed without a redirect', { redirectTo, result });
    return 'cancelled';
  }


  // parse() always returns a queryParams object (createURL.js:124,161). The `?? {}` is for the
  // type, which is QueryParams | null (Linking.types.d.ts:12), not for a null it can produce.
  const params = Linking.parse(result.url).queryParams ?? {};

  // A user cancel does not come back as a browser dismiss. The provider redirects normally and
  // puts the denial in the URL — error=access_denied, per OAuth 2.0, with Facebook riding
  // error_reason=user_denied alongside it and an error_description of "Permissions error". So the
  // prefix matches, result.type is 'success', and without this line pressing Cancel throws and
  // paints "Permissions error" on the sign-in screen. Both providers use this path, which is why
  // the check lives here and not in a Facebook branch.
  if (oneValue(params.error) === 'access_denied') return 'cancelled';

  // auth-js treats any of these three as the error signal (GoTrueClient.js:3238) and does not
  // assume a description arrives (:3241). Reading only error_description lets a provider denial
  // with no description fall through to the "no authorization code" throw and misname itself.
  const providerError = oneValue(params.error_description) ?? oneValue(params.error) ?? oneValue(params.error_code);
  const code = oneValue(params.code);
  if (providerError) throw new Error(providerError);
  if (!code) throw new Error('No authorization code in the redirect URL.');

  // flowId picks the verifier this flow stored. Without it the newest one is used, so a second
  // flow started meanwhile would burn this single-use code against the wrong verifier.
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
    code,
    data.flowId ? { flowId: data.flowId } : undefined
  );
  if (exchangeError) throw exchangeError;
  return 'signed-in';
}
