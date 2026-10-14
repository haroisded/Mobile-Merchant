import { useLocalSearchParams } from 'expo-router';

import { useMerchant } from '../../../../../features/merchants/queries';
import { PermissionsScreen } from '../../../../../screens/employees/permissions';

// The employees and the open one's permissions, side by side on a tablet; `memberId` opens that employee.
export default function PermissionsRoute() {
  const { id, memberId } = useLocalSearchParams<{ id: string; memberId?: string }>();
  const system = useMerchant(id);

  return system ? <PermissionsScreen {...system} memberId={memberId} /> : null;
}
