import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import type { Merchant } from '../../features/merchants/queries';
import { useNamingSeriesQuery, useSeriesPreviewQuery } from '../../features/naming-series/queries';
import type { NamingSeries } from '../../features/naming-series/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';

const openSeries = (merchantId: string, documentType: string) => router.push({ pathname: '/forms/naming-series', params: { merchantId, documentType } });

const openCounter = (merchantId: string) => router.push({ pathname: '/forms/series-counter', params: { merchantId } });

const series = (row: NamingSeries) => row.options.join(', ');

/**
 * Document Naming Settings (docs.frappe.io/erpnext/document-naming-settings, /naming-series): the series each
 * document is numbered by — the first is the default — and, under Update Series, the number a series is at.
 * ERPNext's one tool page, as a list of the three documents and two small forms.
 */
export function DocumentNamingSettings({ merchant }: { merchant: Merchant }) {
  const documents = useNamingSeriesQuery({ merchantId: merchant.id });
  const preview = useSeriesPreviewQuery({ merchantId: merchant.id }).data;
  const editable = can(usePermissions({ merchantId: merchant.id }).data, 'Document Naming Settings', 'write');

  // The name the next document takes under the first series. A series with .FY. has none while no fiscal
  // year covers today.
  const next = (row: NamingSeries) => {
    const first = preview?.find((line) => line.document_type === row.document_type && line.series === row.options[0]);
    if (!first) return '';
    return first.next_name || 'No fiscal year covers today';
  };
  const status = (row: NamingSeries) => [next(row), row.user_must_select ? 'Picked each time' : ''].filter((word) => word !== '');

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Setup"
        title="Document Naming Settings"
        meta="How new documents are numbered"
        onBack={() => router.back()}
        actions={
          editable ? (
            <Button mode="contained" icon="edit" onPress={() => openCounter(merchant.id)} contentStyle={styles.leading}>
              Update Series
            </Button>
          ) : null
        }
      />
      <RecordList
        query={documents}
        keyOf={(row) => row.document_type}
        columns={[
          { label: 'Document', flex: 2, cell: (row) => row.document_type },
          { label: 'Series', flex: 3, cell: series },
          { label: 'Next', flex: 3, cell: () => '', node: (row) => <StatusText words={status(row)} /> },
        ]}
        title={(row) => row.document_type}
        subtitle={series}
        status={(row) => <StatusText words={status(row)} />}
        accessibilityLabel={(row) => `Naming series for ${row.document_type}`}
        onPress={editable ? (row) => openSeries(merchant.id, row.document_type) : undefined}
        empty="No documents take a naming series yet."
        offline="You're offline. The naming series will load when you reconnect."
        failure="Couldn't load the naming series. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
});
