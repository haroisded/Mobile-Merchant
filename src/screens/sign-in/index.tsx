import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { HelperText } from '../../components/helper-text';
import { Surface } from '../../components/surface';
import { Text } from '../../components/text';
import { signInWithFacebook, signInWithGoogle } from '../../lib/auth';
import { failureMessage } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';

type Provider = 'google' | 'facebook';

export function SignInScreen() {
  const { colors } = useAppTheme();
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (provider: Provider) => {
    setBusy(provider);
    setError(null);
    try {
      await (provider === 'google' ? signInWithGoogle() : signInWithFacebook());
    } catch (e) {
      // A cancelled sign-in resolves quietly, so anything caught here is a real failure.
      //
      // The GoTrue message itself goes to the dev console only — __DEV__ is stripped from release
      // builds — and the screen gets copy the user can act on (.claude/instruction_mds/data-layer.md §5).
      if (__DEV__) console.warn('[sign-in]', e);
      setError(failureMessage('Sign-in failed. Try again.'));
    } finally {
      // Nothing here navigates. On success the session changes and the root layout's guard moves
      // the user; this screen only has to stop looking busy.
      setBusy(null);
    }
  };

  return (
    <Surface style={styles.screen}>
      {/* A column held to a button's reading width and centred: on a tablet the buttons otherwise span the
          whole window. The one centred column on a screen (.claude/instruction_mds/frontend.md rule 18): sign-in
          has nothing beside it to align with. A phone is narrower than the cap, so nothing changes there. */}
      <View style={styles.column}>
        {/* The app's name, then a greeting over the buttons: the screen's one hero line (frontend.md §3.1). */}
        <Text variant="displaySmall" style={styles.centred}>
          Merchant
        </Text>
        <View style={styles.greeting}>
          <Text variant="headlineSmall" style={styles.centred}>
            Welcome
          </Text>
          <Text variant="bodyMedium" style={[styles.centred, { color: colors.onSurfaceMuted }]}>
            Sell, restock and run your store from your phone. Sign in to get started.
          </Text>
        </View>

        {/* disabled is load-bearing, not polish: a second signInWithOAuth overwrites the first
            one's PKCE code verifier, and the returning single-use code would then be exchanged
            against the wrong verifier and burned. One flow at a time.

            `google` and `facebook` are not in the symbol map: neither SF Symbols nor Material Symbols
            carries brand marks, so the icon renderer draws both from MaterialCommunityIcons
            (src/lib/icons.tsx). */}
        <Button
          icon="google"
          mode="contained"
          onPress={() => run('google')}
          loading={busy === 'google'}
          disabled={busy !== null}
        >
          Continue with Google
        </Button>
        <Button
          icon="facebook"
          mode="contained-tonal"
          onPress={() => run('facebook')}
          loading={busy === 'facebook'}
          disabled={busy !== null}
        >
          Continue with Facebook
        </Button>

        <HelperText type="error" visible={error !== null}>
          {error}
        </HelperText>

        {/* How standard apps show their terms at sign-in: agreement by continuing, each document a tap away. */}
        <Text variant="bodySmall" style={[styles.centred, { color: colors.onSurfaceMuted }]}>
          {'By continuing, you agree to our '}
          <Text variant="bodySmall" style={{ color: colors.accent }} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })} accessibilityRole="link">
            Terms of Service
          </Text>
          {' and '}
          <Text variant="bodySmall" style={{ color: colors.accent }} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })} accessibilityRole="link">
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  column: { gap: spacing.ms, width: '100%', maxWidth: 400, alignSelf: 'center' },
  // The sign-in column is the recorded centred exception (frontend.md rule 18): its title and lines centre with it.
  centred: { textAlign: 'center' },
  greeting: { gap: spacing.xs, paddingBottom: spacing.md },
});
