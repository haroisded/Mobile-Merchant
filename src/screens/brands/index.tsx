import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList } from '../../components/record-list';
import { useBrandsQuery } from '../../features/brands/queries';
import type { Brand } from '../../features/brands/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';

const openForm = (merchantId: string, brandId?: string) => router.push({ pathname: '/forms/brand', params: brandId ? { merchantId, brandId } : { merchantId } });

const description = (brand: Brand) => brand.description ?? 'No description';

/**
 * Brands (docs.frappe.io/erpnext/brand): the name an item is sold under, with the sales defaults its items
 * will take — warehouse, price list, selling cost center, income account.
 */
export function Brands({ merchant }: { merchant: Merchant }) {
  const brands = useBrandsQuery({ merchantId: merchant.id });
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const editable = can(permissions, 'Brand', 'write');

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Setup"
        title="Brands"
        meta={brands.data ? `${brands.data.length} ${brands.data.length === 1 ? 'brand' : 'brands'}` : undefined}
        onBack={() => router.back()}
        actions={
          can(permissions, 'Brand', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openForm(merchant.id)} contentStyle={styles.leading}>
              New Brand
            </Button>
          ) : null
        }
      />
      <RecordList
        query={brands}
        keyOf={(brand) => brand.id}
        columns={[
          { label: 'Brand', flex: 2, cell: (brand) => brand.brand },
          { label: 'Description', flex: 3, cell: description },
        ]}
        title={(brand) => brand.brand}
        subtitle={description}
        accessibilityLabel={(brand) => `Brand ${brand.brand}`}
        onPress={editable ? (brand) => openForm(merchant.id, brand.id) : undefined}
        empty="No brands yet."
        offline="You're offline. Brands will load when you reconnect."
        failure="Couldn't load brands. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
});
