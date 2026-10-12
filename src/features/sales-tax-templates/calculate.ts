// A Sales Taxes and Charges Template applied to item lines: the part of ERPNext's taxes_and_totals this app
// needs (erpnext/controllers/taxes_and_totals.py — calculate_item_values, determine_exclusive_rate,
// calculate_net_total, calculate_taxes, calculate_totals, and for a sale's additional discount
// set_discount_amount and apply_discount_amount). Multi-currency and purchase-side valuation are left out;
// a line's own discount is already in its rate. Used by the template's Preview and by the POS Invoice.
//
// Import-free, so tools/check-logic.mjs can run it under plain Node: the rounding comes in as `round`
// (src/lib/money.ts roundTo, bound to System Settings' rounding method) — frappe's flt(value, precision).

export const CHARGE_TYPES = ['On Net Total', 'Actual', 'On Previous Row Amount', 'On Previous Row Total', 'On Item Quantity'] as const;

export type ChargeType = (typeof CHARGE_TYPES)[number];

/** The two types that read an earlier row: its Amount, or its running Total. */
export const PREVIOUS_ROW_TYPES: readonly string[] = ['On Previous Row Amount', 'On Previous Row Total'];

export type TaxRow = {
  charge_type: string;
  account: string;
  /** A percentage; for On Item Quantity an amount per unit. */
  rate: number;
  /** An Actual row's fixed amount. */
  tax_amount: number;
  /** Reference Row #, 1-based. */
  row_id: number | null;
  included_in_print_rate: boolean;
};

export type ItemLine = {
  /** The price entered: tax-inclusive when an inclusive row applies. */
  rate: number;
  qty: number;
  /** An Item Tax Template's rates by tax account. A Not Applicable account carries 0. */
  itemTaxRates?: ReadonlyMap<string, number>;
};

/** A sale's Additional Discount (docs.frappe.io/erpnext/applying-discount). */
export type AdditionalDiscount = {
  /** "Grand Total" or "Net Total": what it is taken from. */
  applyOn: string;
  /** Above zero, a percentage of that total, and `amount` is not read. */
  percentage: number;
  amount: number;
};

export type TaxResult = {
  /** `distributed`: the line's share of the additional discount, already out of its net amount. */
  items: { amount: number; netAmount: number; netRate: number; distributed: number }[];
  netTotal: number;
  /**
   * Each row's Amount, the running Total after it, and what it charged each line, unrounded — ERPNext's
   * item_wise_tax_detail, which a return takes its share of.
   */
  rows: { amount: number; total: number; byItem: number[] }[];
  totalTaxes: number;
  grandTotal: number;
  /** The additional discount taken; 0 without one. */
  discountAmount: number;
};

type Round = (value: number, precision: number) => number;
type Flt = (value: number) => number;

/** The pass after an additional discount: each line's net amount as it left it, and the grand total to land on. */
type Discounted = { netAmounts: number[]; grandTotal: number | null };

// _get_tax_rate: an item template's rate for the row's account wins over the row's own.
const rateFor = (tax: TaxRow, line: ItemLine) => line.itemTaxRates?.get(tax.account) ?? tax.rate;

// One run of ERPNext's _calculate. `discounted` is its second run (discount_amount_applied): the entered
// amounts stand, the net amounts are the discounted ones, and determine_exclusive_rate is skipped.
function compute(lines: ItemLine[], taxes: TaxRow[], precision: number, flt: Flt, discounted: Discounted | null): TaxResult {
  // calculate_item_values.
  const items = lines.map((line, n) => {
    const amount = flt(line.rate * line.qty);
    if (!discounted) return { amount, netAmount: amount, netRate: line.rate, distributed: 0 };

    const netAmount = discounted.netAmounts[n];
    return { amount, netAmount, netRate: line.qty ? flt(netAmount / line.qty) : 0, distributed: 0 };
  });

  // determine_exclusive_rate: back out the included taxes, row by row, as fractions of the net amount.
  if (!discounted && taxes.some((tax) => tax.included_in_print_rate)) {
    lines.forEach((line, n) => {
      const fractions: number[] = [];
      const grandFractions: number[] = [];
      let cumulated = 0;
      let perQty = 0;

      taxes.forEach((tax, i) => {
        let fraction = 0;
        if (tax.included_in_print_rate) {
          const rate = rateFor(tax, line);
          const ref = (tax.row_id ?? 1) - 1;
          if (tax.charge_type === 'On Net Total') fraction = rate / 100;
          else if (tax.charge_type === 'On Previous Row Amount') fraction = (rate / 100) * (fractions[ref] ?? 0);
          else if (tax.charge_type === 'On Previous Row Total') fraction = (rate / 100) * (grandFractions[ref] ?? 1);
          else if (tax.charge_type === 'On Item Quantity') perQty += rate * line.qty;
        }
        fractions[i] = fraction;
        grandFractions[i] = (i === 0 ? 1 : grandFractions[i - 1]) + fraction;
        cumulated += fraction;
      });

      if (cumulated || perQty) {
        const netAmount = flt((items[n].amount - perQty) / (1 + cumulated));
        items[n] = { ...items[n], netAmount, netRate: line.qty ? flt(netAmount / line.qty) : 0 };
      }
    });
  }

  // calculate_net_total. `total` is the item amounts as entered.
  const total = flt(items.reduce((sum, item) => sum + item.amount, 0));
  const netTotal = flt(items.reduce((sum, item) => sum + item.netAmount, 0));

  // calculate_taxes: each row per item, unrounded until the last item.
  const amounts = taxes.map(() => 0);
  const byItem = taxes.map(() => lines.map(() => 0));
  const current = taxes.map(() => 0);
  const grandForItem = taxes.map(() => 0);
  const actualLeft = taxes.map((tax) => (tax.charge_type === 'Actual' ? flt(tax.tax_amount) : 0));

  lines.forEach((line, n) => {
    taxes.forEach((tax, i) => {
      const rate = rateFor(tax, line);
      const ref = (tax.row_id ?? 1) - 1;
      let amount = 0;
      // An Actual amount is spread over the items by net amount, the remainder on the last.
      if (tax.charge_type === 'Actual') amount = netTotal ? (items[n].netAmount * flt(tax.tax_amount)) / netTotal : 0;
      else if (tax.charge_type === 'On Net Total') amount = (rate / 100) * items[n].netAmount;
      else if (tax.charge_type === 'On Previous Row Amount') amount = (rate / 100) * (current[ref] ?? 0);
      else if (tax.charge_type === 'On Previous Row Total') amount = (rate / 100) * (grandForItem[ref] ?? 0);
      else if (tax.charge_type === 'On Item Quantity') amount = rate * line.qty;

      if (tax.charge_type === 'Actual') {
        actualLeft[i] -= amount;
        if (n === lines.length - 1) amount += actualLeft[i];
      }
      amounts[i] += amount;
      byItem[i][n] = amount;
      current[i] = amount;
      grandForItem[i] = (i === 0 ? items[n].netAmount : grandForItem[i - 1]) + amount;
    });
  });

  // round_off_totals + set_cumulative_total.
  const rows: TaxResult['rows'] = [];
  taxes.forEach((_, i) => {
    const amount = flt(amounts[i]);
    rows.push({ amount, total: flt((i === 0 ? netTotal : rows[i - 1].total) + amount), byItem: byItem[i] });
  });
  const last = rows.length ? rows[rows.length - 1].total : netTotal;

  return { items, netTotal, rows, discountAmount: 0, ...totals({ taxes, rows, total, netTotal, last }, precision, flt, discounted) };
}

