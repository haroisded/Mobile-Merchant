import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { ControlledSwitch, Field, FieldGrid } from '../../components/form-fields';
import { saveOnce } from '../../components/adaptive-dialog';
import { PageForm } from '../../components/form-footer';
import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { Text } from '../../components/text';
import { useCountriesQuery } from '../../features/countries/queries';
import { useCurrencyPresetsQuery } from '../../features/currency-presets/queries';
import { useGlobalDefaultsQuery, useUpdateGlobalDefaultsMutation } from '../../features/global-defaults/queries';
import type { GlobalDefaults, GlobalDefaultsValues } from '../../features/global-defaults/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { failureMessage, mutationNotice } from '../../lib/errors';
import { spacing } from '../../themes';

const header = (save?: ReactNode) => <PageHeader kicker="Setup" title="Global Defaults" meta="What new records and receipts start with" onBack={() => router.back()} actions={save} />;

/**
 * Global Defaults (docs.frappe.io/erpnext/global-defaults). ERPNext's Default Company, Country and Currency
 * are this store's own — ERPNext's Company, one per store — so they are shown, and changed on the Store page.
 * What is left are the receipt's two switches.
 */
export function GlobalDefaultsScreen({ merchant }: { merchant: Merchant }) {
  const defaults = useGlobalDefaultsQuery({ merchantId: merchant.id });

  return (
    <View style={styles.fill}>
      {defaults.data ? null : header()}
      {defaults.data ? (
        <DefaultsForm merchant={merchant} saved={defaults.data} />
      ) : (
        <View style={styles.state}>
          <QueryState query={defaults} offline="You're offline. Global Defaults will load when you reconnect." failure="Couldn't load Global Defaults. Try again." />
        </View>
      )}
    </View>
  );
}

function DefaultsForm({ merchant, saved }: { merchant: Merchant; saved: GlobalDefaults }) {
  const update = useUpdateGlobalDefaultsMutation({ merchantId: merchant.id });
  const editable = can(usePermissions({ merchantId: merchant.id }).data, 'Global Defaults', 'write');
  const country = useCountriesQuery().data?.find((candidate) => candidate.code === merchant.country_code);
  const currency = useCurrencyPresetsQuery().data?.find((candidate) => candidate.code === merchant.default_currency);
  const notice = mutationNotice(update, failureMessage("Couldn't save Global Defaults. Try again."));

  const { control, handleSubmit, reset, formState } = useForm<GlobalDefaultsValues>({
    defaultValues: { disable_rounded_total: saved.disable_rounded_total, disable_in_words: saved.disable_in_words },
  });


  const save = handleSubmit(saveOnce(update, reset));

  return (
    <PageForm header={header} editable={editable} readOnly="Changing it needs Global Defaults write." notice={notice} mutation={update} dirty={formState.isDirty} unsaved={formState.isDirty} onSave={save}>
      <FieldGrid>
        <Field label="Default Store" hint="Changed on the Store page" span="full">
          <Text variant="bodyMedium">{merchant.name}</Text>
        </Field>
        <Field label="Default Country">
          <Text variant="bodyMedium">{country?.country_name ?? merchant.country_code}</Text>
        </Field>
        <Field label="Default Currency">
          <Text variant="bodyMedium">{currency ? `${currency.code} · ${currency.currency_name}` : merchant.default_currency}</Text>
        </Field>
        <ControlledSwitch
          control={control}
          name="disable_rounded_total"
          label="Disable Rounded Total"
          span="full"
          on="Receipts show the exact total, with no cash-rounded line"
          off="Receipts show the total rounded to the smallest coin"
          disabled={!editable}
        />
        <ControlledSwitch
          control={control}
          name="disable_in_words"
          label="Disable In Words"
          span="full"
          on="Receipts leave out the amount in words"
          off="Receipts write the amount out in words"
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
