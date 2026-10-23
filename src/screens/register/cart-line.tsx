import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge } from '../../components/badge';
import { Chip } from '../../components/chip';
import { Field, FieldGrid } from '../../components/form-fields';
import { HelperText } from '../../components/helper-text';
import { IconButton } from '../../components/icon-button';
import { SearchSelect } from '../../components/search-select';
import { Text } from '../../components/text';
import { TextInput } from '../../components/text-input';
import type { Item } from '../../features/items/queries';
import type { CartLine, SaleLine } from '../../features/pos-invoices/cart';
import type { Uom } from '../../features/uoms/queries';
import { useAppTheme } from '../../lib/theme';
import { removeCartLine, updateCartLine } from '../../Store/cart';
import { radius, spacing } from '../../themes';

/**
 * A number of the cart as it is typed, kept the moment it reads as one. What is being typed is the field's own until
 * it blurs — "1." is on its way to 1.5 and is not a number yet — and the cart keeps the last number that was.
 */
function useNumberText(value: number | null, onChange: (value: number | null) => void, blank: boolean | undefined, min: number) {
  const [typed, setTyped] = useState<string>();
  const kept = (candidate: string) => (candidate.trim() === '' ? (blank ? null : undefined) : /^\d*\.?\d+$/.test(candidate.trim()) && Number(candidate) >= min ? Number(candidate) : undefined);

  return {
    text: typed ?? (value === null ? '' : String(value)),
    error: typed !== undefined && kept(typed) === undefined ? `Enter ${min > 0 ? 'a number above 0' : '0 or more'}.` : undefined,
    onChangeText: (next: string) => {
      setTyped(next);
      const number = kept(next);
      if (number !== undefined) onChange(number);
    },
    // Back to what the cart holds: a number that never became one is dropped.
    onBlur: () => setTyped(undefined),
  };
}

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

/** A labelled number field of the cart and its payment, laid out by FieldGrid. */
export function NumberField({ label, hint, value, placeholder, onChange, blank, min }: NumberProps) {
  const number = useNumberText(value, onChange, blank, min);

  return (
    <Field label={label} hint={hint} error={number.error}>
      <TextInput
        mode="outlined"
        dense
        value={number.text}
        onChangeText={number.onChangeText}
        onBlur={number.onBlur}
        placeholder={placeholder}
        keyboardType="decimal-pad"
        maxLength={14}
        accessibilityLabel={label}
      />
    </Field>
  );
}

