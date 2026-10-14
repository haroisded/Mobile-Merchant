import { useLocalSearchParams } from 'expo-router';

import { useMerchant } from '../../../../../features/merchants/queries';
import { RolesScreen } from '../../../../../screens/employees/roles';

export default function RolesRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const system = useMerchant(id);

  return system ? <RolesScreen {...system} /> : null;
}
