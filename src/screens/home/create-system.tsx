import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Appbar } from '../../components/appbar';
import { Button } from '../../components/button';
import { CountryCurrencyFields } from '../../components/country-currency-fields';
import { ControlledText, Field, FieldGrid } from '../../components/form-fields';
import { HelperText } from '../../components/helper-text';
import { QueryState } from '../../components/query-state';
import { Text } from '../../components/text';
import { TextInput } from '../../components/text-input';
import { countryForTimeZone, useCountriesQuery } from '../../features/countries/queries';
import type { Country } from '../../features/countries/queries';
import { useCurrencyPresetsQuery } from '../../features/currency-presets/queries';
import type { CurrencyPreset } from '../../features/currency-presets/queries';
import { useCreateSystemMutation } from '../../features/merchants/queries';
import { companySchema, suggestAbbr } from '../../features/merchants/schema';
import type { CompanyValues } from '../../features/merchants/schema';
import { useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice } from '../../lib/errors';
import { spacing } from '../../themes';

/**
 * Create System, on the full-screen route (src/app/(app)/create-system.tsx) at every width. A system is
 * its company, so this is ERPNext's setup wizard cut to the Company's own fields: name, abbreviation,
 * country and currency. Creating it sets up the rest (the company's first fiscal year) in the database.
 */
type Props = { onDismiss: () => void };

export function CreateSystem({ onDismiss }: Props) {
  const countries = useCountriesQuery();
  const currencies = useCurrencyPresetsQuery();

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={onDismiss} />
        <Appbar.Content title="Merchant" />
      </Appbar.Header>
      {countries.data && currencies.data ? (
        <CreateForm countries={countries.data} currencies={currencies.data} onDismiss={onDismiss} />
      ) : (
        <View style={styles.state}>
          <QueryState
            query={countries.data ? currencies : countries}
            offline="You're offline. Creating a system needs a connection."
            failure="Couldn't load the list of countries. Try again."
          />
        </View>
      )}
    </>
  );
}

type FormProps = Props & { countries: Country[]; currencies: CurrencyPreset[] };

function CreateForm({ countries, currencies, onDismiss }: FormProps) {
  const createSystem = useCreateSystemMutation();
  // Wide, the button hugs its label: a 640dp primary button reads as a banner.
  const buttonStyle = useShellWide() ? styles.hug : undefined;
  // A paused write is queued, not in flight: it must not hold the button in its spinner while the
  // device is offline (.claude/instruction_mds/data-layer.md §5). The button still stays disabled (below).
  const inFlight = createSystem.isPending && !createSystem.isPaused;
  const notice = mutationNotice(createSystem, failureMessage("Couldn't create this system. Try again."));

  // The device's own time zone picks the starting country, and the country its currency: a shop in
  // Manila starts on the Philippines and the peso. Both stay a choice.
  const home = countryForTimeZone(countries, Intl.DateTimeFormat().resolvedOptions().timeZone);

  // The component mounts only while its route is open, which is what makes the form fresh on every
  // open with no reset logic. onTouched: validating every keystroke while someone thumbs in a name
  // is noise.
  const { control, handleSubmit, setValue, getFieldState, formState } = useForm<CompanyValues>({
    resolver: zodResolver(companySchema),
    defaultValues: { name: '', abbr: '', country_code: home?.code ?? '', default_currency: home?.currency_code ?? '' },
    mode: 'onTouched',
  });

  // mutate, not mutateAsync: it does not throw, so there is no catch block whose only job is to
  // swallow an error that is already being rendered from the notice below. Refused while a create is
  // pending, paused included: a second tap offline would queue a second insert, and reconnecting
  // would make two systems. Guarded here, not only on the button, because the keyboard's Done
  // submits too.
  const submit = handleSubmit((values) => {
    if (!createSystem.isPending) createSystem.mutate(values, { onSuccess: onDismiss });
  });

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text variant="headlineSmall">Name your system</Text>
      <Text variant="bodyMedium">A system is one company: its name, and the country and currency its books are kept in.</Text>
      <FieldGrid>
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState }) => (
            <Field label="System Name" required span="full" error={fieldState.error?.message}>
              <TextInput
                mode="outlined"
                dense
                placeholder="Enter system name"
                value={field.value}
                onChangeText={(name) => {
                  field.onChange(name);
                  // ERPNext suggests the abbreviation from the name, until the user writes one.
                  if (!getFieldState('abbr', formState).isDirty) setValue('abbr', suggestAbbr(name));
                }}
                onBlur={field.onBlur}
                onSubmitEditing={submit}
                returnKeyType="done"
                autoFocus
                maxLength={80}
                error={!!fieldState.error}
                accessibilityLabel="System Name"
              />
            </Field>
          )}
        />
        <ControlledText
          control={control}
          name="abbr"
          label="Abbreviation"
          required
          hint="Shown after account and warehouse names"
          autoCapitalize="characters"
          maxLength={10}
        />
        <CountryCurrencyFields
          control={control}
          countries={countries}
          currencies={currencies}
          // The country's own currency, as ERPNext's setup wizard proposes it.
          onCountryPicked={(country) => {
            if (country.currency_code) setValue('default_currency', country.currency_code, { shouldValidate: true });
          }}
        />
      </FieldGrid>
      <Button
        mode="contained"
        style={buttonStyle}
        contentStyle={styles.leading}
        onPress={submit}
        loading={inFlight}
        disabled={createSystem.isPending}
      >
        Create System
      </Button>
      {/* The write's own state, distinct from a field being invalid: a provider string is replaced by
          copy the user can act on, and an offline wait says so. */}
      <HelperText type={notice?.type ?? 'error'} visible={notice !== null}>
        {notice?.text}
      </HelperText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.lg },
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  leading: { justifyContent: 'flex-start' },
  // Capped at the single-column measure and left-aligned (.claude/instruction_mds/frontend.md rule 18, §9), so a
  // tablet's fields do not span 1000dp.
  body: { gap: spacing.ms, padding: spacing.lg, width: '100%', maxWidth: 640 },
  hug: { alignSelf: 'flex-start' },
});
