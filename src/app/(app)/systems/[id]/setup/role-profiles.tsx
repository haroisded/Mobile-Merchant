import { useLocalSearchParams } from 'expo-router';

import { RoleProfiles } from '../../../../../screens/role-profiles';

export default function RoleProfilesRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <RoleProfiles merchantId={id} />;
}
