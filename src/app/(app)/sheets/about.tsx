import { router } from 'expo-router';

import { About } from '../../../screens/features/about';
import { useAboutRequest } from '../../../Store/about';

// A Features row's About on a phone, as a native sheet (.claude/instruction_mds/frontend.md §4.4). The page that
// asked left its request in src/Store/about.ts (useAbout).
export default function AboutSheet() {
  const request = useAboutRequest();

  // Only reachable through useAbout, which always leaves a request first.
  if (!request) return null;

  return <About request={request} inSheet onDismiss={() => router.back()} />;
}
