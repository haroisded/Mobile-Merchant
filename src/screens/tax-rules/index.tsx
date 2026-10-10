import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList } from '../../components/record-list';
import { useItemGroupsQuery } from '../../features/item-groups/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useSalesTaxTemplatesQuery } from '../../features/sales-tax-templates/queries';
import { useTaxCategoriesQuery } from '../../features/tax-categories/queries';
import { ruleDates, useTaxRulesQuery } from '../../features/tax-rules/queries';
import type { TaxRule } from '../../features/tax-rules/queries';
import { spacing } from '../../themes';

const openForm = (merchantId: string, ruleId?: string) =>
  router.push({ pathname: '/forms/tax-rule', params: ruleId ? { merchantId, ruleId } : { merchantId } });

/**
 * Tax Rules (docs.frappe.io/erpnext/tax-rule): which Sales Taxes and Charges Template a sale takes, chosen
 * from its tax category, its item group and its date. Sales only. Which Template? checks a sale against them.
 */
export function TaxRules({ merchant }: { merchant: Merchant }) {
  const rules = useTaxRulesQuery({ merchantId: merchant.id });
  // Names for the columns: every member may select these (All's Select on each).
  const templates = useSalesTaxTemplatesQuery({ merchantId: merchant.id }).data;
  const categories = useTaxCategoriesQuery({ merchantId: merchant.id }).data;
  const groups = useItemGroupsQuery({ merchantId: merchant.id }).data;
  const permissions = usePermissions({ merchantId: merchant.id }).data;

  const template = (rule: TaxRule) => templates?.find((candidate) => candidate.id === rule.sales_tax_template_id)?.title ?? '…';
  // "Tax Category: Exempt · Item Group: Services", or every sale when both are blank.
  const conditions = (rule: TaxRule) =>
    [
      rule.tax_category_id ? `Tax Category: ${categories?.find((category) => category.id === rule.tax_category_id)?.title ?? '…'}` : null,
      rule.item_group_id ? `Item Group: ${groups?.find((group) => group.id === rule.item_group_id)?.item_group_name ?? '…'}` : null,
    ]
      .filter((condition) => condition !== null)
      .join(' · ') || 'Every sale';

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Setup"
        title="Tax Rules"
        meta={rules.data ? `${rules.data.length} ${rules.data.length === 1 ? 'rule' : 'rules'}` : undefined}
        onBack={() => router.back()}
        actions={
          <View style={styles.actions}>
            <Button mode="outlined" icon="search" onPress={() => router.push({ pathname: '/forms/tax-rule-check', params: { merchantId: merchant.id } })}>
              Which Template?
            </Button>
            {can(permissions, 'Tax Rule', 'create') ? (
              <Button mode="contained" icon="add" onPress={() => openForm(merchant.id)}>
                New Tax Rule
              </Button>
            ) : null}
          </View>
        }
      />
      <RecordList
        query={rules}
        keyOf={(rule) => rule.id}
        columns={[
          { label: 'Sales Taxes and Charges Template', flex: 3, cell: template },
          { label: 'Conditions', flex: 3, cell: conditions },
          { label: 'Dates', flex: 2, cell: ruleDates },
          { label: 'Priority', flex: 1, cell: (rule) => String(rule.priority) },
        ]}
        title={template}
        subtitle={(rule) => `${conditions(rule)} · ${ruleDates(rule)} · Priority ${rule.priority}`}
        accessibilityLabel={(rule) => `Tax rule for ${template(rule)}, ${conditions(rule)}`}
        onPress={can(permissions, 'Tax Rule', 'write') ? (rule) => openForm(merchant.id, rule.id) : undefined}
        empty="No tax rules yet: every sale takes its POS Profile's or the default template."
        offline="You're offline. Tax rules will load when you reconnect."
        failure="Couldn't load tax rules. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
