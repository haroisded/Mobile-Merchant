import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import { accountLabel, useAccountsQuery } from '../../features/accounts/queries';
import { useItemTaxTemplatesQuery } from '../../features/item-tax-templates/queries';
import type { ItemTaxTemplate } from '../../features/item-tax-templates/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';

const openForm = (merchantId: string, templateId?: string) =>
  router.push({ pathname: '/forms/item-tax-template', params: templateId ? { merchantId, templateId } : { merchantId } });

const status = (template: ItemTaxTemplate) => (template.disabled ? ['Disabled'] : ['Enabled']);

/**
 * Item Tax Templates (docs.frappe.io/erpnext/item-tax-template): a different rate, or none, for particular
 * items, per tax account — set on an Item or Item Group later. The sale's template keeps the tax row; this
 * only changes its rate for those items.
 */
export function ItemTaxTemplates({ merchant }: { merchant: Merchant }) {
  const itemTemplates = useItemTaxTemplatesQuery({ merchantId: merchant.id });
  const accounts = useAccountsQuery({ merchantId: merchant.id }).data;
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const editable = can(permissions, 'Item Tax Template', 'write');

  // "VAT - CC 4%", one per row.
  const rates = (template: ItemTaxTemplate) =>
    template.item_tax_template_rows
      .map((row) => {
        const account = accounts?.find((candidate) => candidate.id === row.account);
        return `${account ? accountLabel(account) : '…'} ${row.not_applicable ? 'not applicable' : `${row.tax_rate}%`}`;
      })
      .join(', ') || 'No rates';

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Setup"
        title="Item Tax Templates"
        meta={itemTemplates.data ? `${itemTemplates.data.length} ${itemTemplates.data.length === 1 ? 'template' : 'templates'}` : undefined}
        onBack={() => router.back()}
        actions={
          can(permissions, 'Item Tax Template', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openForm(merchant.id)} contentStyle={styles.leading}>
              New Item Tax Template
            </Button>
          ) : null
        }
      />
      <RecordList
        query={itemTemplates}
        keyOf={(item) => item.id}
        columns={[
          { label: 'Title', flex: 2, cell: (item) => item.title },
          { label: 'Rates', flex: 3, cell: rates },
          { label: 'Status', flex: 1, cell: () => '', node: (template) => <StatusText words={status(template)} faint={template.disabled} /> },
        ]}
        title={(template) => template.title}
        subtitle={rates}
        status={(template) => <StatusText words={status(template)} faint={template.disabled} />}
        accessibilityLabel={(template) => `Item tax template ${template.title}`}
        onPress={editable ? (template) => openForm(merchant.id, template.id) : undefined}
        empty="No item tax templates yet."
        offline="You're offline. Item tax templates will load when you reconnect."
        failure="Couldn't load item tax templates. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
});
