import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { Text } from '../../components/text';
import { memberName } from '../../features/members/queries';
import type { Member } from '../../features/members/queries';
import type { Merchant } from '../../features/merchants/queries';
import { spacing } from '../../themes';
import { AccessEditor, accessValues } from './editor/access-editor';
import type { AccessValues } from './editor/access-editor';
import { OwnerOnly } from './index';
import { useEmployees } from './use-employees';
import type { EmployeesData } from './use-employees';

/** One employee's permissions as a page of the Employees stack: the phone's way in. A tablet opens them beside the list. */
export function EmployeePage({ merchant, isOwner, memberId }: { merchant: Merchant; isOwner: boolean; memberId: string }) {
  const employees = useEmployees(merchant.id);
  const member = employees.data?.members.find((candidate) => candidate.id === memberId);

  if (!isOwner) return <OwnerOnly title="Permissions" />;

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Employees" title={member ? memberName(member) : 'Employee'} meta={member?.full_name ? member.email ?? undefined : undefined} onBack={() => router.back()} />
      {employees.data && member ? (
        <Editor member={member} data={employees.data} />
      ) : (
        <View style={styles.state}>
          <QueryState query={employees} offline="You're offline. Their permissions will load when you reconnect." failure="Couldn't load their permissions. Try again.">
            {/* Loaded, and the employee is not there: revoked, or a stale link. */}
            <Text variant="bodyMedium">This employee is no longer in this system.</Text>
          </QueryState>
        </View>
      )}
    </View>
  );
}

function Editor({ member, data }: { member: Member; data: EmployeesData }) {
  const form = useForm<AccessValues>({ defaultValues: accessValues(member, data.roles, data.catalog) });
  return <AccessEditor member={member} roles={data.roles} catalog={data.catalog} form={form} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
});
