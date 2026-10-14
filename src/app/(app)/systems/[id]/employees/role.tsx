import { useLocalSearchParams } from 'expo-router';

import { useMerchant } from '../../../../../features/merchants/queries';
import { RolePage } from '../../../../../screens/employees/role';

// One role, new without `roleId`: a page of the Employees stack on a phone.
export default function RoleRoute() {
  const { id, roleId } = useLocalSearchParams<{ id: string; roleId?: string }>();
  const system = useMerchant(id);

  return system ? <RolePage {...system} roleId={roleId} /> : null;
}
