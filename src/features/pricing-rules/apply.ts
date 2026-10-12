// Which Pricing Rule prices a cart line, and what rate it gives (docs.frappe.io/erpnext/pricing-rule;
// .claude/erpnext-docs/POS-System-Added-Features.md 20.4). The database checks the rule a sale's line claims
// — that it covers the line and gives its rate (private.submit_pos_invoices) — and leaves the choosing here.
//
// Import-free, so tools/check-logic.mjs can run it under plain Node.

export type RuleRow = {
  id: string;
  title: string;
  apply_on: string;
  min_qty: number;
  /** 0: no upper limit. */
  max_qty: number;
  min_amt: number;
  /** 0: no upper limit. */
  max_amt: number;
  /** "YYYY-MM-DD", or null for no bound. */
  valid_from: string | null;
  valid_upto: string | null;
  /** Null: any price list. */
  for_price_list: string | null;
  priority: number;
  disable: boolean;
  rate_or_discount: string;
  rate: number;
  discount_percentage: number;
  discount_amount: number;
  created_at: string;
  pricing_rule_targets: { item_id: string | null; item_group_id: string | null; brand_id: string | null }[];
};

/** One line, as much of it as a rule's conditions read. */
export type RuleLine = {
  itemId: string;
  brandId: string | null;
  /** The item's group and every group above it: a rule on a group covers the groups under it. */
  groupPath: string[];
  /** The line's quantity in the item's stock unit, as ERPNext counts Min and Max Qty. */
  stockQty: number;
  /** Quantity × Price List Rate. */
  amount: number;
  /** The system's day, "YYYY-MM-DD". */
  date: string;
  priceListId: string | null;
};

const covers = (rule: RuleRow, line: RuleLine) =>
  !rule.disable &&
  (!rule.valid_from || rule.valid_from <= line.date) &&
  (!rule.valid_upto || rule.valid_upto >= line.date) &&
  (!rule.for_price_list || rule.for_price_list === line.priceListId) &&
  line.stockQty >= rule.min_qty &&
  (!rule.max_qty || line.stockQty <= rule.max_qty) &&
  line.amount >= rule.min_amt &&
  (!rule.max_amt || line.amount <= rule.max_amt) &&
  rule.pricing_rule_targets.some(
    (target) => target.item_id === line.itemId || (target.brand_id !== null && target.brand_id === line.brandId) || (target.item_group_id !== null && line.groupPath.includes(target.item_group_id))
  );

// The narrower rule first, as ERPNext looks a rule up: by item, then by its group, then by its brand.
const APPLY_ON = ['Item Code', 'Item Group', 'Brand'];

/**
 * The one rule a line takes, or null. Among the rules that cover it: the narrower Apply On, then the
 * priority — 1 is the highest, as a Tax Rule's reads — then a rule that names the price list over one for
 * any, then the older rule. Rejected: ERPNext's error at the till ("Multiple Price Rules exists with same
 * criteria") — a cashier cannot resolve it.
 */
export function pickPricingRule<T extends RuleRow>(rules: T[], line: RuleLine): T | null {
  const ranked = rules
    .filter((rule) => covers(rule, line))
    .sort(
      (a, b) =>
        APPLY_ON.indexOf(a.apply_on) - APPLY_ON.indexOf(b.apply_on) ||
        a.priority - b.priority ||
        Number(b.for_price_list !== null) - Number(a.for_price_list !== null) ||
        a.created_at.localeCompare(b.created_at)
    );
  return ranked[0] ?? null;
}

/**
 * The rate a rule gives one unit sold, unrounded: `listRate` is that unit's Price List Rate and `factor` its
 * stock units. A Rate is per stock unit; a Discount Amount comes off each unit sold, never below zero.
 */
export function ruleRate(rule: Pick<RuleRow, 'rate_or_discount' | 'rate' | 'discount_percentage' | 'discount_amount'>, listRate: number, factor: number) {
  if (rule.rate_or_discount === 'Rate') return rule.rate * factor;
  if (rule.rate_or_discount === 'Discount Percentage') return listRate * (1 - rule.discount_percentage / 100);
  return Math.max(listRate - rule.discount_amount, 0);
}
