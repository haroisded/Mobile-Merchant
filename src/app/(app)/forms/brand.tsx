import { router, useLocalSearchParams } from 'expo-router';

import { BrandForm } from '../../../screens/brands/brand-form';

// Create or edit a brand — a full page on a phone, a Dialog over Brands on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function BrandPage() {
  const { merchantId, brandId } = useLocalSearchParams<{ merchantId: string; brandId?: string }>();

  return <BrandForm merchantId={merchantId} brandId={brandId} onDismiss={() => router.back()} />;
}
