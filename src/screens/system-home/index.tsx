import { StyleSheet, View } from 'react-native';

import { Text } from '../../components/text';
import { usePermissions } from '../../features/role-permissions/queries';
import { spacing } from '../../themes';

/**
 * The first screen inside a system. Blank for whoever has work here — the rail is the way in. An employee the
 * owner has given nothing yet is told why the rail holds Home alone.
 */
export function SystemHome({ merchantId }: { merchantId: string }) {
  const permissions = usePermissions({ merchantId }).data;
  if (!permissions || permissions.is_owner || permissions.permissions.length > 0) return null;

  return (
    <View style={styles.body}>
      <Text variant="headlineSmall">You&apos;re in. The owner hasn&apos;t given you a role yet.</Text>
      <Text variant="bodyMedium" style={styles.measure}>
        Once they do, what you may work on shows up in the menu. Notifications tells you when your access changes.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm, padding: spacing.md },
  // Running prose at a reading measure, left-aligned (.claude/instruction_mds/frontend.md rule 18).
  measure: { maxWidth: 560 },
});
