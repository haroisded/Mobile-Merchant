import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { FieldGrid } from '../../components/form-fields';
import { saveOnce } from '../../components/adaptive-dialog';
import { PageForm } from '../../components/form-footer';
import { NoteCallout } from '../../components/note-callout';
import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { ControlledSelect } from '../../components/search-select';
import { useCountriesQuery } from '../../features/countries/queries';
import type { Country } from '../../features/countries/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useSystemSettingsQuery, useUpdateSystemSettingsMutation } from '../../features/system-settings/queries';
import type { SystemSettings } from '../../features/system-settings/queries';
import { ROUNDING_METHODS, systemSettingsSchema } from '../../features/system-settings/schema';
import type { SystemSettingsValues } from '../../features/system-settings/schema';
import { failureMessage, mutationNotice } from '../../lib/errors';
import { asRoundingMethod, formatNumber, NUMBER_FORMATS } from '../../lib/money';
import { spacing } from '../../themes';

const PRECISIONS = Array.from({ length: 10 }, (_, places) => ({ value: String(places), label: String(places) }));

// Each format with what it does to a sample, so the choice reads as a number, not a pattern.
const FORMAT_OPTIONS = [...NUMBER_FORMATS.keys()].map((format) => ({
  value: format,
  label: formatNumber(1234567.891, format, 2, "Banker's Rounding"),
  hint: format,
}));

const ROUNDING_OPTIONS = [
  { value: ROUNDING_METHODS[0], label: ROUNDING_METHODS[0], hint: 'A half goes to the even neighbour: 2.345 → 2.34, 2.355 → 2.36' },
  { value: ROUNDING_METHODS[1], label: ROUNDING_METHODS[1], hint: 'A half goes up: 2.345 → 2.35' },
];

/** Every time zone a country lists, once, sorted. */
const timeZoneOptions = (countries: Country[]) =>
  [...new Set(countries.flatMap((country) => country.time_zones))].sort().map((zone) => ({ value: zone, label: zone }));

/**
 * System Settings (docs.frappe.io/erpnext/system-settings, /set-precision): the time zone, how numbers look,
 * how many decimals quantities and amounts keep, and how a half is rounded.
 */
export function SystemSettingsScreen({ merchantId }: { merchantId: string }) {
  const settings = useSystemSettingsQuery({ merchantId });
  const countries = useCountriesQuery();

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Setup" title="System Settings" meta="Time zone, number format and precision" onBack={() => router.back()} />
      {settings.data && countries.data ? (
        <SettingsForm merchantId={merchantId} saved={settings.data} countries={countries.data} />
      ) : (
        <View style={styles.state}>
          <QueryState
            query={settings.data ? countries : settings}
            offline="You're offline. System Settings will load when you reconnect."
            failure="Couldn't load System Settings. Try again."
          />
        </View>
      )}
    </View>
  );
}

const defaults = (saved: SystemSettings): SystemSettingsValues => ({
  time_zone: saved.time_zone,
  number_format: saved.number_format,
  float_precision: String(saved.float_precision),
  currency_precision: String(saved.currency_precision),
  rounding_method: asRoundingMethod(saved.rounding_method),
});

function SettingsForm({ merchantId, saved, countries }: { merchantId: string; saved: SystemSettings; countries: Country[] }) {
  const update = useUpdateSystemSettingsMutation({ merchantId });
  const editable = can(usePermissions({ merchantId }).data, 'System Settings', 'write');
  const notice = mutationNotice(update, failureMessage("Couldn't save System Settings. Try again."));

  const { control, handleSubmit, reset, formState } = useForm<SystemSettingsValues>({
    resolver: zodResolver(systemSettingsSchema),
    defaultValues: defaults(saved),
    mode: 'onTouched',
  });
  const timeZone = useWatch({ control, name: 'time_zone' });


  const save = handleSubmit(saveOnce(update, reset));

  return (
    <PageForm editable={editable} readOnly="Changing it needs System Settings write." notice={notice} mutation={update} dirty={formState.isDirty} onSave={save}>
      {/* ERPNext: set the time zone before transactions begin; changing it later moves every timestamp. */}
      {timeZone === saved.time_zone ? null : (
        <NoteCallout tone="error">Change the time zone only before the first sale: every date and time already recorded would read differently.</NoteCallout>
      )}
      <FieldGrid>
        <ControlledSelect control={control} name="time_zone" label="Time Zone" required title="Time Zone" span="full" options={timeZoneOptions(countries)} disabled={!editable} />
        <ControlledSelect control={control} name="number_format" label="Number Format" required title="Number Format" span="full" options={FORMAT_OPTIONS} disabled={!editable} />
        <ControlledSelect
          control={control}
          name="float_precision"
          label="Float Precision"
          hint="Decimals in quantities"
          required
          title="Float Precision"
          options={PRECISIONS}
          disabled={!editable}
        />
        <ControlledSelect
          control={control}
          name="currency_precision"
          label="Currency Precision"
          hint="Decimals in amounts"
          required
          title="Currency Precision"
          options={PRECISIONS}
          disabled={!editable}
        />
        <ControlledSelect
          control={control}
          name="rounding_method"
          label="Rounding Method"
          required
          title="Rounding Method"
          span="full"
          options={ROUNDING_OPTIONS}
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
