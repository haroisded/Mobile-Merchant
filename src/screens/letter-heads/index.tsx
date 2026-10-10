import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import { useLetterHeadsQuery } from '../../features/letter-heads/queries';
import type { LetterHead } from '../../features/letter-heads/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';

const openForm = (merchantId: string, letterHeadId?: string) =>
  router.push({ pathname: '/forms/letter-head', params: letterHeadId ? { merchantId, letterHeadId } : { merchantId } });

const status = (head: LetterHead) => [head.is_default ? 'Default' : null, head.disabled ? 'Disabled' : null].filter((word) => word !== null);

// The header's first line: what a list has room for.
const header = (head: LetterHead) => head.content.split('\n')[0] || 'No header';

/**
 * Letter Heads (docs.frappe.io/erpnext/letter-head): the organization's name, address and tax ID at the top of
 * a printed document, and a footer under it. The default one prints when Print Settings says so.
 */
export function LetterHeads({ merchant }: { merchant: Merchant }) {
  const heads = useLetterHeadsQuery({ merchantId: merchant.id });
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const editable = can(permissions, 'Letter Head', 'write');

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Setup"
        title="Letter Heads"
        meta={heads.data ? `${heads.data.length} ${heads.data.length === 1 ? 'letter head' : 'letter heads'}` : undefined}
        onBack={() => router.back()}
        actions={
          can(permissions, 'Letter Head', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openForm(merchant.id)} contentStyle={styles.leading}>
              New Letter Head
            </Button>
          ) : null
        }
      />
      <RecordList
        query={heads}
        keyOf={(head) => head.id}
        columns={[
          { label: 'Name', flex: 2, cell: (head) => head.letter_head_name },
          { label: 'Header', flex: 3, cell: header },
          { label: 'Status', flex: 1, cell: () => '', node: (head) => <StatusText words={status(head)} faint={head.disabled} /> },
        ]}
        title={(head) => head.letter_head_name}
        subtitle={header}
        status={(head) => <StatusText words={status(head)} faint={head.disabled} />}
        accessibilityLabel={(head) => `Letter head ${head.letter_head_name}`}
        onPress={editable ? (head) => openForm(merchant.id, head.id) : undefined}
        empty="No letter heads yet."
        offline="You're offline. Letter heads will load when you reconnect."
        failure="Couldn't load the letter heads. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
});
