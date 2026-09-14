import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PageHeader } from '../../../../../components/PageHeader';
import { CategoriesSection } from '../../../../../features/categories/CategoriesSection';
import { useShellMerchant } from '../../../../../features/merchants/queries';
import { SuppliersSection } from '../../../../../features/suppliers/SuppliersSection';
import { TaxClassesSection } from '../../../../../features/tax-classes/TaxClassesSection';

// Products' Setup: the three things the product form's pickers create, in one place to rename and
// remove them. Each section belongs to its own resource folder; this route only stacks them.
export default function SetupScreen() {
  const merchant = useShellMerchant();

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Products"
        title="Setup"
        meta="Categories, tax classes and suppliers"
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <CategoriesSection merchantId={merchant.id} />
        <TaxClassesSection merchantId={merchant.id} />
        <SuppliersSection merchantId={merchant.id} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: 28, padding: 16, paddingBottom: 32 },
});
