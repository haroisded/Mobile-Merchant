import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extends app.json so the Google iOS URL scheme comes from the same .env value the
 * runtime uses — one place to change, no reversed client ID pasted into two files.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  // Google's iOS URL scheme is the client ID with its dot-separated parts reversed:
  // 1234-abc.apps.googleusercontent.com -> com.googleusercontent.apps.1234-abc
  const iosUrlScheme = iosClientId
    ? `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`
    : 'com.googleusercontent.apps.PLACEHOLDER';

  return {
    ...config,
    name: config.name ?? 'Mobile Merchant',
    slug: config.slug ?? 'mobile-merchant',
    // Bundle ID and Android package live in app.json — Google's OAuth clients are registered
    // against that exact package, so overriding it here silently breaks native Google Sign-In.
    plugins: [
      ...(config.plugins ?? []),
      ['@react-native-google-signin/google-signin', { iosUrlScheme }],
    ],
  };
};
