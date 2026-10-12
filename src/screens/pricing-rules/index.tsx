import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import { useMoney } from '../../features/currencies/queries';
import type { Merchant } from '../../features/merchants/queries';
import { usePricingRulesQuery } from '../../features/pricing-rules/queries';
import type { PricingRule } from '../../features/pricing-rules/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { ruleDates } from '../../features/tax-rules/queries';

// A form with rows: a page of the Setup stack at every width, not a forms/ Dialog
// (.claude/instruction_mds/frontend.md §4.4).
const openRule = (merchantId: string, ruleId?: string) =>
  router.push({ pathname: '/systems/[id]/setup/pricing-rule', params: ruleId ? { id: merchantId, ruleId } : { id: merchantId } });

const status = (rule: PricingRule) => (rule.disable ? ['Disabled'] : ['Enabled']);

/** "Item Group · 2": what the rule is looked up by, and how many of them it names. */
const appliesOn = (rule: PricingRule) => `${rule.apply_on} · ${rule.pricing_rule_targets.length}`;

/**
 * Pricing Rules (docs.frappe.io/erpnext/pricing-rule): the automatic discounts. A rule names the items, item
 * groups or brands it applies on, the quantities, amounts and dates it holds for, and the rate or discount it
 * gives; the Register applies the one that fits a line.
 */
export function PricingRules({ merchant }: { merchant: Merchant }) {
  const rules = usePricingRulesQuery({ merchantId: merchant.id });
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const money = useMoney(merchant);

  // "10% off", "₱ 5.00 off", "Rate ₱ 70.00".
  const gives = (rule: PricingRule) => {
    if (rule.rate_or_discount === 'Rate') return `Rate ${money(rule.rate)}`;
    return rule.rate_or_discount === 'Discount Amount' ? `${money(rule.discount_amount)} off` : `${rule.discount_percentage}% off`;
  };
  const dates = (rule: PricingRule) => ruleDates({ from_date: rule.valid_from, to_date: rule.valid_upto });
  const count = rules.data?.length;

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Setup"
        title="Pricing Rules"
        meta={count === undefined ? undefined : `${count} ${count === 1 ? 'rule' : 'rules'}`}
        onBack={() => router.back()}
        actions={
          can(permissions, 'Pricing Rule', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openRule(merchant.id)} contentStyle={styles.leading}>
              New Pricing Rule
            </Button>
          ) : null
        }
      />
      <RecordList
        query={rules}
        keyOf={(rule) => rule.id}
        columns={[
          { label: 'Title', flex: 3, cell: (rule) => rule.title },
          { label: 'Apply On', flex: 2, cell: appliesOn },
          { label: 'Gives', flex: 2, cell: gives },
          { label: 'Valid', flex: 2, cell: dates },
          { label: 'Priority', flex: 1, cell: (rule) => String(rule.priority) },
          { label: 'Status', flex: 1, cell: () => '', node: (rule) => <StatusText words={status(rule)} faint={rule.disable} /> },
        ]}
        title={(rule) => rule.title}
        subtitle={(rule) => `${gives(rule)} · ${appliesOn(rule)} · ${dates(rule)}`}
        status={(rule) => <StatusText words={status(rule)} faint={rule.disable} />}
        accessibilityLabel={(rule) => `Pricing Rule ${rule.title}, ${gives(rule)}`}
        onPress={(rule) => openRule(merchant.id, rule.id)}
        empty="No pricing rules yet. Add one to discount an item, an item group or a brand by itself."
        offline="You're offline. Pricing rules will load when you reconnect."
        failure="Couldn't load the pricing rules. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
});
