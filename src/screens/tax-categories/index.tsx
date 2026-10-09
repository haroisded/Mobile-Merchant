import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useTaxCategoriesQuery } from '../../features/tax-categories/queries';
import type { TaxCategory } from '../../features/tax-categories/queries';

const openForm = (merchantId: string, categoryId?: string) =>
  router.push({ pathname: '/forms/tax-category', params: categoryId ? { merchantId, categoryId } : { merchantId } });

const status = (category: TaxCategory) => (category.disabled ? ['Disabled'] : ['Enabled']);

/**
 * Tax Categories (docs.frappe.io/erpnext/tax-category): the names of tax treatments — Standard, Exempt … —
 * that a template, and later an Item, Item Group and POS Profile, is tagged with. A category holds no rate.
 */
export function TaxCategories({ merchant }: { merchant: Merchant }) {
  const categories = useTaxCategoriesQuery({ merchantId: merchant.id });
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const editable = can(permissions, 'Tax Category', 'write');

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Setup"
        title="Tax Categories"
        meta={categories.data ? `${categories.data.length} ${categories.data.length === 1 ? 'category' : 'categories'}` : undefined}
        onBack={() => router.back()}
        actions={
          can(permissions, 'Tax Category', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openForm(merchant.id)} contentStyle={styles.leading}>
              New Tax Category
            </Button>
          ) : null
        }
      />
      <RecordList
        query={categories}
        keyOf={(category) => category.id}
        columns={[
          { label: 'Title', flex: 3, cell: (category) => category.title },
          { label: 'Status', flex: 1, cell: () => '', node: (category) => <StatusText words={status(category)} faint={category.disabled} /> },
        ]}
        title={(category) => category.title}
        status={(category) => <StatusText words={status(category)} faint={category.disabled} />}
        accessibilityLabel={(category) => `Tax category ${category.title}`}
        onPress={editable ? (category) => openForm(merchant.id, category.id) : undefined}
        empty="No tax categories yet. Add one when some sales are taxed differently — exempt, or zero-rated."
        offline="You're offline. Tax categories will load when you reconnect."
        failure="Couldn't load tax categories. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
});
