import { useLocalSearchParams } from 'expo-router';

import { SystemSettingsScreen } from '../../../../../screens/system-settings';

export default function SystemSettingsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <SystemSettingsScreen merchantId={id} />;
}
