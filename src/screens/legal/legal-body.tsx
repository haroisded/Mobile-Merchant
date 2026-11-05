import { StyleSheet, View } from 'react-native';

import { Text } from '../../components/text';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';
import { LEGAL_DOCS } from './documents';
import type { Document, LegalDoc } from './documents';

/**
 * A legal document's text, for its page (./index.tsx) and Profile's Dialog on a tablet: the date, the intro, then
 * numbered sections split by 1px rules, all on one left edge. `textBreakStrategy="simple"`: Android's default
 * balances a paragraph's lines, which drew them at uneven lengths (a tester's report, 2026-11-03).
 */
export function LegalBody({ doc }: { doc: LegalDoc }) {
  const { colors } = useAppTheme();
  const { updated, intro, sections }: Document = LEGAL_DOCS[doc];

  return (
    <View style={styles.body}>
      <View style={styles.block}>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {`Last updated ${updated}`}
        </Text>
        <Text variant="bodyLarge" textBreakStrategy="simple">
          {intro}
        </Text>
      </View>
      {sections.map((section, index) => (
        <View key={section.heading} style={[styles.block, styles.section, { borderTopColor: colors.outlineVariant }]}>
          <Text variant="headlineSmall">{`${index + 1}. ${section.heading}`}</Text>
          {section.paragraphs?.map((paragraph) => (
            <Text key={paragraph} variant="bodyLarge" textBreakStrategy="simple">
              {paragraph}
            </Text>
          ))}
          {section.labelled?.map(({ label, text }) => (
            <View key={label} style={styles.labelled}>
              <Text variant="titleMedium">{label}</Text>
              <Text variant="bodyLarge" textBreakStrategy="simple">
                {text}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
  block: { gap: spacing.ms },
  section: { borderTopWidth: 1, paddingTop: spacing.lg },
  labelled: { gap: spacing.xs },
});
