// The sale a cart becomes (.claude/erpnext-docs/POS-System-Added-Features.md 18.2–18.3): each line's price,
// the Sales Taxes and Charges Template, each item's Item Tax Template, the taxes and the totals — the one
// engine the Register, the Cart and Pay all read, and what public.pos_checkout() is sent. The database checks
// what it can without a second engine (supabase/migrations/20261012004616_pos_shift_and_sale.sql).
//
// Import-free at runtime, so tools/check-logic.mjs can run it under plain Node: the price lookup
// (item-prices/resolve.ts), the tax rule (tax-rules/resolve.ts), the tax arithmetic (sales-tax-templates/
// calculate.ts) and the rounding (src/lib/money.ts) come in as `engines`.
import type { PriceRequest, PriceRow, ResolvedPrice } from '../item-prices/resolve';
import type { ItemLine, TaxResult, TaxRow } from '../sales-tax-templates/calculate';
import type { RuleConditions, SaleContext } from '../tax-rules/resolve';

/** One line of the cart. `rate` is what the cashier typed where the POS Profile allows it; null takes the price list's. */
export type CartLine = { itemId: string; uomId: string; qty: number; rate: number | null };

/** An Item Tax row of an Item or of an Item Group. */
export type ItemTaxRow = {
  item_tax_template_id: string;
  tax_category_id: string | null;
  /** "YYYY-MM-DD", or null for always. */
  valid_from: string | null;
  minimum_net_rate?: number;
  /** 0: no range. */
  maximum_net_rate?: number;
};

export type SaleItem = {
  id: string;
  item_name: string;
  item_group_id: string;
  stock_uom: string;
  item_uoms: { uom_id: string; conversion_factor: number }[];
  item_taxes: ItemTaxRow[];
};

export type TemplateRow = TaxRow & { description: string; cost_center: string | null };

export type SaleTemplate = { id: string; rows: TemplateRow[] };

type PriceList = PriceRequest['priceList'];

/** Everything a sale reads besides its cart: the masters, the POS Profile's choices and the settings. */
export type SaleSetup = {
  /** The system's day, "YYYY-MM-DD". */
  date: string;
  items: ReadonlyMap<string, SaleItem>;
  prices: PriceRow[];
  /** The POS Profile's price list, else Selling Settings' default; null when neither names one. */
  priceList: PriceList | null;
  /** Selling Settings' default price list while its fallback is on. */
  fallback: PriceList | null;
  /** An item group and every group above it, nearest first. */
  groupPath: (groupId: string) => string[];
  groupTaxes: ReadonlyMap<string, ItemTaxRow[]>;
  /** An Item Tax Template's rate by tax account; Not Applicable carries 0. */
  itemTaxRates: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** The enabled Sales Taxes and Charges Templates. */
  templates: SaleTemplate[];
  profileTemplateId: string | null;
  defaultTemplateId: string | null;
  taxCategoryId: string | null;
  rules: RuleConditions[];
  /** Accounts Settings: a tax an item's template names is added when the sale lacks it. */
  addTaxesFromItemTemplates: boolean;
  accountName: (accountId: string) => string;
  precision: number;
  /** Global Defaults' Disable Rounded Total. */
  roundedTotalDisabled: boolean;
};

export type Engines = {
  resolvePrice: (prices: PriceRow[], request: PriceRequest) => ResolvedPrice | null;
  resolveTaxRule: (rules: RuleConditions[], sale: SaleContext, disabled?: Set<string>) => RuleConditions | null;
  calculateTaxes: (lines: ItemLine[], taxes: TaxRow[], precision: number, round: (value: number, precision: number) => number) => TaxResult;
  round: (value: number, precision: number) => number;
  /** The grand total at the currency's smallest coin. */
  cashRound: (value: number) => number;
};

export type SaleLine = {
  /** The line's place in the cart: a line whose item is gone is left out of the sale, so the two can differ. */
  cartIndex: number;
  itemId: string;
  itemName: string;
  uomId: string;
  /** Stock units in one `uomId`. */
  conversionFactor: number;
  qty: number;
  stockQty: number;
  priceListRate: number;
  rate: number;
  amount: number;
  netRate: number;
  netAmount: number;
  itemTaxTemplateId: string | null;
  /** False: no price list gives it a rate and none was typed — the sale cannot be paid yet. */
  priced: boolean;
};

export type SaleTax = TemplateRow & { tax_amount: number; total: number };

export type Sale = {
  lines: SaleLine[];
  templateId: string | null;
  taxes: SaleTax[];
  netTotal: number;
  totalTaxes: number;
  grandTotal: number;
  roundingAdjustment: number;
  /** What is paid: the grand total at the smallest coin, or the grand total itself. */
  roundedTotal: number;
};

/** Stock units in one of `uomId`; 1 for the stock unit, and for a unit the item no longer lists. */
const conversionFactor = (item: SaleItem, uomId: string) =>
  uomId === item.stock_uom ? 1 : (item.item_uoms.find((unit) => unit.uom_id === uomId)?.conversion_factor ?? 1);

