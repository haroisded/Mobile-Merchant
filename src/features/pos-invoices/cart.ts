// The sale a cart becomes (.claude/erpnext-docs/POS-System-Added-Features.md 18.2–18.3): each line's price,
// the Sales Taxes and Charges Template, each item's Item Tax Template, the taxes and the totals — the one
// engine the Register, the Cart and Pay all read, and what public.pos_checkout() is sent. The database checks
// what it can without a second engine (supabase/migrations/20261012004616_pos_shift_and_sale.sql).
//
// Import-free at runtime, so tools/check-logic.mjs can run it under plain Node: the price lookup
// (item-prices/resolve.ts), the tax rule (tax-rules/resolve.ts), the tax arithmetic (sales-tax-templates/
// calculate.ts) and the rounding (src/lib/money.ts) come in as `engines`.
import type { Tables } from '../../lib/database.types';
import type { PriceRequest, PriceRow, ResolvedPrice } from '../item-prices/resolve';
import type { RuleLine, RuleRow } from '../pricing-rules/apply';
import type { AdditionalDiscount, ItemLine, TaxResult, TaxRow } from '../sales-tax-templates/calculate';
import type { RuleConditions, SaleContext } from '../tax-rules/resolve';

/**
 * One line of the cart. `rate` is what the cashier typed where the POS Profile allows it; null takes the
 * price list's. A discount typed on the line (20.1) is a percentage or an amount off one unit's Price List
 * Rate — one of the two at most, and none while a rate is typed.
 */
export type CartLine = { itemId: string; uomId: string; qty: number; rate: number | null; discountPercentage?: number | null; discountAmount?: number | null };

/** The sale's additional discount as typed (20.2): a percentage or an amount. `applyOn` null takes the POS Profile's Apply Discount On. */
export type CartDiscount = { applyOn: string | null; percentage: number | null; amount: number | null };

/** What buildSale takes off the sale for what was typed — nothing where the POS Profile does not allow a discount. */
export function additionalDiscount(typed: CartDiscount, profile: { apply_discount_on: string; allow_discount_change: boolean }): AdditionalDiscount | undefined {
  if (!profile.allow_discount_change || !(typed.percentage || typed.amount)) return undefined;
  return { applyOn: typed.applyOn ?? profile.apply_discount_on, percentage: typed.percentage ?? 0, amount: typed.amount ?? 0 };
}

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
  brand_id?: string | null;
  stock_uom: string;
  item_uoms: { uom_id: string; conversion_factor: number }[];
  item_taxes: ItemTaxRow[];
};

export type TemplateRow = TaxRow & { description: string };

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
  /** The Pricing Rules a line may take: none where the POS Profile ignores them. */
  pricingRules: RuleRow[];
  /** Accounts Settings: a tax an item's template names is added when the sale lacks it. */
  addTaxesFromItemTemplates: boolean;
  accountName: (accountId: string) => string;
  precision: number;
  /** Global Defaults' Disable Rounded Total. */
  roundedTotalDisabled: boolean;
  /** Apply Discounts (or the owner): whether a rate or discount typed on a line, and the sale's discount, count. */
  typedPrices: boolean;
};

export type Engines = {
  resolvePrice: (prices: PriceRow[], request: PriceRequest) => ResolvedPrice | null;
  resolveTaxRule: (rules: RuleConditions[], sale: SaleContext, disabled?: Set<string>) => RuleConditions | null;
  calculateTaxes: (lines: ItemLine[], taxes: TaxRow[], precision: number, round: (value: number, precision: number) => number, discount?: AdditionalDiscount) => TaxResult;
  pickPricingRule: (rules: RuleRow[], line: RuleLine) => RuleRow | null;
  ruleRate: (rule: RuleRow, listRate: number, factor: number) => number;
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
  /** What one unit is under its Price List Rate, and that as a percentage of it: ERPNext's two discount fields. */
  discountPercentage: number;
  discountAmount: number;
  rate: number;
  amount: number;
  netRate: number;
  netAmount: number;
  /** The line's share of the sale's additional discount, already out of `netAmount`. */
  distributed: number;
  /** The Pricing Rule that priced the line; null for the list's price and for anything typed. */
  pricingRule: { id: string; title: string } | null;
  itemTaxTemplateId: string | null;
  /** False: no price list gives it a rate and none was typed — the sale cannot be paid yet. */
  priced: boolean;
};

/** `byItem`: what the row charged each line, unrounded, in the lines' order. */
export type SaleTax = TemplateRow & { tax_amount: number; total: number; byItem: number[] };

