import { router } from 'expo-router';

import { RequestConfirm } from '../../../components/confirm-dialog';
import { useConfirmRequest } from '../../../Store/confirm';

// A destructive confirm on a phone, as a native sheet (.claude/instruction_mds/frontend.md §4.4). The
// screen that asked left its request in src/Store/confirm.ts (useConfirm); a confirmed write runs the
// request's onDone, which closes this sheet and whatever it was opened from.
export default function ConfirmSheet() {
  const request = useConfirmRequest();

  // Only reachable through useConfirm, which always leaves a request first.
  if (!request) return null;

  return <RequestConfirm request={request} inSheet onDismiss={() => router.back()} />;
}
