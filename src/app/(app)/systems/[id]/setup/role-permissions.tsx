import { useLocalSearchParams } from 'expo-router';

import { RolePermissions } from '../../../../../screens/role-permissions';

export default function RolePermissionsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <RolePermissions merchantId={id} />;
}