export type Sale = {
  lines: SaleLine[];
  templateId: string | null;
  taxes: SaleTax[];
  /** The additional discount (20.2): what it was taken from, its percentage when it was given as one, and the amount. */
  applyDiscountOn: string;
  additionalDiscountPercentage: number;
  discountAmount: number;
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

/**
 * What one unit of a cart line sells for (20.1, 20.4): the rate typed; else the line's own discount off its
 * Price List Rate; else the Pricing Rule that covers it; else the list's rate. Anything typed on a line
 * stands in for a rule — the database takes a rule's line only at the rule's own rate.
 */
function priceLine(line: CartLine, item: SaleItem, setup: SaleSetup, engines: Engines) {
  const round = (value: number) => engines.round(value, setup.precision);
  const factor = conversionFactor(item, line.uomId);
  const price = listPrice(item, line.uomId, setup, engines);
  const priceListRate = price?.rate ?? 0;
  const typed = line.rate !== null || (line.discountPercentage ?? null) !== null || (line.discountAmount ?? null) !== null;
  const rule =
    typed || !price
      ? null
      : engines.pickPricingRule(setup.pricingRules, {
          itemId: item.id,
          brandId: item.brand_id ?? null,
          groupPath: setup.groupPath(item.item_group_id),
          stockQty: line.qty * factor,
          amount: line.qty * priceListRate,
          date: setup.date,
          priceListId: setup.priceList?.id ?? null,
        });

  let rate = priceListRate;
  if (line.rate !== null) rate = line.rate;
  else if (line.discountPercentage) rate = round(Math.max(priceListRate * (1 - line.discountPercentage / 100), 0));
  else if (line.discountAmount) rate = round(Math.max(priceListRate - line.discountAmount, 0));
  else if (rule) rate = round(engines.ruleRate(rule, priceListRate, factor));

  // "Calculated against the Price List Rate": a rate under the list's is a discount, however it came about.
  const discountAmount = round(Math.max(priceListRate - rate, 0));

  return {
    factor,
    rate,
    priceListRate,
    discountAmount,
    discountPercentage: priceListRate > 0 ? (discountAmount / priceListRate) * 100 : 0,
    pricingRule: rule ? { id: rule.id, title: rule.title } : null,
    priced: line.rate !== null || price !== null,
  };
}

/**
 * The sale's tax rows: its template's, and — "a tax an item's template names is added when the sale lacks
 * it" — a row at rate 0 for each such account, so only the items whose template names it are taxed by it
 * (ERPNext's add_taxes_from_item_tax_template). `itemTemplates` is each line's Item Tax Template.
 */
function taxRows(template: SaleTemplate | null, itemTemplates: (string | null)[], setup: SaleSetup) {
  const rows: TemplateRow[] = [...(template?.rows ?? [])];
  if (!setup.addTaxesFromItemTemplates) return rows;

  for (const itemTemplate of itemTemplates) {
    for (const account of setup.itemTaxRates.get(itemTemplate ?? '')?.keys() ?? []) {
      if (rows.some((row) => row.account === account)) continue;
      rows.push({ charge_type: 'On Net Total', account, rate: 0, tax_amount: 0, row_id: null, included_in_print_rate: false, description: setup.accountName(account) });
    }
  }
  return rows;
}

/** The cart priced, taxed and totalled, less `discount` — the sale's additional discount. A line whose item is gone is left out. */
export function buildSale(cart: CartLine[], setup: SaleSetup, engines: Engines, typedDiscount?: AdditionalDiscount): Sale {
  // Without Apply Discounts nothing typed counts — so a cart stored before the permission went is never refused
  // (discounts_not_permitted) for a field the screen no longer shows.
  const counted = setup.typedPrices ? cart : cart.map((line) => ({ ...line, rate: null, discountPercentage: null, discountAmount: null }));
  const discount = setup.typedPrices ? typedDiscount : undefined;
  const entries = counted.flatMap((line, cartIndex) => {
    const item = setup.items.get(line.itemId);
    if (!item) return [];

    const priced = priceLine(line, item, setup, engines);
    return [{ ...priced, line, cartIndex, item, taxTemplate: itemTaxTemplate(item, setup, priced.rate) }];
  });

  const template = saleTemplate(
    entries.map((entry) => entry.item),
    setup,
    engines
  );
  const rows = taxRows(
    template,
    entries.map((entry) => entry.taxTemplate),
    setup
  );

  const result = engines.calculateTaxes(
    entries.map((entry) => ({ rate: entry.rate, qty: entry.line.qty, itemTaxRates: setup.itemTaxRates.get(entry.taxTemplate ?? '') })),
    rows,
    setup.precision,
    engines.round,
    discount
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
      discountPercentage: entry.discountPercentage,
      discountAmount: entry.discountAmount,
      rate: entry.rate,
      amount: result.items[index].amount,
      netRate: result.items[index].netRate,
      netAmount: result.items[index].netAmount,
      distributed: result.items[index].distributed,
      pricingRule: entry.pricingRule,
      itemTaxTemplateId: entry.taxTemplate,
      priced: entry.priced,
    })),
    templateId: template?.id ?? null,
    taxes: rows.map((row, index) => ({ ...row, tax_amount: result.rows[index].amount, total: result.rows[index].total, byItem: result.rows[index].byItem })),
    applyDiscountOn: discount?.applyOn ?? 'Grand Total',
    // Kept where the discount was given as a percentage.
    additionalDiscountPercentage: discount && result.discountAmount > 0 ? discount.percentage : 0,
    discountAmount: result.discountAmount,
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
    apply_discount_on: sale.applyDiscountOn,
    additional_discount_percentage: sale.additionalDiscountPercentage,
    discount_amount: sale.discountAmount,
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
      discount_percentage: line.discountPercentage,
      discount_amount: line.discountAmount,
      rate: line.rate,
      amount: line.amount,
      net_rate: line.netRate,
      net_amount: line.netAmount,
      distributed_discount_amount: line.distributed,
      pricing_rule_id: line.pricingRule?.id ?? null,
      item_tax_template_id: line.itemTaxTemplateId,
    })),
    taxes: sale.taxes.map((tax) => ({
      charge_type: tax.charge_type,
      account_head: tax.account,
      description: tax.description,
      rate: tax.rate,
      row_id: tax.row_id,
      included_in_print_rate: tax.included_in_print_rate,
      tax_amount: tax.tax_amount,
      total: tax.total,
      item_wise_tax_detail: tax.byItem,
    })),
    payments: payments.filter((payment) => payment.amount > 0).map((payment) => ({ mode_of_payment_id: payment.mode_of_payment_id, amount: payment.amount })),
  };
}

