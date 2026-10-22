import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Appbar } from '../../components/appbar';
import { Surface } from '../../components/surface';
import { Text } from '../../components/text';
import { READING_MEASURE } from '../../lib/columns';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';
import { LEGAL_DOCS } from './documents';
import type { LegalDoc } from './documents';

/**
 * The Privacy Policy or the Terms of Service, read in the app as standard mobile apps do: opened from the sign-in
 * page's line under its buttons, and from Account's Security & Privacy. The route sits outside the sign-in guard
 * (src/app/_layout.tsx), so it opens signed in or not. Held to the reading measure, left-aligned.
 */
export function LegalScreen({ doc }: { doc: LegalDoc }) {
  const { colors } = useAppTheme();
  const { title, updated, intro, sections } = LEGAL_DOCS[doc];

  return (
    <Surface style={styles.screen}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={title} />
      </Appbar.Header>
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {`Last updated ${updated}`}
        </Text>
        <Text variant="bodyLarge">{intro}</Text>
        {sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text variant="headlineSmall">{section.heading}</Text>
            {section.paragraphs.map((paragraph) => (
              <Text key={paragraph} variant="bodyLarge">
                {paragraph}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { gap: spacing.lg, padding: spacing.md, maxWidth: READING_MEASURE, width: '100%' },
  section: { gap: spacing.sm },
});
