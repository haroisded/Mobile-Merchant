import { router } from 'expo-router';

import { ProfileDialog } from '../../../screens/profile';

// A tablet's Account (src/screens/home/index.tsx, the header's account icon): the Account tab's body as a Dialog over
// the stores. A phone keeps the tab, (tabs)/account.tsx.
export default function ProfileForm() {
  return <ProfileDialog onDismiss={() => router.back()} />;
}
