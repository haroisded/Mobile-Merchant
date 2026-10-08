import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '../../components/icon';
import { PageHeader } from '../../components/page-header';
import { Text } from '../../components/text';
import { useColumns } from '../../lib/columns';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';

type Entry = {
  label: string;
  hint: string;
  pathname: '/systems/[id]/setup/company' | '/systems/[id]/setup/fiscal-years';
};

// The foundation a POS needs before its first item, grouped as .claude/erpnext-docs/POS-System-Only-Features.md
// groups it. A section appears once its first screen exists; the rest arrive step by step.
const SECTIONS: { title: string; hint: string; entries: Entry[] }[] = [
  {
    title: 'Company & Calendar',
    hint: 'Who the books belong to, and the years they are kept in',
    entries: [
      { label: 'Company', hint: 'Name, abbreviation, country and currency', pathname: '/systems/[id]/setup/company' },
      { label: 'Fiscal Years', hint: 'The accounting years every sale is dated in', pathname: '/systems/[id]/setup/fiscal-years' },
    ],
  },
];

// ponytail: tune on a real tablet. A section card's narrowest width; the column count falls out of it.
const SECTION_CARD = 320;

/** Setup: the index of a system's foundation records, the rail's second destination. */
export function SetupIndex({ merchantId, merchantName }: { merchantId: string; merchantName: string }) {
  const { columns, onLayout } = useColumns(SECTION_CARD);
  // Rows of `columns` sections, the last one padded with empty cells so every card keeps the same width.
  const rows = Array.from({ length: Math.ceil(SECTIONS.length / columns) }, (_, row) =>
    SECTIONS.slice(row * columns, row * columns + columns)
  );

  return (
    <View style={styles.fill}>
      <PageHeader kicker={merchantName} title="Setup" meta="Set these up before the first item is sold" />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.grid} onLayout={onLayout}>
          {rows.map((row) => (
            <View key={row[0].title} style={styles.gridRow}>
              {row.map((section) => (
                <SectionCard key={section.title} section={section} merchantId={merchantId} />
              ))}
              {Array.from({ length: columns - row.length }, (_, index) => (
                <View key={index} style={styles.fill} />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function SectionCard({ section, merchantId }: { section: (typeof SECTIONS)[number]; merchantId: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.section}>
      {/* Section heading: headlineSmall and its bodySmall hint (.claude/instruction_mds/frontend.md §5). */}
      <View style={styles.heading}>
        <Text variant="headlineSmall">{section.title}</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {section.hint}
        </Text>
      </View>
      <View style={[styles.box, { borderColor: colors.outlineVariant }]}>
        {section.entries.map((entry, index) => (
          <Pressable
            key={entry.label}
            onPress={() => router.push({ pathname: entry.pathname, params: { id: merchantId } })}
            // Pressable reads no theme, so the press colour is passed every time (.claude/instruction_mds/frontend.md §5).
            android_ripple={{ color: colors.ripple }}
            accessibilityRole="button"
            accessibilityLabel={entry.label}
            // A 1px surfaceVariant hairline between rows (.claude/instruction_mds/frontend.md §5).
            style={[styles.row, index > 0 ? { borderTopWidth: 1, borderTopColor: colors.surfaceVariant } : null]}
          >
            <View style={styles.rowText}>
              <Text variant="titleMedium">{entry.label}</Text>
              <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                {entry.hint}
              </Text>
            </View>
            <Icon source="chevron-right" size={20} color={colors.onSurfaceMuted} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: spacing.md },
  grid: { gap: spacing.lg },
  gridRow: { flexDirection: 'row', gap: spacing.md },
  section: { flex: 1, gap: spacing.sm },
  heading: { gap: spacing.xs },
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.ms },
  rowText: { flex: 1, gap: spacing.xs },
});
