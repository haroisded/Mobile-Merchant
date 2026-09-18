import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PageHeader } from '../../components/page-header';
import { RESOURCE_META } from '../../features/products/resources';
import type { ResourceScope, SetupList } from '../../features/products/resources';
import { spacing } from '../../themes';
import { CategoriesSection } from './categories-section';
import { SuppliersSection } from './suppliers-section';
import { TaxClassesSection } from './tax-classes-section';

/**
 * A screen's Setup: the lists its form's pickers create, in one place to rename and remove them. Each
 * section reads its own resource folder; this screen only stacks the ones that screen has.
 *
 * Which ones those are is RESOURCE_META[scope].setup: categories are per screen, tax classes belong to
 * the two screens that price things, and suppliers to Inventory, which is where stock is bought
 *.
 */
export function ProductSetup({ merchantId, scope }: { merchantId: string; scope: ResourceScope }) {
  const meta = RESOURCE_META[scope];
  // Spread, so the union of per-scope tuples widens to one array type and `includes` accepts any of
  // the three list names rather than only the ones this scope happens to hold.
  const lists: SetupList[] = [...meta.setup];

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker={meta.title}
        title="Setup"
        meta={lists.map((list) => SETUP_LABEL[list]).join(', ')}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {lists.includes('categories') ? <CategoriesSection merchantId={merchantId} scope={scope} /> : null}
        {lists.includes('taxClasses') ? <TaxClassesSection merchantId={merchantId} /> : null}
        {lists.includes('suppliers') ? <SuppliersSection merchantId={merchantId} /> : null}
      </ScrollView>
    </View>
  );
}

const SETUP_LABEL = {
  categories: 'Categories',
  taxClasses: 'tax classes',
  suppliers: 'suppliers',
} as const;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: spacing.xl, padding: spacing.md, paddingBottom: spacing.xl },
});
