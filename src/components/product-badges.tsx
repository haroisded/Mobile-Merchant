import { StyleSheet, View } from 'react-native';

import type { Product } from '../features/products/queries';
import { STATUS_META, TYPE_META, UNIT_META } from '../features/products/schema';
import type { ProductStatus, ProductType } from '../features/products/schema';
import { useAppTheme } from '../lib/theme';
import { radius, spacing } from '../themes';
import { Icon } from './icon';
import { Text } from './text';

// The small pieces the list and the detail screen both draw.

/** 1px outlineVariant border on surfaceMuted, labelMedium inside (instruction_mds/visual-language.md §5). */
export function TypeBadge({ type }: { type: ProductType }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.badge, { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceMuted }]}>
      <Text variant="labelMedium">{TYPE_META[type].badge}</Text>
    </View>
  );
}

/** The status in its colour from instruction_mds/visual-language.md §4. */
export function StatusText({ status }: { status: ProductStatus }) {
  const { colors } = useAppTheme();
  const meta = STATUS_META[status];

  return (
    <Text variant="labelMedium" style={{ color: colors[meta.tone] }}>
      {meta.label}
    </Text>
  );
}

/** Stock at or under its reorder point. `error`, not the accent: it is a warning. */
export function LowStockBadge() {
  const { colors } = useAppTheme();

  return (
    <Text variant="labelMedium" style={{ color: colors.error }}>
      Low stock
    </Text>
  );
}

/** Until the image pipeline lands, every product shows the placeholder. */
export function Thumbnail({ size }: { size: number }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.thumbnail, { width: size, height: size, backgroundColor: colors.surfaceVariant }]}>
      <Icon source="image" size={Math.round(size * 0.45)} color={colors.onSurfaceFaint} />
    </View>
  );
}

/**
 * The list's availability column. Rental and bookable read "Y units" — what is free at a moment needs
 * bookings, which do not exist yet — stock reads its quantity, a flat service has nothing to count.
 */
export function availabilityLabel(product: Pick<Product, 'type' | 'track_inventory' | 'qty_on_hand' | 'uom' | 'total_units'>) {
  if (product.type === 'rental' || product.type === 'bookable') {
    return product.total_units === null ? '—' : `${product.total_units} ${product.total_units === 1 ? 'unit' : 'units'}`;
  }
  if (product.type === 'stock' && product.track_inventory && product.qty_on_hand !== null) {
    return product.uom ? `${product.qty_on_hand} ${UNIT_META[product.uom].short}` : String(product.qty_on_hand);
  }
  return '—';
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  thumbnail: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, borderCurve: 'continuous' },
});
