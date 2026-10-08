import { useLocalSearchParams } from 'expo-router';

import { Users } from '../../../../../screens/users';

export default function UsersRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <Users merchantId={id} />;
}
