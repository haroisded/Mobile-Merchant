import { router } from 'expo-router';

import { CreateSystem } from '../../screens/home/create-system';

// The create-system form: a full-screen route on a phone, a Dialog over the stores on a tablet (a transparentModal
// there, src/app/(app)/_layout.tsx). CreateSystem draws its own ground on a phone; wide, the route must stay clear.
export default function CreateSystemScreen() {
  return <CreateSystem onDismiss={() => router.back()} />;
}
