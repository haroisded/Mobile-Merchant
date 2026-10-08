import { router, useLocalSearchParams } from 'expo-router';

import { AccountForm } from '../../../screens/chart-of-accounts/account-form';

// Add or edit an account — a full page on a phone, a Dialog over the Chart of Accounts on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function AccountPage() {
  const { merchantId, accountId, parentId } = useLocalSearchParams<{ merchantId: string; accountId?: string; parentId?: string }>();

  return <AccountForm merchantId={merchantId} accountId={accountId} parentId={parentId} onDismiss={() => router.back()} />;
}
