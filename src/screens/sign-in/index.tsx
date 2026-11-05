import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/button';
import { HelperText } from '../../components/helper-text';
import { Icon } from '../../components/icon';
import { Text } from '../../components/text';
import { signInWithFacebook, signInWithGoogle } from '../../lib/auth';
import { useShellWide } from '../../lib/columns';
import { failureMessage } from '../../lib/errors';
import type { IconName } from '../../lib/icons';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';

type Provider = 'google' | 'facebook';

const FEATURES: { icon: IconName; title: string; line: string }[] = [
  { icon: 'receipt-long', title: 'Sell', line: 'Ring up sales and send receipts' },
  { icon: 'stock', title: 'Restock', line: 'Track stock and reorder before it runs out' },
  { icon: 'group', title: 'Run', line: 'Set staff roles and see daily totals' },
];

const openDoc = (doc: 'terms' | 'privacy') => router.push({ pathname: '/legal/[doc]', params: { doc } });

/**
 * The sign-in page (.claude/full-system-context/Updates/auth-page.html, the human, 2026-11-06): the brand, a greeting,
 * what the app does, and the two providers. Narrow, a column on the page; wide, the same column in an outlined card,
 * centred — it has nothing beside it to align with (.claude/instruction_mds/frontend.md rule 18). It scrolls for a
 * large font scale.
 */
export function SignInScreen() {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const { top, bottom } = useSafeAreaInsets();
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
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.screen, { paddingTop: spacing.lg + top, paddingBottom: spacing.lg + bottom }]}
    >
      <View style={wide ? [styles.card, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }] : styles.column}>
        <View style={styles.brand}>
          <View style={[styles.mark, { backgroundColor: colors.primary }]}>
            <Text variant="headlineMedium" style={{ color: colors.onPrimary }}>
              M
            </Text>
            <View style={[styles.dot, { backgroundColor: colors.accent }]} />
          </View>
          <Text variant="headlineMedium">Merchant</Text>
        </View>

        <View style={styles.greeting}>
          <Text variant="displaySmall">Welcome</Text>
          <Text variant="bodyLarge" style={{ color: colors.onSurfaceMuted }}>
            Sell, restock and run your store from your phone. Sign in to get started.
          </Text>
        </View>

        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature.title} style={styles.feature}>
              <View style={[styles.tile, { backgroundColor: colors.primaryContainer }]}>
                <Icon source={feature.icon} size={20} color={colors.onPrimaryContainer} />
              </View>
              <View style={styles.featureText}>
                <Text variant="titleSmall">{feature.title}</Text>
                <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                  {feature.line}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* disabled is load-bearing, not polish: a second signInWithOAuth overwrites the first
            one's PKCE code verifier, and the returning single-use code would then be exchanged
            against the wrong verifier and burned. One flow at a time.

            `google` and `facebook` are not in the symbol map: neither SF Symbols nor Material Symbols
            carries brand marks, so the icon renderer draws both from MaterialCommunityIcons
            (src/lib/icons.tsx). */}
        <View style={styles.actions}>
          <Button icon="google" mode="contained" contentStyle={styles.provider} onPress={() => run('google')} loading={busy === 'google'} disabled={busy !== null}>
            Continue with Google
          </Button>
          <Button icon="facebook" mode="contained-tonal" contentStyle={styles.provider} onPress={() => run('facebook')} loading={busy === 'facebook'} disabled={busy !== null}>
            Continue with Facebook
          </Button>
          {error ? (
            <HelperText type="error" padding="none">
              {error}
            </HelperText>
          ) : null}
        </View>

        {/* How standard apps show their terms at sign-in: agreement by continuing, each document a tap away. */}
        <Text variant="bodySmall" style={[styles.legal, { color: colors.onSurfaceMuted }]}>
          {'By continuing, you agree to our '}
          <Text variant="bodySmall" style={[styles.link, { color: colors.accent }]} onPress={() => openDoc('terms')} accessibilityRole="link">
            Terms of Service
          </Text>
          {' and '}
          <Text variant="bodySmall" style={[styles.link, { color: colors.accent }]} onPress={() => openDoc('privacy')} accessibilityRole="link">
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg },
  column: { gap: spacing.xl, width: '100%', maxWidth: 440 },
  card: { gap: spacing.lg, width: '100%', maxWidth: 520, padding: spacing.xl, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms },
  // The mark is a size, not spacing; its dot sits in the corner, a position.
  mark: { width: 48, height: 48, borderRadius: radius.button, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', right: 7, bottom: 8, width: 7, height: 7, borderRadius: radius.md },
  greeting: { gap: spacing.sm },
  features: { gap: spacing.xs },
  feature: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, paddingVertical: spacing.sm },
  tile: { width: 40, height: 40, borderRadius: radius.lg, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  featureText: { flexShrink: 1 },
  actions: { gap: spacing.ms },
  // Paper centres a Button's label: here that is the design. 56dp, the page's one tall pair.
  provider: { minHeight: 56 },
  legal: { textAlign: 'center' },
  link: { textDecorationLine: 'underline' },
});
