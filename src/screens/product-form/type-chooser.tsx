import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '../../components/icon';
import { PageHeader } from '../../components/page-header';
import { Text } from '../../components/text';
import { TYPE_META } from '../../features/products/schema';
import type { ProductType } from '../../features/products/schema';
import type { IconName } from '../../lib/icons';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';

type Props = {
  title: string;
  hint: string;
  /** The types this screen can create, in the order they are offered. */
  types: ProductType[];
  onPick: (type: ProductType) => void;
  onBack: () => void;
};

const TYPE_ICON = {
  stock: 'inventory',
  rental: 'key',
  bookable: 'calendar-month',
  flat: 'tag',
} satisfies Record<ProductType, IconName>;

/**
 * Which kind of thing is being created, asked before the form rather than switched inside it.
 *
 * A product's type decides which sections the form has, and the type cannot change after the first
 * save (the database stopped writing it on update). A segmented control at the
 * top of the form implied the opposite: that it was one more field to flip, halfway through filling
 * the sections it silently rebuilds. Rentables is the only screen that asks, because it is the only
 * one with two types.
 */
export function TypeChooser({ title, hint, types, onPick, onBack }: Props) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.fill}>
      <PageHeader kicker="New" title={title} meta={hint} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        {types.map((type) => (
          <Pressable
            key={type}
            onPress={() => onPick(type)}
            // Pressable reads no theme, so the press colour is passed every time (instruction_mds/visual-language.md §5).
            android_ripple={{ color: colors.ripple }}
            accessibilityRole="button"
            accessibilityLabel={TYPE_META[type].label}
            accessibilityHint={TYPE_META[type].hint}
            style={[styles.card, { borderColor: colors.outlineVariant }]}
          >
            <Icon source={TYPE_ICON[type]} size={28} color={colors.onSurface} />
            <View style={styles.cardText}>
              <Text variant="headlineSmall">{TYPE_META[type].label}</Text>
              <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                {TYPE_META[type].hint}
              </Text>
            </View>
            <Icon source="chevron-right" size={20} color={colors.onSurfaceFaint} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: spacing.ms, padding: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: spacing.md,
  },
  cardText: { flex: 1, gap: spacing.xs },
});
