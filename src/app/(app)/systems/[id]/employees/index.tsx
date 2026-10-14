import { useLocalSearchParams } from 'expo-router';

import { useMerchant } from '../../../../../features/merchants/queries';
import { EmployeesScreen } from '../../../../../screens/employees';

export default function EmployeesRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const system = useMerchant(id);

  return system ? <EmployeesScreen {...system} /> : null;
}
