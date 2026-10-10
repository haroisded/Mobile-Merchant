import { useItemGroupsQuery } from '../../features/item-groups/queries';
import type { ItemGroup } from '../../features/item-groups/queries';
import { useSalesTaxTemplatesQuery } from '../../features/sales-tax-templates/queries';
import type { SalesTaxTemplate } from '../../features/sales-tax-templates/queries';
import { useTaxCategoriesQuery } from '../../features/tax-categories/queries';
import type { TaxCategory } from '../../features/tax-categories/queries';
import { useTaxRulesQuery } from '../../features/tax-rules/queries';
import type { TaxRule } from '../../features/tax-rules/queries';

export type TaxRuleRecords = { rules: TaxRule[]; templates: SalesTaxTemplate[]; categories: TaxCategory[]; groups: ItemGroup[] };

/**
 * The rules and what they name — templates, tax categories, item groups — for the rule form and Which
 * Template?; undefined until all four load. Opened from Tax Rules, which fetched the same keys, so cache hits.
 */
export function useTaxRuleRecords({ merchantId }: { merchantId: string }): TaxRuleRecords | undefined {
  const rules = useTaxRulesQuery({ merchantId }).data;
  const templates = useSalesTaxTemplatesQuery({ merchantId }).data;
  const categories = useTaxCategoriesQuery({ merchantId }).data;
  const groups = useItemGroupsQuery({ merchantId }).data;
  return rules && templates && categories && groups ? { rules, templates, categories, groups } : undefined;
}