// ERPNext's get_item_tax_template, on one table: the rows for the sale's tax category (a row naming none
// takes any), already valid, whose net-rate range holds the rate. A named category wins over none, then the
// later Valid From.
function pickTaxRow(rows: ItemTaxRow[], setup: SaleSetup, rate: number) {
  const fits = rows.filter((row) => {
    const max = row.maximum_net_rate ?? 0;
    return (
      (row.tax_category_id === null || row.tax_category_id === setup.taxCategoryId) &&
      (row.valid_from === null || row.valid_from <= setup.date) &&
      (max === 0 || ((row.minimum_net_rate ?? 0) <= rate && rate <= max))
    );
  });
  const specific = (row: ItemTaxRow) => Number(row.tax_category_id !== null);
  return [...fits].sort((a, b) => specific(b) - specific(a) || (b.valid_from ?? '').localeCompare(a.valid_from ?? ''))[0]?.item_tax_template_id ?? null;
}

/** 13.5: the Item's own Item Tax rows come first; then its Item Group's, then each group above it. */
function itemTaxTemplate(item: SaleItem, setup: SaleSetup, rate: number) {
  const own = pickTaxRow(item.item_taxes, setup, rate);
  if (own) return own;

  for (const groupId of setup.groupPath(item.item_group_id)) {
    const fromGroup = pickTaxRow(setup.groupTaxes.get(groupId) ?? [], setup, rate);
    if (fromGroup) return fromGroup;
  }
  return null;
}

/**
 * 18.3, "Taxes from the POS Profile template or Tax Rule": the profile's template; else the Tax Rule for the
 * profile's tax category — a rule with an Item Group applies when every line is under that group; else the
 * default template. Null: the sale carries no template.
 */
function saleTemplate(items: SaleItem[], setup: SaleSetup, engines: Engines) {
  const enabled = new Map(setup.templates.map((template) => [template.id, template]));
  const fromProfile = setup.profileTemplateId ? enabled.get(setup.profileTemplateId) : undefined;
  if (fromProfile) return fromProfile;

  const paths = items.map((item) => setup.groupPath(item.item_group_id));
  const shared = (paths[0] ?? []).filter((groupId) => paths.every((path) => path.includes(groupId)));
  const disabled = new Set(setup.rules.map((rule) => rule.sales_tax_template_id).filter((id) => !enabled.has(id)));
  const rule = engines.resolveTaxRule(setup.rules, { taxCategoryId: setup.taxCategoryId, itemGroupIds: shared, date: setup.date }, disabled);

  return (rule ? enabled.get(rule.sales_tax_template_id) : undefined) ?? (setup.defaultTemplateId ? enabled.get(setup.defaultTemplateId) : undefined) ?? null;
}

/** What the price lists say one `uomId` of an item sells for today; null when none prices it. */
export function listPrice(item: SaleItem, uomId: string, setup: SaleSetup, engines: Engines) {
  if (!setup.priceList) return null;

  return engines.resolvePrice(setup.prices, {
    itemId: item.id,
    uomId,
    stockUomId: item.stock_uom,
    conversionFactor: conversionFactor(item, uomId),
    date: setup.date,
    priceList: setup.priceList,
    fallback: setup.fallback,
  });
}

type OfferedItem = SaleItem & { item_code: string; disabled: boolean; is_stock_item: boolean };

type Offer = {
  /** The POS Profile's item groups; none listed offers every group. */
  groupIds: string[];
  hideUnavailable: boolean;
  /** Stock units on hand in the POS Profile's warehouse, by item. */
  onHand: ReadonlyMap<string, number>;
  search: string;
};

/**
 * 18.2: the items a Register offers — enabled, under one of the POS Profile's item groups when it lists any,
 * on hand when it hides the rest (an item that keeps no stock is always available), and matching the search
 * by name or code.
 */
export function offeredItems<T extends OfferedItem>(items: T[], setup: Pick<SaleSetup, 'groupPath'>, offer: Offer) {
  const words = offer.search.trim().toLowerCase();

  return items.filter(
    (item) =>
      !item.disabled &&
      (offer.groupIds.length === 0 || setup.groupPath(item.item_group_id).some((groupId) => offer.groupIds.includes(groupId))) &&
      (!offer.hideUnavailable || !item.is_stock_item || (offer.onHand.get(item.id) ?? 0) > 0) &&
      (words === '' || item.item_name.toLowerCase().includes(words) || item.item_code.toLowerCase().includes(words))
  );
}

