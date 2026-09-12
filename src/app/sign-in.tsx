import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, HelperText, Surface, Text } from 'react-native-paper';

import { signInWithFacebook, signInWithGoogle } from '../lib/auth';
import { failureMessage } from '../lib/errors';

type Provider = 'google' | 'facebook';

export default function SignIn() {
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
      // builds — and the screen gets copy the user can act on (docs/data-layer.md §5).
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
      <Text variant="headlineMedium">Sign in</Text>

      {/* disabled is load-bearing, not polish: a second signInWithOAuth overwrites the first
          one's PKCE code verifier, and the returning single-use code would then be exchanged
          against the wrong verifier and burned. One flow at a time. */}
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
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', gap: 12, padding: 24 },
});
