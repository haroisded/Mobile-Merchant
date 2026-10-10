import { useLocalSearchParams } from 'expo-router';

import { SellingSettingsScreen } from '../../../../../screens/selling-settings';

export default function SellingSettingsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <SellingSettingsScreen merchantId={id} />;
}
