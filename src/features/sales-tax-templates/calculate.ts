// A Sales Taxes and Charges Template applied to item lines: the part of ERPNext's taxes_and_totals this app
// needs (erpnext/controllers/taxes_and_totals.py — calculate_item_values, determine_exclusive_rate,
// calculate_net_total, calculate_taxes, calculate_totals). Discounts, multi-currency and purchase-side
// valuation are left out. Used by the template's Preview now and by the POS Invoice later.
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

export type TaxResult = {
  items: { amount: number; netAmount: number; netRate: number }[];
  netTotal: number;
  /** Each row's Amount and the running Total after it. */
  rows: { amount: number; total: number }[];
  totalTaxes: number;
  grandTotal: number;
};

type Round = (value: number, precision: number) => number;

// _get_tax_rate: an item template's rate for the row's account wins over the row's own.
const rateFor = (tax: TaxRow, line: ItemLine) => line.itemTaxRates?.get(tax.account) ?? tax.rate;

export function calculateTaxes(lines: ItemLine[], taxes: TaxRow[], precision: number, round: Round): TaxResult {
  const flt = (value: number) => round(value, precision);

  // calculate_item_values.
  const items = lines.map((line) => {
    const amount = flt(line.rate * line.qty);
    return { amount, netAmount: amount, netRate: line.rate };
  });

  // determine_exclusive_rate: back out the included taxes, row by row, as fractions of the net amount.
  if (taxes.some((tax) => tax.included_in_print_rate)) {
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
      current[i] = amount;
      grandForItem[i] = (i === 0 ? items[n].netAmount : grandForItem[i - 1]) + amount;
    });
  });

  // round_off_totals + set_cumulative_total.
  const rows: TaxResult['rows'] = [];
  taxes.forEach((_, i) => {
    const amount = flt(amounts[i]);
    rows.push({ amount, total: flt((i === 0 ? netTotal : rows[i - 1].total) + amount) });
  });

  // adjust_grand_total_for_inclusive_tax: a rounding difference of a few cents between the entered prices and
  // the recomputed total goes to the grand total, not to the taxes.
  let diff = 0;
  if (rows.length && taxes.some((tax) => tax.included_in_print_rate)) {
    const exclusive = rows.reduce((sum, row, i) => (taxes[i].included_in_print_rate ? sum : sum + row.amount), 0);
    const gap = flt(total + exclusive - rows[rows.length - 1].total);
    if (gap && Math.abs(gap) <= 5 / 10 ** precision) diff = gap;
  }

  // calculate_totals.
  const grandTotal = rows.length ? flt(rows[rows.length - 1].total + diff) : netTotal;
  return { items, netTotal, rows, totalTaxes: rows.length ? flt(grandTotal - netTotal - diff) : 0, grandTotal };
}
