import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { SalesTaxTemplatePage } from '../../../../../screens/sales-tax-templates/template-form';

// One Sales Taxes and Charges Template, new without `templateId`. A page of the Setup stack at every width:
// a long form with rows and a preview (.claude/instruction_mds/frontend.md §4.4).
export default function SalesTaxTemplateRoute() {
  const { id, templateId } = useLocalSearchParams<{ id: string; templateId?: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <SalesTaxTemplatePage merchant={merchant} templateId={templateId} /> : null;
}
