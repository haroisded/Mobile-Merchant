import { router } from 'expo-router';

import { RoleListDialog } from '../../../screens/guide/role-list';

// The Store Guide's role list on a phone, as a native sheet over the Guide page (.claude/instruction-mds/frontend.md
// §4.4). A pick takes the sheet's place with the practice store, so Back from the store lands on the Guide page.
export default function GuideRolesSheet() {
  return (
    <RoleListDialog
      inSheet
      onDismiss={() => router.back()}
      onPick={(role) => router.replace({ pathname: '/guide/[role]', params: { role: role.id } })}
    />
  );
}
