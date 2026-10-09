import { useLocalSearchParams } from 'expo-router';

import { AccountsSettingsScreen } from '../../../../../screens/accounts-settings';

export default function AccountsSettingsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <AccountsSettingsScreen merchantId={id} />;
}
