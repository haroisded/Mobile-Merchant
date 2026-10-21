import { useLocalSearchParams } from 'expo-router';

import { Sandbox } from '../../../screens/guide/sandbox';

// A role's practice store, opened from the Store Guide's role list (src/screens/guide/sandbox/).
export default function SandboxScreen() {
  const { role } = useLocalSearchParams<{ role: string }>();
  return <Sandbox roleId={role} />;
}
