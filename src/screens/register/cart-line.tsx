import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Field, FieldGrid } from '../../components/form-fields';
import { IconButton } from '../../components/icon-button';
import { SearchSelect } from '../../components/search-select';
import { Text } from '../../components/text';
import { TextInput } from '../../components/text-input';
import type { Item } from '../../features/items/queries';
import type { SaleLine } from '../../features/pos-invoices/cart';
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
  /** The rate the cashier typed; null while the price list's stands. */
  typedRate: number | null;
  item: Item | undefined;
  uoms: Uom[];
  /** The POS Profile's Allow User to Edit Rate. */
  rateEditable: boolean;
  money: (value: number) => string;
};

/** One line of the cart: its quantity, its unit where the item sells in several, its rate where the profile lets it change, and its amount. */
export function CartLineRow({ sessionId, line, typedRate, item, uoms, rateEditable, money }: Props) {
  const index = line.cartIndex;
  const { colors } = useAppTheme();
  const unitIds = item ? [item.stock_uom, ...item.item_uoms.map((unit) => unit.uom_id).filter((id) => id !== item.stock_uom)] : [line.uomId];
  const unitName = (id: string) => uoms.find((uom) => uom.id === id)?.uom_name ?? 'Unit';

  return (
    <View style={[styles.line, { borderColor: colors.outlineVariant }]}>
      <View style={styles.head}>
        <View style={styles.fill}>
          <Text variant="titleMedium">{line.itemName}</Text>
          <Text variant="bodySmall" style={{ color: line.priced ? colors.onSurfaceMuted : colors.error }}>
            {line.priced ? `${money(line.rate)} per ${unitName(line.uomId)} · ${money(line.amount)}` : 'No price list prices this item.'}
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
            // Another unit is another price: the rate goes back to the price list's.
            onChange={(uomId) => updateCartLine(sessionId, index, { uomId, rate: null })}
          />
        ) : null}
        {rateEditable ? (
          <NumberField
            label="Rate"
            hint="Blank takes the price list's"
            // The typed rate only: the price list's shows as the placeholder.
            value={typedRate}
            placeholder={String(line.priceListRate)}
            blank
            min={0}
            onChange={(rate) => updateCartLine(sessionId, index, { rate })}
          />
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
