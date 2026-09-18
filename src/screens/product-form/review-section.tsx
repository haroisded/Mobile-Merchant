import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../../components/text';
import {
  FIELD_SECTION,
  SECTION_META,
  TYPE_META,
  UNIT_META,
  measureUnit,
} from '../../features/products/schema';
import type { ProductFormValues, SectionId } from '../../features/products/schema';
import { formatMoney } from '../../lib/money';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';
import { Field, FieldGrid } from './fields';

type Props = {
  /** The sections this type has, in the order the merchant stepped through them. */
  sections: { id: SectionId; optional: boolean }[];
  currency: string;
  /** The category and subcategory names, which the form holds only as ids. */
  categoryPath: string;
  /** Jump back to a section from its summary row. */
  onOpen: (section: SectionId) => void;
};

/**
 * The last step: what was filled in, one row per section that takes you back to it. The status is
 * not a field here — the Save buttons under it choose it (ProductForm's saveActions), so the decision
 * and the action are one tap.
 *
 * Before this, the only way to save on a phone was to reach step 7 and find Publish there, with a
 * "Save as Draft" on every step competing with it — two primary actions and no ending.
 */
export function ReviewSection({ sections, currency, categoryPath, onOpen }: Props) {
  const { colors } = useAppTheme();
  const { control } = useFormContext<ProductFormValues>();
  const { errors } = useFormState({ control });
  const values = useWatch({ control });

  // Which sections hold a field that failed, so the summary can say where to go. Typed as every
  // section, not only the ones FIELD_SECTION mentions: Media carries no field and would not be in it.
  const failed = new Set<SectionId>(
    Object.entries(FIELD_SECTION)
      .filter(([field]) => Object.hasOwn(errors, field))
      .map(([, section]) => section)
  );

  const money = (amount: string | undefined) => (amount && amount !== '' ? formatMoney(Number(amount), currency) : '—');
  const unit = (value: string | undefined) => {
    const parsed = measureUnit.safeParse(value);
    return parsed.success ? UNIT_META[parsed.data].label : '—';
  };
  const text = (value: string | undefined) => (value && value.trim() !== '' ? value : '—');

  // One line per section, in the same order and with the same names as the steps behind it.
  const summary = {
    general: [text(values.name), categoryPath || '—', values.sku ? values.sku : 'no SKU'].join(' · '),
    pricing: [money(values.sellingPrice), values.pricingUnit ? `per ${unit(values.pricingUnit)}` : 'each'].join(' '),
    inventory: [unit(values.uom), values.trackInventory ? `${text(values.qtyOnHand)} on hand` : 'not counted'].join(' · '),
    availability: [
      values.totalUnits ? `${values.totalUnits} units` : 'no units',
      values.operatingHours?.length ? `${values.operatingHours.length} days open` : 'any time',
    ].join(' · '),
    variants: values.hasVariants ? `${values.variants?.length ?? 0} combinations` : 'no variants',
    recipe: values.isComposite ? `${values.components?.length ?? 0} components` : 'not a bundle',
    media: 'Nothing yet',
    advanced: `${values.customFields?.length ?? 0} custom fields`,
    review: '',
  } satisfies Record<SectionId, string>;

  return (
    <FieldGrid>
      <View style={styles.full}>
        {sections.map((entry) => (
          <Pressable
            key={entry.id}
            onPress={() => onOpen(entry.id)}
            // Pressable reads no theme, so the press colour is passed every time (instruction_mds/visual-language.md §5).
            android_ripple={{ color: colors.ripple }}
            accessibilityRole="button"
            accessibilityLabel={`${SECTION_META[entry.id].name}. ${summary[entry.id]}`}
            accessibilityHint="Opens this section"
            style={[styles.row, { borderBottomColor: colors.surfaceVariant }]}
          >
            <Text variant="labelMedium" style={[styles.rowLabel, { color: colors.onSurfaceMuted }]}>
              {SECTION_META[entry.id].name}
            </Text>
            <Text variant="bodyMedium" style={styles.fill} numberOfLines={2}>
              {failed.has(entry.id) ? 'Needs attention' : summary[entry.id]}
            </Text>
            {failed.has(entry.id) ? (
              <Text variant="labelMedium" style={{ color: colors.error }}>
                FIX
              </Text>
            ) : null}
          </Pressable>
        ))}
      </View>

      <Field label="Type" span="full">
        <Text variant="bodyMedium">{TYPE_META[values.type ?? 'flat'].label}</Text>
      </Field>
    </FieldGrid>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  full: { flexBasis: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, paddingVertical: spacing.ms, borderBottomWidth: 1 },
  rowLabel: { width: 96 },
});
