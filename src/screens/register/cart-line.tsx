import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Field, FieldGrid } from '../../components/form-fields';
import { IconButton } from '../../components/icon-button';
import { SearchSelect } from '../../components/search-select';
import { Text } from '../../components/text';
import { TextInput } from '../../components/text-input';
import type { Item } from '../../features/items/queries';
import type { CartLine, SaleLine } from '../../features/pos-invoices/cart';
import type { Uom } from '../../features/uoms/queries';
import { useAppTheme } from '../../lib/theme';
import { removeCartLine, updateCartLine } from '../../Store/cart';
import { spacing } from '../../themes';

type NumberProps = {
  label: string;
  hint?: string;
  /** Null shows `placeholder`: a rate left to the price list. */
  value: number | null;
  placeholder?: string;
  /** Null for a blank field where `blank` allows one; never called with a number below `min`. */
  onChange: (value: number | null) => void;
  /** Whether the field may be left blank. */
  blank?: boolean;
  /** The lowest number taken; anything under it is left as typed and not kept. */
  min: number;
};

/**
 * A number of the cart, kept the moment it reads as one. What is being typed is the field's own until it
 * blurs — "1." is on its way to 1.5 and is not a number yet — and the cart keeps the last number that was.
 */
export function NumberField({ label, hint, value, placeholder, onChange, blank, min }: NumberProps) {
  const [typed, setTyped] = useState<string>();
  const text = typed ?? (value === null ? '' : String(value));
  const kept = (candidate: string) => (candidate.trim() === '' ? (blank ? null : undefined) : /^\d*\.?\d+$/.test(candidate.trim()) && Number(candidate) >= min ? Number(candidate) : undefined);

  return (
    <Field label={label} hint={hint} error={typed !== undefined && kept(typed) === undefined ? `Enter ${min > 0 ? 'a number above 0' : '0 or more'}.` : undefined}>
      <TextInput
        mode="outlined"
        dense
        value={text}
        onChangeText={(next) => {
          setTyped(next);
          const number = kept(next);
          if (number !== undefined) onChange(number);
        }}
        // Back to what the cart holds: a number that never became one is dropped.
        onBlur={() => setTyped(undefined)}
        placeholder={placeholder}
        keyboardType="decimal-pad"
        maxLength={14}
        accessibilityLabel={label}
      />
    </Field>
  );
}

type Props = {
  sessionId: string;
  line: SaleLine;
  /** The line as the cashier left it: what was typed for its rate or its discount, null while the price list's stands. */
  typed: CartLine;
  item: Item | undefined;
  uoms: Uom[];
  /** The POS Profile's Allow User to Edit Rate, and Allow User to Edit Discount. */
  rateEditable: boolean;
  discountEditable: boolean;
  money: (value: number) => string;
};

/** "₱ 72.00 per Nos · ₱ 144.00 · 10% off · Coffee promo": what the line sells at, and what brought it under the list's rate. */
function lineSummary(line: SaleLine, unit: string, money: (value: number) => string) {
  const parts = [`${money(line.rate)} per ${unit}`, money(line.amount)];
  if (line.discountAmount > 0) parts.push(`${Number(line.discountPercentage.toFixed(2))}% off`);
  if (line.pricingRule) parts.push(line.pricingRule.title);
  return parts.join(' · ');
}

/**
 * One line of the cart: its quantity, its unit where the item sells in several, its rate and its discount
 * where the profile lets them change, and its amount. A rate, a Discount (%) and a Discount Amount are three
 * ways to say one thing, so typing one empties the other two.
 */
export function CartLineRow({ sessionId, line, typed, item, uoms, rateEditable, discountEditable, money }: Props) {
  const index = line.cartIndex;
  const { colors } = useAppTheme();
  const unitIds = item ? [item.stock_uom, ...item.item_uoms.map((unit) => unit.uom_id).filter((id) => id !== item.stock_uom)] : [line.uomId];
  const unitName = (id: string) => uoms.find((uom) => uom.id === id)?.uom_name ?? 'Unit';
  const price = (patch: Pick<CartLine, 'rate' | 'discountPercentage' | 'discountAmount'>) => updateCartLine(sessionId, index, patch);

  return (
    <View style={[styles.line, { borderColor: colors.outlineVariant }]}>
      <View style={styles.head}>
        <View style={styles.fill}>
          <Text variant="titleMedium">{line.itemName}</Text>
          <Text variant="bodySmall" style={{ color: line.priced ? colors.onSurfaceMuted : colors.error }}>
            {line.priced ? lineSummary(line, unitName(line.uomId), money) : 'No price list prices this item.'}
          </Text>
        </View>
        <IconButton icon="delete" accessibilityLabel={`Remove ${line.itemName} from the cart`} onPress={() => removeCartLine(sessionId, index)} />
      </View>
      <FieldGrid>
        <NumberField label="Quantity" hint={unitName(line.uomId)} value={line.qty} min={0.000001} onChange={(qty) => updateCartLine(sessionId, index, { qty: qty ?? 1 })} />
        {unitIds.length > 1 ? (
          <SearchSelect
            label="UOM"
            title="UOM"
            value={line.uomId}
            options={unitIds.map((id) => ({ value: id, label: unitName(id) }))}
            // Another unit is another price: the rate goes back to the price list's, and an amount off the old unit goes.
            onChange={(uomId) => updateCartLine(sessionId, index, { uomId, rate: null, discountAmount: null })}
          />
        ) : null}
        {rateEditable ? (
          <NumberField
            label="Rate"
            hint="Blank takes the price list's"
            // The typed rate only: the price list's shows as the placeholder.
            value={typed.rate}
            placeholder={String(line.priceListRate)}
            blank
            min={0}
            onChange={(rate) => price({ rate, discountPercentage: null, discountAmount: null })}
          />
        ) : null}
        {discountEditable ? (
          <>
            <NumberField
              label="Discount (%)"
              hint="Off the price list's rate"
              value={typed.discountPercentage ?? null}
              placeholder="0"
              blank
              min={0}
              onChange={(discountPercentage) => price({ rate: null, discountPercentage, discountAmount: null })}
            />
            <NumberField
              label="Discount Amount"
              hint={`Off each ${unitName(line.uomId)}`}
              value={typed.discountAmount ?? null}
              placeholder="0"
              blank
              min={0}
              onChange={(discountAmount) => price({ rate: null, discountPercentage: null, discountAmount })}
            />
          </>
        ) : null}
      </FieldGrid>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, gap: spacing.xs },
  line: { gap: spacing.sm, paddingBottom: spacing.ms, borderBottomWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
});
