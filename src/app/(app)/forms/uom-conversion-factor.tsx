import { router, useLocalSearchParams } from 'expo-router';

import { UomConversionFactorForm } from '../../../screens/uom-conversion-factors/uom-conversion-factor-form';

// Create or edit a conversion — a full page on a phone, a Dialog over UOM Conversion Factors on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function UomConversionFactorPage() {
  const { merchantId, factorId } = useLocalSearchParams<{ merchantId: string; factorId?: string }>();

  return <UomConversionFactorForm merchantId={merchantId} factorId={factorId} onDismiss={() => router.back()} />;
}
