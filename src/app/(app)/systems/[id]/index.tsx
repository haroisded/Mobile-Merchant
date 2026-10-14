import { useLocalSearchParams } from 'expo-router';

import { SystemHome } from '../../../../screens/system-home';

// The system's home: the first screen inside a system, where a SystemCard tap lands. The shell's `sceneStyle`
// paints the background, so a blank home is a blank screen rather than a transparent one.
export default function SystemHomeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <SystemHome merchantId={id} />;
}
