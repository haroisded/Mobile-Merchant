import { Stack } from 'expo-router';

import { useAppTheme } from '../../../../../lib/theme';

// Employees, the owner's destination: its own stack, so the list pushes Roles, a role, and an employee's
// permissions, and Back returns to the list, while the rail stays beside them on a tablet.
export default function EmployeesLayout() {
  const { colors } = useAppTheme();

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
