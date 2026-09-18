import { router } from 'expo-router';

import { DeleteAccountDialog } from '../../../components/delete-account-dialog';

// Confirm deleting the account on a narrow container (instruction_mds/visual-language.md §5).
export default function DeleteAccountSheet() {
  return <DeleteAccountDialog wide={false} inSheet onDismiss={() => router.back()} />;
}
