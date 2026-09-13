import { router } from 'expo-router';

import { ProfileScreen } from '../../features/profiles/ProfileScreen';

// Profile opened from inside a system: the shell header's account action pushes this over the shell.
// It has two exits, and they differ:
// - back returns to the same system and destination;
// - "Back to your systems" leaves the system. dismissTo pops to the (tabs) route already in the
//   stack — the anchor in (app)/_layout.tsx guarantees one is there — instead of pushing a second.
//
// Not the Account tab. From the shell, navigate('/account') pops the system off the stack, and
// push('/account') stacks a second tab navigator on top of it (getNavigationAction.js:51).
export default function Profile() {
  return <ProfileScreen onBack={() => router.back()} onExitSystem={() => router.dismissTo('/')} />;
}
