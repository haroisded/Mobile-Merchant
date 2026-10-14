import { useLocalSearchParams } from 'expo-router';

import { useMerchant } from '../../../../../features/merchants/queries';
import { EmployeePage } from '../../../../../screens/employees/employee';

// One employee's permissions: a page of the Employees stack on a phone.
export default function EmployeeRoute() {
  const { id, memberId } = useLocalSearchParams<{ id: string; memberId: string }>();
  const system = useMerchant(id);

  return system ? <EmployeePage {...system} memberId={memberId} /> : null;
}