/** The cart priced, taxed and totalled. A line whose item is gone is left out. */
export function buildSale(cart: CartLine[], setup: SaleSetup, engines: Engines): Sale {
  const entries = cart.flatMap((line, cartIndex) => {
    const item = setup.items.get(line.itemId);
    if (!item) return [];

    const factor = conversionFactor(item, line.uomId);
    const price = listPrice(item, line.uomId, setup, engines);
    const rate = line.rate ?? price?.rate ?? 0;

    return [{ line, cartIndex, item, factor, rate, priceListRate: price?.rate ?? 0, priced: line.rate !== null || price !== null, taxTemplate: itemTaxTemplate(item, setup, rate) }];
  });

  const template = saleTemplate(
    entries.map((entry) => entry.item),
    setup,
    engines
  );
  const rows: TemplateRow[] = [...(template?.rows ?? [])];

  // "A tax an item's template names is added when the sale lacks it" — at rate 0, so only the items whose
  // template names that account are taxed by it (ERPNext's add_taxes_from_item_tax_template).
  if (setup.addTaxesFromItemTemplates) {
    for (const entry of entries) {
      for (const account of setup.itemTaxRates.get(entry.taxTemplate ?? '')?.keys() ?? []) {
        if (rows.some((row) => row.account === account)) continue;
        rows.push({ charge_type: 'On Net Total', account, rate: 0, tax_amount: 0, row_id: null, included_in_print_rate: false, description: setup.accountName(account), cost_center: null });
      }
    }
  }

  const result = engines.calculateTaxes(
    entries.map((entry) => ({ rate: entry.rate, qty: entry.line.qty, itemTaxRates: setup.itemTaxRates.get(entry.taxTemplate ?? '') })),
    rows,
    setup.precision,
    engines.round
  );
  const roundedTotal = setup.roundedTotalDisabled ? result.grandTotal : engines.cashRound(result.grandTotal);

  return {
    lines: entries.map((entry, index) => ({
      cartIndex: entry.cartIndex,
      itemId: entry.item.id,
      itemName: entry.item.item_name,
      uomId: entry.line.uomId,
      conversionFactor: entry.factor,
      qty: entry.line.qty,
      stockQty: entry.line.qty * entry.factor,
      priceListRate: entry.priceListRate,
      rate: entry.rate,
      amount: result.items[index].amount,
      netRate: result.items[index].netRate,
      netAmount: result.items[index].netAmount,
      itemTaxTemplateId: entry.taxTemplate,
      priced: entry.priced,
    })),
    templateId: template?.id ?? null,
    taxes: rows.map((row, index) => ({ ...row, tax_amount: result.rows[index].amount, total: result.rows[index].total })),
    netTotal: result.netTotal,
    totalTaxes: result.totalTaxes,
    grandTotal: result.grandTotal,
    roundingAdjustment: engines.round(roundedTotal - result.grandTotal, setup.precision),
    roundedTotal,
  };
}

/**
 * What each of the POS Profile's payment methods takes: what the cashier typed, a blank being nothing. Until
 * its field is typed in, the default method starts at `prefill` — the total, under "Set Grand Total to Default
 * Payment Method" (17.3). `shown` is the field's own value; null leaves it blank.
 */
export function tenderedAmounts(methods: { mode_of_payment_id: string; is_default: boolean }[], typed: Readonly<Record<string, number | null>>, prefill: number | null) {
  return methods.map((method) => {
    const shown = method.mode_of_payment_id in typed ? typed[method.mode_of_payment_id] : method.is_default ? prefill : null;
    return { mode_of_payment_id: method.mode_of_payment_id, shown, amount: shown ?? 0 };
  });
}

/** 18.3, "paid in full, change returned": what was handed over against the total. `shortfall` is what a write-off would have to cover. */
export function settle(roundedTotal: number, tendered: number[], round: (value: number) => number) {
  const paid = round(tendered.reduce((sum, amount) => sum + amount, 0));
  return { paid, change: round(Math.max(paid - roundedTotal, 0)), shortfall: round(Math.max(roundedTotal - paid, 0)) };
}

/** What public.pos_checkout() takes: the sale as calculated, and the payments with an amount. */
export function checkoutPayload(
  sale: Sale,
  session: { id: string; pos_profile_id: string },
  payments: { mode_of_payment_id: string; amount: number }[],
  settled: ReturnType<typeof settle>
) {
  return {
    pos_profile_id: session.pos_profile_id,
    pos_opening_entry_id: session.id,
    taxes_and_charges: sale.templateId,
    net_total: sale.netTotal,
    total_taxes_and_charges: sale.totalTaxes,
    grand_total: sale.grandTotal,
    rounding_adjustment: sale.roundingAdjustment,
    rounded_total: sale.roundedTotal,
    paid_amount: settled.paid,
    change_amount: settled.change,
    write_off_amount: settled.shortfall,
    items: sale.lines.map((line) => ({
      item_id: line.itemId,
      qty: line.qty,
      uom_id: line.uomId,
      conversion_factor: line.conversionFactor,
      stock_qty: line.stockQty,
      price_list_rate: line.priceListRate,
      rate: line.rate,
      amount: line.amount,
      net_rate: line.netRate,
      net_amount: line.netAmount,
      item_tax_template_id: line.itemTaxTemplateId,
    })),
    taxes: sale.taxes.map((tax) => ({
      charge_type: tax.charge_type,
      account_head: tax.account,
      description: tax.description,
      rate: tax.rate,
      row_id: tax.row_id,
      included_in_print_rate: tax.included_in_print_rate,
      cost_center: tax.cost_center,
      tax_amount: tax.tax_amount,
      total: tax.total,
    })),
    payments: payments.filter((payment) => payment.amount > 0).map((payment) => ({ mode_of_payment_id: payment.mode_of_payment_id, amount: payment.amount })),
  };
}
