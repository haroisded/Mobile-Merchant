import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { formatMoney } from '../../../lib/money';
import { useAppTheme } from '../../../lib/theme';
import { useProductOptionsQuery } from '../queries';
import type { ProductFormValues } from '../schema';
import { AddButton, ArrayError, FieldGrid, NoteCallout, RepeatRow, SelectField, TextField, ToggleField, UNIT_OPTIONS } from './fields';

type Props = {
  merchantId: string;
  currency: string;
  /** Null while creating. Excluded from the candidates: a bundle cannot list itself. */
  productId: string | null;
};

export function RecipeSection({ merchantId, currency, productId }: Props) {
  const { control } = useFormContext<ProductFormValues>();
  const isComposite = useWatch({ control, name: 'isComposite' });

  return (
    <FieldGrid>
      <ToggleField
        name="isComposite"
        label="Recipe or bundle"
        span="full"
        on="Built from other products — selling it uses up its components."
        off="Not built from other products."
      />
      {isComposite ? <ComponentEditor merchantId={merchantId} currency={currency} productId={productId} /> : null}
    </FieldGrid>
  );
}

function ComponentEditor({ merchantId, currency, productId }: Props) {
  const { colors } = useAppTheme();
  const { control, setValue } = useFormContext<ProductFormValues>();
  const components = useFieldArray({ control, name: 'components' });
  const rows = useWatch({ control, name: 'components' });
  const products = useProductOptionsQuery({ merchantId });

  const candidates = (products.data ?? []).filter((product) => product.id !== productId);
  const find = (id: string) => candidates.find((product) => product.id === id);

  // The cost roll-up: Σ quantity × the component's cost price. A component without a cost price is
  // counted as zero and called out, rather than silently under-costing the bundle.
  const total = rows.reduce((sum, row) => sum + (Number(row.qty) || 0) * (find(row.componentId)?.cost_price ?? 0), 0);
  const uncosted = rows.filter((row) => row.componentId !== '' && find(row.componentId)?.cost_price == null).length;

  return (
    <View style={styles.full}>
      <Text variant="titleMedium">Components</Text>
      <View style={styles.rows}>
        {components.fields.map((row, index) => {
          const current = rows[index];
          const component = current ? find(current.componentId) : undefined;
          const lineCost = component?.cost_price != null ? (Number(current?.qty) || 0) * component.cost_price : null;
          // Each product once per bundle (product_components_once): the others' picks are not offered.
          const taken = new Set(rows.filter((_, other) => other !== index).map((other) => other.componentId));

          return (
            <RepeatRow key={row.id} removeLabel="Remove component" onRemove={() => components.remove(index)}>
              <FieldGrid>
                <SelectField
                  name={`components.${index}.componentId`}
                  label="Product"
                  required
                  span="full"
                  placeholder={products.isPending ? 'Loading…' : 'Select product'}
                  options={candidates
                    .filter((product) => !taken.has(product.id))
                    .map((product) => ({ value: product.id, label: product.sku ? `${product.name} · ${product.sku}` : product.name }))}
                />
                <TextField name={`components.${index}.qty`} label="Quantity" required keyboardType="decimal-pad" placeholder="1" />
                <SelectField name={`components.${index}.unit`} label="Unit" options={UNIT_OPTIONS} clearable placeholder="Its own unit" />
              </FieldGrid>
              {lineCost !== null ? (
                <Text variant="bodySmall" style={[styles.lineCost, { color: colors.onSurfaceMuted }]}>
                  {`Costs ${formatMoney(lineCost, currency)}`}
                </Text>
              ) : null}
            </RepeatRow>
          );
        })}
      </View>
      <ArrayError name="components" />
      <AddButton
        label="Add component"
        onPress={() => components.append({ componentId: '', qty: '1', unit: '' })}
        disabled={products.isPending}
      />

      {rows.length > 0 ? (
        <View style={styles.rollup}>
          <NoteCallout>
            {`Components cost ${formatMoney(total, currency)} in total.`}
            {uncosted > 0 ? ` ${uncosted} ${uncosted === 1 ? 'has' : 'have'} no cost price and count as zero.` : ''}
          </NoteCallout>
          <Button
            compact
            mode="text"
            textColor={colors.accent}
            onPress={() => setValue('costPrice', total.toFixed(2), { shouldDirty: true, shouldValidate: true })}
            style={styles.useCost}
          >
            Use as cost price
          </Button>
        </View>
      ) : null}
      <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
        A bundle can&apos;t contain itself, directly or through another bundle.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flexBasis: '100%', gap: 8 },
  rows: { gap: 8 },
  lineCost: { marginTop: 6 },
  rollup: { gap: 4, marginTop: 4 },
  useCost: { alignSelf: 'flex-start' },
});
