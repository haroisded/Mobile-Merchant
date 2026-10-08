import { useLocalSearchParams } from 'expo-router';

import { UserPermissions } from '../../../../../screens/user-permissions';

export default function UserPermissionsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <UserPermissions merchantId={id} />;
}
