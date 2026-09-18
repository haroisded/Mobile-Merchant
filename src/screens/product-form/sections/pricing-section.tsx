import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { Text } from '../../../components/text';
import { RATE_PERIOD_LABELS, ratePeriod } from '../../../features/products/schema';
import type { MeasureUnit, ProductFormValues } from '../../../features/products/schema';
import { currencySymbol } from '../../../lib/money';
import { useAppTheme } from '../../../lib/theme';
import { spacing } from '../../../themes';
import {
  AddButton,
  ArrayError,
  Field,
  FieldGrid,
  GroupHeading,
  RepeatRow,
  SelectField,
  TextField,
  ToggleField,
  unitOptions,
} from '../fields';
import { TaxClassPicker } from '../tax-class-picker';

const PERIOD_OPTIONS = ratePeriod.options.map((period) => ({ value: period, label: RATE_PERIOD_LABELS[period] }));

export function PricingSection({ merchantId, currency, units }: { merchantId: string; currency: string; units: MeasureUnit[] }) {
  const { colors } = useAppTheme();
  const { control } = useFormContext<ProductFormValues>();
  const [type, soldDirectly, sellingPrice, costPrice] = useWatch({
    control,
    name: ['type', 'soldDirectly', 'sellingPrice', 'costPrice'],
  });
  const rateTiers = useFieldArray({ control, name: 'rateTiers' });
  const symbol = currencySymbol(currency);

  const price = Number(sellingPrice);
  const cost = Number(costPrice);
  const margin =
    sellingPrice !== '' && costPrice !== '' && price > 0 && Number.isFinite(cost)
      ? Math.round(((price - cost) / price) * 100)
      : null;

  return (
    <FieldGrid>
      <TextField
        name="sellingPrice"
        label="Selling price"
        // Required to publish only when it is sold on its own (products_price_when_sold).
        required={soldDirectly}
        prefix={symbol}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />
      <TextField name="costPrice" label="Cost price" prefix={symbol} keyboardType="decimal-pad" placeholder="0.00" />

      {margin !== null ? (
        <View style={styles.full}>
          <Text variant="bodySmall" style={{ color: margin < 0 ? colors.error : colors.onSurfaceMuted }}>
            {`Margin ${margin}%`}
          </Text>
        </View>
      ) : null}

      <SelectField name="pricingUnit" label="Price per" options={unitOptions(units)} clearable placeholder="Each" />

      <Controller
        control={control}
        name="taxClassId"
        render={({ field }) => (
          <Field label="Tax class">
            <TaxClassPicker merchantId={merchantId} value={field.value} onChange={field.onChange} accessibilityLabel="Tax class" />
          </Field>
        )}
      />

      <ToggleField name="discountable" label="Discounts" span="full" on="Discounts can apply to it." off="Discounts never apply to it." />

      {type === 'rental' ? (
        <>
          <TextField name="depositAmount" label="Deposit" prefix={symbol} keyboardType="decimal-pad" placeholder="0.00" />
          <TextField name="lateFeePerHour" label="Late fee per hour" prefix={symbol} keyboardType="decimal-pad" placeholder="0.00" />
        </>
      ) : null}

      {type === 'bookable' ? (
        <>
          <TextField name="cancellationFee" label="Cancellation fee" prefix={symbol} keyboardType="decimal-pad" placeholder="0.00" />
          <TextField name="extraUnitFee" label="Extra person or unit fee" prefix={symbol} keyboardType="decimal-pad" placeholder="0.00" />
        </>
      ) : null}

      {type === 'rental' || type === 'bookable' ? (
        <View style={styles.group}>
          <GroupHeading title="Rate tiers" />
          <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
            Prices for longer periods — a day rate cheaper than 24 hourly ones.
          </Text>
          <View style={styles.rows}>
            {rateTiers.fields.map((row, index) => (
              <RepeatRow key={row.id} removeLabel="Remove rate" onRemove={() => rateTiers.remove(index)}>
                <FieldGrid>
                  <SelectField name={`rateTiers.${index}.period`} label="Period" required options={PERIOD_OPTIONS} />
                  <TextField
                    name={`rateTiers.${index}.price`}
                    label="Price"
                    required
                    prefix={symbol}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                  <TextField name={`rateTiers.${index}.note`} label="Note" span="full" placeholder="e.g. Weekend rate" />
                </FieldGrid>
              </RepeatRow>
            ))}
          </View>
          <ArrayError name="rateTiers" />
          <AddButton label="Add rate" onPress={() => rateTiers.append({ period: 'day', price: '', note: '' })} />
        </View>
      ) : null}
    </FieldGrid>
  );
}

const styles = StyleSheet.create({
  full: { flexBasis: '100%' },
  group: { flexBasis: '100%', gap: spacing.sm },
  rows: { gap: spacing.sm },
});