/** The line's quantity: − and + a whole one at a time, down to 1, and the field between them for any other number. */
function Stepper({ value, unit, onChange }: { value: number; unit: string; onChange: (qty: number) => void }) {
  const { colors } = useAppTheme();
  const number = useNumberText(value, (qty) => onChange(qty ?? 1), false, 0.000001);

  return (
    <View style={styles.stepperField}>
      <View style={styles.labelRow}>
        <Text variant="labelMedium">Quantity</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {unit}
        </Text>
      </View>
      <View style={styles.stepper}>
        <IconButton icon="minus" mode="outlined" style={styles.step} disabled={value <= 1} onPress={() => onChange(Math.max(1, value - 1))} accessibilityLabel="One less" />
        <TextInput
          mode="outlined"
          dense
          style={styles.qty}
          value={number.text}
          onChangeText={number.onChangeText}
          onBlur={number.onBlur}
          keyboardType="decimal-pad"
          maxLength={10}
          accessibilityLabel={`Quantity in ${unit}`}
        />
        <IconButton icon="add" mode="outlined" style={styles.step} onPress={() => onChange(value + 1)} accessibilityLabel="One more" />
      </View>
      {number.error ? (
        <HelperText type="error" padding="none">
          {number.error}
        </HelperText>
      ) : null}
    </View>
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

/** "₱72.00 per Nos · 10% off · Coffee promo": what one unit sells at, and what brought it under the list's rate. */
function lineSummary(line: SaleLine, unit: string, money: (value: number) => string) {
  const parts = [`${money(line.rate)} per ${unit}`];
  if (line.discountAmount > 0) parts.push(`${Number(line.discountPercentage.toFixed(2))}% off`);
  if (line.pricingRule) parts.push(line.pricingRule.title);
  return parts.join(' · ');
}

/**
 * One line of the cart, a card: the item, what a unit sells at and the trash; the quantity's stepper, the unit where
 * the item sells in several, the Discount chip where the profile lets the price change, and the line's amount. The
 * chip opens the line's Rate, Discount (%) and Discount Amount — three ways to say one thing, so typing one empties
 * the other two.
 */
export function CartLineRow({ sessionId, line, typed, item, uoms, rateEditable, discountEditable, money }: Props) {
  const index = line.cartIndex;
  const { colors } = useAppTheme();
  const [pricing, setPricing] = useState(false);
  const unitName = (id: string) => uoms.find((uom) => uom.id === id)?.uom_name ?? 'Unit';
  // The chip's "on": something typed stands in for the price list's rate.
  const repriced = typed.rate !== null || (typed.discountPercentage ?? null) !== null || (typed.discountAmount ?? null) !== null;

  return (
    <View style={[styles.card, { borderColor: colors.outlineVariant }]}>
      <View style={styles.head}>
        <View style={styles.fill}>
          <Text variant="titleMedium">{line.itemName}</Text>
          <Text variant="bodySmall" style={{ color: line.priced ? colors.onSurfaceMuted : colors.error }}>
            {line.priced ? lineSummary(line, unitName(line.uomId), money) : 'No price list prices this item.'}
          </Text>
        </View>
        <IconButton icon="delete" style={styles.trash} accessibilityLabel={`Remove ${line.itemName} from the cart`} onPress={() => removeCartLine(sessionId, index)} />
      </View>
      <View style={styles.controls}>
        <Stepper value={line.qty} unit={unitName(line.uomId)} onChange={(qty) => updateCartLine(sessionId, index, { qty })} />
        {rateEditable || discountEditable ? <DiscountChip open={pricing} on={repriced} onPress={() => setPricing(!pricing)} /> : null}
        <Text variant="amount" style={styles.amount}>
          {money(line.amount)}
        </Text>
      </View>
      <UnitSelect
        item={item}
        value={line.uomId}
        unitName={unitName}
        // Another unit is another price: the rate goes back to the price list's, and an amount off the old unit goes.
        onChange={(uomId) => updateCartLine(sessionId, index, { uomId, rate: null, discountAmount: null })}
      />
      {pricing ? (
        <Pricing
          line={line}
          typed={typed}
          unit={unitName(line.uomId)}
          rateEditable={rateEditable}
          discountEditable={discountEditable}
          onPrice={(patch) => updateCartLine(sessionId, index, patch)}
        />
      ) : null}
    </View>
  );
}

type UnitProps = { item: Item | undefined; value: string; unitName: (id: string) => string; onChange: (uomId: string) => void };

/** The line's unit, where the item sells in more than its stock unit; nothing where it sells in that one alone. */
function UnitSelect({ item, value, unitName, onChange }: UnitProps) {
  const unitIds = item ? [item.stock_uom, ...item.item_uoms.map((unit) => unit.uom_id).filter((id) => id !== item.stock_uom)] : [];
  if (unitIds.length < 2) return null;

  return (
    <FieldGrid>
      <SearchSelect label="UOM" title="UOM" value={value} options={unitIds.map((id) => ({ value: id, label: unitName(id) }))} onChange={onChange} />
    </FieldGrid>
  );
}

/** The line's Discount chip, with an "on" badge while a typed rate or discount stands in for the price list's. */
function DiscountChip({ open, on, onPress }: { open: boolean; on: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.chip}>
      <Chip mode="outlined" selected={open} showSelectedCheck={false} onPress={onPress} accessibilityLabel={on ? 'Discount, on' : 'Discount'}>
        Discount
      </Chip>
      {on ? <Badge style={{ backgroundColor: colors.accent, color: colors.onAccent }}>on</Badge> : null}
    </View>
  );
}

type PricingProps = Pick<Props, 'line' | 'typed' | 'rateEditable' | 'discountEditable'> & {
  unit: string;
  onPrice: (patch: Pick<CartLine, 'rate' | 'discountPercentage' | 'discountAmount'>) => void;
};

/** What the chip opens: the line's Rate, Discount (%) and Discount Amount, as far as the POS Profile lets each change. */
function Pricing({ line, typed, unit, rateEditable, discountEditable, onPrice }: PricingProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.pricing, { borderTopColor: colors.outlineVariant }]}>
      <FieldGrid>
        {rateEditable ? (
          <NumberField
            label="Rate"
            hint="Blank takes the price list's"
            // The typed rate only: the price list's shows as the placeholder.
            value={typed.rate}
            placeholder={String(line.priceListRate)}
            blank
            min={0}
            onChange={(rate) => onPrice({ rate, discountPercentage: null, discountAmount: null })}
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
              onChange={(discountPercentage) => onPrice({ rate: null, discountPercentage, discountAmount: null })}
            />
            <NumberField
              label="Discount Amount"
              hint={`Off each ${unit}`}
              value={typed.discountAmount ?? null}
              placeholder="0"
              blank
              min={0}
              onChange={(discountAmount) => onPrice({ rate: null, discountPercentage: null, discountAmount })}
            />
          </>
        ) : null}
      </FieldGrid>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, gap: spacing.xs },
  card: { gap: spacing.ms, padding: spacing.ms, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  // Level with the card's corner, as the mock-up's trash is: IconButton's own margin is Paper's.
  trash: { margin: 0 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing.ms },
  stepperField: { gap: spacing.xs },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  step: { margin: 0 },
  // A fixed-size control (.claude/instruction_mds/frontend.md §4.6): wide enough for "999.5".
  qty: { width: 72, textAlign: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  amount: { marginLeft: 'auto' },
  // Solid: Android draws no dashed border on one side alone.
  pricing: { paddingTop: spacing.ms, borderTopWidth: 1 },
});
