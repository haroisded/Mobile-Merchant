import { useEffect } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { currencySymbol } from '../../../lib/money';
import { useAppTheme } from '../../../lib/theme';
import { VARIANT_MATRIX_CAP, buildVariantMatrix, usesInventory } from '../schema';
import type { ProductFormValues } from '../schema';
import { AddButton, ArrayError, FieldGrid, NoteCallout, RepeatRow, TagsField, TextField, ToggleField } from './fields';

export function VariantsSection({ currency }: { currency: string }) {
  const { control } = useFormContext<ProductFormValues>();
  const hasVariants = useWatch({ control, name: 'hasVariants' });

  return (
    <FieldGrid>
      <ToggleField
        name="hasVariants"
        label="Variants"
        span="full"
        on="Sold in several combinations — size, colour, flavour."
        off="One version only."
      />
      {hasVariants ? <VariantEditor currency={currency} /> : null}
    </FieldGrid>
  );
}

function VariantEditor({ currency }: { currency: string }) {
  const { colors } = useAppTheme();
  const { control, getValues, setValue } = useFormContext<ProductFormValues>();
  const attributes = useFieldArray({ control, name: 'variantAttributes' });
  const [watchedAttributes, type, trackInventory] = useWatch({
    control,
    name: ['variantAttributes', 'type', 'trackInventory'],
  });
  const variants = useWatch({ control, name: 'variants' });
  const symbol = currencySymbol(currency);
  const countsStock = usesInventory(type) && trackInventory;

  // The matrix follows the attribute values. Only the values decide the rows, so the effect keys on
  // them and not on attribute names — renaming "Size" to "Cup size" keeps every row as it is.
  const signature = watchedAttributes.map((attribute) => attribute.values.join('')).join('');
  useEffect(() => {
    const previous = getValues('variants');
    const next = buildVariantMatrix(getValues('variantAttributes'), previous);
    const unchanged = next.length === previous.length && next.every((row, index) => row.label === previous[index]?.label);
    if (!unchanged) setValue('variants', next, { shouldDirty: true });
  }, [signature, getValues, setValue]);

  const combinations = watchedAttributes.reduce(
    (count, attribute) => (attribute.values.length > 0 ? count * attribute.values.length : count),
    watchedAttributes.some((attribute) => attribute.values.length > 0) ? 1 : 0
  );

  return (
    <>
      <View style={styles.full}>
        <Text variant="titleMedium">Attributes</Text>
        <View style={styles.rows}>
          {attributes.fields.map((row, index) => (
            <RepeatRow key={row.id} removeLabel="Remove attribute" onRemove={() => attributes.remove(index)}>
              <FieldGrid>
                <TextField name={`variantAttributes.${index}.name`} label="Attribute" required placeholder="e.g. Size" />
                <TagsField name={`variantAttributes.${index}.values`} label="Values" required placeholder="e.g. Small, then enter" />
              </FieldGrid>
            </RepeatRow>
          ))}
        </View>
        <ArrayError name="variantAttributes" />
        <AddButton label="Add attribute" onPress={() => attributes.append({ name: '', values: [] })} />
      </View>

      {variants.length > 0 ? (
        <View style={styles.full}>
          <Text variant="titleMedium">{`${variants.length} ${variants.length === 1 ? 'variant' : 'variants'}`}</Text>
          {combinations > VARIANT_MATRIX_CAP ? (
            <View style={styles.note}>
              <NoteCallout tone="error">{`${combinations} combinations — only the first ${VARIANT_MATRIX_CAP} are kept. Split this into separate products.`}</NoteCallout>
            </View>
          ) : null}
          <View style={styles.rows}>
            {variants.map((variant, index) => (
              // The label is the row's identity: unique per product (product_variants_label_unique).
              <View key={variant.label} style={[styles.variant, { borderColor: colors.outlineVariant }]}>
                <Text variant="labelLarge">{variant.label}</Text>
                <FieldGrid>
                  <TextField name={`variants.${index}.sku`} label="SKU" autoCapitalize="characters" placeholder="Optional" />
                  <TextField name={`variants.${index}.barcode`} label="Barcode" keyboardType="number-pad" placeholder="Optional" />
                  <TextField
                    name={`variants.${index}.priceDelta`}
                    label="Price difference"
                    hint="Added to the base price"
                    prefix={symbol}
                    keyboardType="numbers-and-punctuation"
                    placeholder="0.00"
                  />
                  {countsStock ? (
                    <TextField name={`variants.${index}.qtyOnHand`} label="Quantity on hand" keyboardType="decimal-pad" placeholder="0" />
                  ) : null}
                </FieldGrid>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  full: { flexBasis: '100%', gap: 8 },
  rows: { gap: 8 },
  note: { marginVertical: 4 },
  variant: { borderWidth: 1, padding: 12, gap: 8 },
});
