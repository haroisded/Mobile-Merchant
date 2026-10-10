import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import type { Merchant } from '../../features/merchants/queries';
import { usePrintFormatsQuery } from '../../features/print-formats/queries';
import type { PrintFormat } from '../../features/print-formats/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';

// A form with a sample receipt under it: a page of the Setup stack at every width, not a forms/ Dialog
// (.claude/instruction_mds/frontend.md §4.4).
const openFormat = (merchantId: string, formatId?: string) =>
  router.push({ pathname: '/systems/[id]/setup/print-format', params: formatId ? { id: merchantId, formatId } : { id: merchantId } });

const status = (format: PrintFormat) => [format.is_default ? 'Default' : null, format.disabled ? 'Disabled' : null].filter((word) => word !== null);

const heading = (format: PrintFormat) => format.print_heading || 'No heading';

/**
 * Print Formats (docs.frappe.io/erpnext/print-format): how a receipt looks when printed. The POS Profile
 * picks one; without that, the default.
 */
export function PrintFormats({ merchant }: { merchant: Merchant }) {
  const formats = usePrintFormatsQuery({ merchantId: merchant.id });
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const fallback = formats.data?.find((format) => format.is_default)?.print_format_name;

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Setup"
        title="Print Formats"
        meta={formats.data ? (fallback ? `Default: ${fallback}` : 'No default print format') : undefined}
        onBack={() => router.back()}
        actions={
          can(permissions, 'Print Format', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openFormat(merchant.id)} contentStyle={styles.leading}>
              New Print Format
            </Button>
          ) : null
        }
      />
      <RecordList
        query={formats}
        keyOf={(format) => format.id}
        columns={[
          { label: 'Name', flex: 3, cell: (format) => format.print_format_name },
          { label: 'Paper', flex: 1, cell: (format) => format.paper },
          { label: 'Print Heading', flex: 2, cell: heading },
          { label: 'Status', flex: 1, cell: () => '', node: (format) => <StatusText words={status(format)} faint={format.disabled} /> },
        ]}
        title={(format) => format.print_format_name}
        subtitle={(format) => `${format.paper} · ${heading(format)}`}
        status={(format) => <StatusText words={status(format)} faint={format.disabled} />}
        accessibilityLabel={(format) => `Print format ${format.print_format_name}`}
        onPress={can(permissions, 'Print Format', 'read') ? (format) => openFormat(merchant.id, format.id) : undefined}
        empty="No print formats yet."
        offline="You're offline. Print formats will load when you reconnect."
        failure="Couldn't load the print formats. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
});