// Returns (.claude/erpnext-docs/POS-System-Added-Features.md 19.1; docs.frappe.io/erpnext/sales-return): a
// return is made from the sale as it was stored, never from today's prices, templates or rules.

/** A line of a submitted sale. */
type SoldLine = Pick<
  Tables<'pos_invoice_items'>,
  | 'id'
  | 'item_id'
  | 'item_name'
  | 'qty'
  | 'uom_id'
  | 'conversion_factor'
  | 'price_list_rate'
  | 'discount_percentage'
  | 'discount_amount'
  | 'rate'
  | 'amount'
  | 'net_rate'
  | 'net_amount'
  | 'distributed_discount_amount'
  | 'pricing_rule_id'
  | 'item_tax_template_id'
>;

/** A tax row of a submitted sale. `item_wise_tax_detail` is what it charged each line, in the lines' order. */
type SoldTax = Pick<Tables<'pos_invoice_taxes'>, 'charge_type' | 'account_head' | 'description' | 'rate' | 'row_id' | 'included_in_print_rate' | 'item_wise_tax_detail'>;

/** A submitted sale as stored: as much of it as a return is made from. */
export type SoldInvoice = Pick<
  Tables<'pos_invoices'>,
  'id' | 'taxes_and_charges' | 'apply_discount_on' | 'additional_discount_percentage' | 'discount_amount' | 'net_total' | 'total_taxes_and_charges' | 'grand_total'
> & {
  pos_invoice_items: SoldLine[];
  pos_invoice_taxes: SoldTax[];
};

// Quantities are decimals: 0.3 less 0.1 has to read 0.2.
const tidy = (value: number) => Math.round(value * 1e6) / 1e6;

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/**
 * "Negative quantities up to what was sold": each line of a sale with what is left of it to return — sold,
 * less what the returns already submitted against it took. A return's quantities are below zero, so adding
 * them takes them off.
 */
export function returnableLines(invoice: SoldInvoice, returns: { pos_invoice_items: { return_against_item: string | null; qty: number }[] }[]) {
  const taken = new Map<string, number>();
  for (const line of returns.flatMap((made) => made.pos_invoice_items)) {
    if (line.return_against_item) taken.set(line.return_against_item, (taken.get(line.return_against_item) ?? 0) + line.qty);
  }

  return invoice.pos_invoice_items.map((line) => ({ line, left: tidy(line.qty + (taken.get(line.id) ?? 0)) }));
}

type Rounding = {
  round: (value: number) => number;
  /** A total at the currency's smallest coin. */
  cashRound: (value: number) => number;
  /** Global Defaults' Disable Rounded Total. */
  roundedTotalDisabled: boolean;
};

/**
 * The return of part of a sale: each line by its share of the line sold, at the rate it was sold at, and
 * each tax row by the same shares of what it charged each line. Nothing is recalculated — a template edited
 * since the sale changes no refund — and the database checks every figure against the sale
 * (supabase/migrations/20261012080419_pos_returns_and_voids.sql). Quantities, amounts and totals are below
 * zero, as ERPNext stores a return. `quantities` is what to take back of each line, by the line's id.
 */
