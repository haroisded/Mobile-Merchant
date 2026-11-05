import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Appbar } from '../../components/appbar';
import { READING_MEASURE, useBottomInset } from '../../lib/columns';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';
import { LEGAL_DOCS } from './documents';
import type { LegalDoc } from './documents';
import { LegalBody } from './legal-body';

/**
 * The Privacy Policy or the Terms of Service, read in the app as standard mobile apps do: opened from the sign-in
 * page's line under its buttons, and from a phone's Account (a tablet's Profile Dialog opens them inside itself). The
 * route sits outside the sign-in guard (src/app/_layout.tsx), so it opens signed in or not. Held to the reading measure
 * and centred: on a tablet, held left, it left half the window empty (frontend.md rule 18).
 */
export function LegalScreen({ doc }: { doc: LegalDoc }) {
  const { colors } = useAppTheme();
  const bottom = useBottomInset();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Appbar.Header style={{ backgroundColor: colors.background }}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={LEGAL_DOCS[doc].title} />
      </Appbar.Header>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: spacing.xl + bottom }]}>
        <LegalBody doc={doc} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.md, maxWidth: READING_MEASURE, width: '100%', alignSelf: 'center' },
});
