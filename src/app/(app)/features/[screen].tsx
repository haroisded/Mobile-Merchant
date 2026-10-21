import { useLocalSearchParams } from 'expo-router';

import { FeaturesScreen } from '../../../screens/features';

// One screen's switches on a phone, pushed from the Features list. On a tablet the same screen opens beside the list.
export default function FeaturesScreenPage() {
  const { screen } = useLocalSearchParams<{ screen: string }>();

  return <FeaturesScreen selected={screen} />;
}
