// Which Sales Taxes and Charges Template a sale takes from the Tax Rules (docs.frappe.io/erpnext/tax-rule):
// the Tax Rules screen's "Which Template?" check now, the POS Invoice's tax selection later. Import-free, so
// tools/check-logic.mjs asserts it under Node.

export type RuleConditions = {
  sales_tax_template_id: string;
  tax_category_id: string | null;
  item_group_id: string | null;
  /** "YYYY-MM-DD", or null for open-ended. */
  from_date: string | null;
  to_date: string | null;
  /** 1 is the highest. */
  priority: number;
};

export type SaleContext = {
  taxCategoryId: string | null;
  /** The sale's item group and every group above it; empty for none. */
  itemGroupIds: string[];
  /** "YYYY-MM-DD" */
  date: string;
};

/**
 * The rule a sale takes, or null when none does. As the docs put it: a blank condition matches every sale,
 * and every filled one narrows the rule — an item group matches its own items and every group under it.
 * Of the rules that match, the one with the most conditions filled in wins, then priority 1 over 2, then the
 * earlier rule in `rules` (the database refuses two with the same conditions and priority on the same dates).
 * A winning rule whose template is in `disabled` picks nothing, as ERPNext's get_tax_template does.
 */
export function resolveTaxRule<T extends RuleConditions>(rules: T[], sale: SaleContext, disabled: Set<string> = new Set()): T | null {
  const filled = (rule: RuleConditions) => Number(rule.tax_category_id !== null) + Number(rule.item_group_id !== null);
  const matches = rules.filter(
    (rule) =>
      (rule.tax_category_id === null || rule.tax_category_id === sale.taxCategoryId) &&
      (rule.item_group_id === null || sale.itemGroupIds.includes(rule.item_group_id)) &&
      (rule.from_date === null || rule.from_date <= sale.date) &&
      (rule.to_date === null || sale.date <= rule.to_date)
  );
  // A stable sort, so equal rules keep their order in `rules`.
  const best = [...matches].sort((a, b) => filled(b) - filled(a) || a.priority - b.priority)[0];
  return best && !disabled.has(best.sales_tax_template_id) ? best : null;
}