type Summed = { taxes: TaxRow[]; rows: TaxResult['rows']; total: number; netTotal: number; last: number };

// calculate_totals. `diff` is what the grand total takes without it being a tax: a rounding difference of a
// few cents between tax-inclusive prices and the recomputed total (adjust_grand_total_for_inclusive_tax) —
// or, after a discount off the Grand Total, its rounding loss, so that total is the first one less the
// discount to the cent ("adjust Discount Amount loss in last tax iteration").
// ponytail: a discount off the Net Total drops the inclusive difference; ERPNext recomputes it. A few cents,
// on tax-inclusive prices only.
function totals({ taxes, rows, total, netTotal, last }: Summed, precision: number, flt: Flt, discounted: Discounted | null) {
  let diff = 0;
  if (discounted) {
    diff = discounted.grandTotal === null ? 0 : flt(discounted.grandTotal - last);
  } else if (rows.length && taxes.some((tax) => tax.included_in_print_rate)) {
    const exclusive = rows.reduce((sum, row, i) => (taxes[i].included_in_print_rate ? sum : sum + row.amount), 0);
    const gap = flt(total + exclusive - last);
    if (gap && Math.abs(gap) <= 5 / 10 ** precision) diff = gap;
  }

  const grandTotal = rows.length ? flt(last + diff) : netTotal;
  return { totalTaxes: rows.length ? flt(grandTotal - netTotal - diff) : 0, grandTotal };
}

// get_total_for_discount_amount: a fixed charge (Actual, On Item Quantity), and what a later row charges on
// it, stays out of the total a Grand Total discount is taken from.
function fixedCharges(taxes: TaxRow[], rows: TaxResult['rows']) {
  const fixed = new Map<number, number>();
  taxes.forEach((tax, i) => {
    if (tax.charge_type === 'Actual' || tax.charge_type === 'On Item Quantity') fixed.set(i + 1, rows[i].amount);
    else if (tax.row_id !== null && fixed.has(tax.row_id)) fixed.set(i + 1, ((fixed.get(tax.row_id) ?? 0) * tax.rate) / 100);
  });
  return [...fixed.values()].reduce((sum, amount) => sum + amount, 0);
}

export function calculateTaxes(lines: ItemLine[], taxes: TaxRow[], precision: number, round: Round, discount?: AdditionalDiscount): TaxResult {
  const flt: Flt = (value) => round(value, precision);
  const first = compute(lines, taxes, precision, flt, null);
  if (!discount) return first;

  // set_discount_amount: a percentage is of the total it applies on. Never more than there is to take.
  const onNet = discount.applyOn === 'Net Total';
  const base = onNet ? first.netTotal : flt(first.grandTotal - fixedCharges(taxes, first.rows));
  const amount = Math.min(flt(discount.percentage ? ((onNet ? first.netTotal : first.grandTotal) * discount.percentage) / 100 : discount.amount), base);
  if (amount <= 0) return first;

  // apply_discount_amount: spread over the lines by net amount; a rounding loss goes on the line that made it.
  let expected = 0;
  let net = 0;
  const netAmounts = first.items.map((item) => {
    expected += item.netAmount - (amount * item.netAmount) / base;
    const netAmount = flt(expected - net);
    net += netAmount;
    return netAmount;
  });

  const second = compute(lines, taxes, precision, flt, { netAmounts, grandTotal: onNet ? null : flt(first.grandTotal - amount) });
  return { ...second, discountAmount: amount, items: second.items.map((item, n) => ({ ...item, distributed: flt(first.items[n].netAmount - item.netAmount) })) };
}
