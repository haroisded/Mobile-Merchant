import { useLocalSearchParams } from 'expo-router';

import { Roles } from '../../../../../screens/roles';

export default function RolesRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <Roles merchantId={id} />;
}
