import { router, useLocalSearchParams } from 'expo-router';

import { ItemTaxTemplateForm } from '../../../screens/item-tax-templates/item-tax-template-form';

// Create or edit an Item Tax Template — a full page on a phone, a Dialog over Item Tax Templates on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function ItemTaxTemplatePage() {
  const { merchantId, templateId } = useLocalSearchParams<{ merchantId: string; templateId?: string }>();

  return <ItemTaxTemplateForm merchantId={merchantId} templateId={templateId} onDismiss={() => router.back()} />;
}
