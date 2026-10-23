import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { saveOnce } from '../../components/adaptive-dialog';
import { ControlledSwitch, FieldGrid } from '../../components/form-fields';
import { PageForm } from '../../components/form-footer';
import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import type { Merchant } from '../../features/merchants/queries';
import { usePrintSettingsQuery, useUpdatePrintSettingsMutation } from '../../features/print-settings/queries';
import type { PrintSettings, PrintSettingsValues } from '../../features/print-settings/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { failureMessage, mutationNotice } from '../../lib/errors';
import { spacing } from '../../themes';

/**
 * Print Settings (docs.frappe.io/erpnext/print-settings §2.1, §2.2, §2.7): whether a printed document starts
 * with the letter head, whether its item table is compact, and whether a tax of zero is printed. Their effect
 * shows on a Print Format's sample receipt.
 */
export function PrintSettingsScreen({ merchant }: { merchant: Merchant }) {
  const settings = usePrintSettingsQuery({ merchantId: merchant.id });

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Setup" title="Print Settings" meta="What every printed receipt carries" onBack={() => router.back()} form />
      {settings.data ? (
        <SettingsForm merchant={merchant} saved={settings.data} />
      ) : (
        <View style={styles.state}>
          <QueryState query={settings} offline="You're offline. Print Settings will load when you reconnect." failure="Couldn't load Print Settings. Try again." />
        </View>
      )}
    </View>
  );
}

function SettingsForm({ merchant, saved }: { merchant: Merchant; saved: PrintSettings }) {
  const update = useUpdatePrintSettingsMutation({ merchantId: merchant.id });
  const editable = can(usePermissions({ merchantId: merchant.id }).data, 'Print Settings', 'write');
  const notice = mutationNotice(update, failureMessage("Couldn't save Print Settings. Try again."));

  const { control, handleSubmit, reset, formState } = useForm<PrintSettingsValues>({
    defaultValues: {
      with_letterhead: saved.with_letterhead,
      compact_item_print: saved.compact_item_print,
      print_taxes_with_zero_amount: saved.print_taxes_with_zero_amount,
    },
  });

  const save = handleSubmit(saveOnce(update, reset));

  return (
    <PageForm editable={editable} readOnly="Changing it needs Print Settings write." notice={notice} mutation={update} dirty={formState.isDirty} onSave={save}>
      <FieldGrid>
        <ControlledSwitch
          control={control}
          name="with_letterhead"
          label="Print with Letterhead"
          span="full"
          on="A receipt starts with the default letter head"
          off="A receipt starts without a letter head"
          disabled={!editable}
        />
        <ControlledSwitch
          control={control}
          name="compact_item_print"
          label="Compact Item Print"
          span="full"
          on="Four columns: Description, Qty, Rate, Amount — the rest folded into Description"
          off="Every value in a column of its own: Item Code, Item Name, UOM, Qty, Rate, Amount"
          disabled={!editable}
        />
        <ControlledSwitch
          control={control}
          name="print_taxes_with_zero_amount"
          label="Print Taxes with Zero Amount"
          span="full"
          on="A tax that came to nothing is printed too"
          off="Only taxes with an amount are printed"
          disabled={!editable}
        />
      </FieldGrid>
    </PageForm>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
});
