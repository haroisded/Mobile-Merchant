import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useSalesTaxTemplatesQuery } from '../../features/sales-tax-templates/queries';
import type { SalesTaxTemplate } from '../../features/sales-tax-templates/queries';
import { useTaxCategoriesQuery } from '../../features/tax-categories/queries';
import { spacing } from '../../themes';

// A long form with its rows: a page of the Setup stack at every width, not a forms/ Dialog
// (.claude/instruction_mds/frontend.md §4.4).
const openTemplate = (merchantId: string, templateId?: string) =>
  router.push({ pathname: '/systems/[id]/setup/sales-tax-template', params: templateId ? { id: merchantId, templateId } : { id: merchantId } });

const status = (template: SalesTaxTemplate) => [template.is_default ? 'Default' : null, template.disabled ? 'Disabled' : null].filter((word) => word !== null);

/**
 * Sales Taxes and Charges Templates (docs.frappe.io/erpnext/sales-taxes-and-charges-template): the tax and
 * charge rows a sale gets — chosen by the POS Profile, or by a Tax Rule from its Tax Category.
 */
export function SalesTaxTemplates({ merchant }: { merchant: Merchant }) {
  const templates = useSalesTaxTemplatesQuery({ merchantId: merchant.id });
  const categories = useTaxCategoriesQuery({ merchantId: merchant.id }).data;
  const permissions = usePermissions({ merchantId: merchant.id }).data;

  // "VAT @ 12, Service charge": what a sale gets, in row order. Without the template's read, no rows come back.
  const taxes = (template: SalesTaxTemplate) => template.sales_tax_template_rows.map((row) => row.description).join(', ') || 'No rows';
  const category = (template: SalesTaxTemplate) => categories?.find((candidate) => candidate.id === template.tax_category_id)?.title ?? '';
  // Which one a new sale starts with: the default, chosen on the template itself.
  const fallback = templates.data?.find((template) => template.is_default)?.title;

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Setup"
        title="Sales Taxes and Charges Templates"
        meta={templates.data ? (fallback ? `Default: ${fallback}` : 'No default template') : undefined}
        onBack={() => router.back()}
        actions={
          <View style={styles.actions}>
            {/* Left of New Template: a saved template on a sample line (./test-template.tsx), as Tax Rules' Which Template? */}
            {templates.data && templates.data.length > 0 ? (
              <Button mode="outlined" icon="search" onPress={() => router.push({ pathname: '/forms/test-sales-tax-template', params: { merchantId: merchant.id } })} contentStyle={styles.leading}>
                Test Template
              </Button>
            ) : null}
            {can(permissions, 'Sales Taxes and Charges Template', 'create') ? (
              <Button mode="contained" icon="add" onPress={() => openTemplate(merchant.id)} contentStyle={styles.leading}>
                New Template
              </Button>
            ) : null}
          </View>
        }
      />
      <RecordList
        query={templates}
        keyOf={(template) => template.id}
        columns={[
          { label: 'Title', flex: 2, cell: (template) => template.title },
          { label: 'Taxes and Charges', flex: 3, cell: taxes },
          { label: 'Tax Category', flex: 2, cell: category },
          { label: 'Status', flex: 1, cell: () => '', node: (template) => <StatusText words={status(template)} faint={template.disabled} /> },
        ]}
        title={(template) => template.title}
        subtitle={taxes}
        status={(template) => <StatusText words={status(template)} faint={template.disabled} />}
        accessibilityLabel={(template) => `Sales taxes and charges template ${template.title}`}
        onPress={can(permissions, 'Sales Taxes and Charges Template', 'read') ? (template) => openTemplate(merchant.id, template.id) : undefined}
        empty="No templates yet."
        offline="You're offline. Templates will load when you reconnect."
        failure="Couldn't load the templates. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