export function buildReturn(invoice: SoldInvoice, quantities: ReadonlyMap<string, number>, { round, cashRound, roundedTotalDisabled }: Rounding) {
  const picked = invoice.pos_invoice_items.flatMap((line, position) => {
    const qty = quantities.get(line.id) ?? 0;
    return qty > 0 ? [{ line, position, qty, share: qty / line.qty }] : [];
  });

  const items = picked.map(({ line, qty, share }) => ({
    return_against_item: line.id,
    item_id: line.item_id,
    item_name: line.item_name ?? '',
    qty: -qty,
    uom_id: line.uom_id,
    conversion_factor: line.conversion_factor,
    stock_qty: -qty * line.conversion_factor,
    price_list_rate: line.price_list_rate,
    // Per unit, so the sale's own; its share of the additional discount goes back with it.
    discount_percentage: line.discount_percentage,
    discount_amount: line.discount_amount,
    rate: line.rate,
    amount: round(-line.amount * share),
    net_rate: line.net_rate,
    net_amount: round(-line.net_amount * share),
    distributed_discount_amount: round(-line.distributed_discount_amount * share),
    pricing_rule_id: line.pricing_rule_id,
    item_tax_template_id: line.item_tax_template_id,
  }));
  const netTotal = round(sum(items.map((item) => item.net_amount)));
  // The additional discount handed back: the sale's, by the share of it these lines took.
  const distributed = sum(invoice.pos_invoice_items.map((line) => line.distributed_discount_amount));
  const discountAmount = distributed ? round((invoice.discount_amount * sum(items.map((item) => item.distributed_discount_amount))) / distributed) : 0;

  let running = netTotal;
  const taxes = invoice.pos_invoice_taxes.map((tax) => {
    const charged = Array.isArray(tax.item_wise_tax_detail) ? tax.item_wise_tax_detail : [];
    const detail = picked.map(({ position, share }) => -(Number(charged[position]) || 0) * share);
    const amount = round(sum(detail));
    running = round(running + amount);

    return {
      charge_type: tax.charge_type,
      account_head: tax.account_head,
      description: tax.description,
      rate: tax.rate,
      row_id: tax.row_id,
      included_in_print_rate: tax.included_in_print_rate,
      tax_amount: amount,
      total: running,
      item_wise_tax_detail: detail,
    };
  });
  const totalTaxes = round(sum(taxes.map((tax) => tax.tax_amount)));

  // An inclusive tax can leave a sale's grand total a few cents off net + tax; the return takes its share of that.
  const sold = sum(invoice.pos_invoice_items.map((line) => line.amount));
  const gap = invoice.grand_total - invoice.net_total - invoice.total_taxes_and_charges;
  const grandTotal = round(netTotal + totalTaxes + (sold ? (gap * sum(items.map((item) => item.amount))) / sold : 0));
  // The magnitude is what is rounded, so the return of a whole sale hands back the sale's own Rounded Total.
  const roundedTotal = roundedTotalDisabled ? grandTotal : round(-cashRound(-grandTotal));

  return { items, taxes, discountAmount, netTotal, totalTaxes, grandTotal, roundingAdjustment: round(roundedTotal - grandTotal), roundedTotal };
}

/**
 * What public.pos_checkout() takes for a return: the sale it is made against, the figures above, and what is
 * handed back per payment method — the whole of it, so nothing is change and nothing is written off.
 */
export function returnPayload(
  invoice: SoldInvoice,
  made: ReturnType<typeof buildReturn>,
  session: { id: string; pos_profile_id: string },
  refunds: { mode_of_payment_id: string; amount: number }[]
) {
  return {
    pos_profile_id: session.pos_profile_id,
    pos_opening_entry_id: session.id,
    taxes_and_charges: invoice.taxes_and_charges,
    return_against: invoice.id,
    apply_discount_on: invoice.apply_discount_on,
    additional_discount_percentage: invoice.additional_discount_percentage,
    discount_amount: made.discountAmount,
    net_total: made.netTotal,
    total_taxes_and_charges: made.totalTaxes,
    grand_total: made.grandTotal,
    rounding_adjustment: made.roundingAdjustment,
    rounded_total: made.roundedTotal,
    paid_amount: made.roundedTotal,
    change_amount: 0,
    write_off_amount: 0,
    items: made.items,
    taxes: made.taxes,
    payments: refunds.filter((refund) => refund.amount > 0).map((refund) => ({ mode_of_payment_id: refund.mode_of_payment_id, amount: -refund.amount })),
  };
}
