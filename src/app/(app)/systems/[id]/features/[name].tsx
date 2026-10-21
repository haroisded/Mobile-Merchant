import { useLocalSearchParams } from 'expo-router';

import { FeaturesScreen } from '../../../../../screens/features';

// One screen's switches on a phone, pushed from the Features list; on a tablet the same screen opens beside the list.
// `name`, not `screen`: React Navigation reads a `screen` param as a nested route to open, and the push went nowhere
// (tablet at phone width, 2026-10-21).
export default function FeaturesScreenPage() {
  const { name } = useLocalSearchParams<{ name: string }>();

  return <FeaturesScreen selected={name} />;
}
