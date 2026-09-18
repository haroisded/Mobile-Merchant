import { router } from 'expo-router';

import { ProfileScreen } from '../../../screens/profile';

// The Account tab on the merchant-level Home. Back lands on the systems list, which is this tab
// bar's Home. No "Back to your systems" button here — the user is not inside a system.
export default function Account() {
  return <ProfileScreen onBack={() => router.navigate('/')} />;
}
