import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { CountryCurrencyFields } from '../../components/country-currency-fields';
import { ControlledText, FieldGrid } from '../../components/form-fields';
import { FormFooter } from '../../components/form-footer';
import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { useCountriesQuery } from '../../features/countries/queries';
import type { Country } from '../../features/countries/queries';
import { useCurrencyPresetsQuery } from '../../features/currency-presets/queries';
import type { CurrencyPreset } from '../../features/currency-presets/queries';
import { useUpdateCompanyMutation } from '../../features/merchants/queries';
import type { Merchant } from '../../features/merchants/queries';
import { companySchema } from '../../features/merchants/schema';
import type { CompanyValues } from '../../features/merchants/schema';
import { useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice } from '../../lib/errors';
import { spacing } from '../../themes';

type Props = { merchant: Merchant };

/**
 * Company (ERPNext's Company, docs.frappe.io/erpnext/company-setup): the legal entity whose books this
 * system keeps. One per system — the system's name is the company's name.
 */
export function CompanyScreen({ merchant }: Props) {
  const countries = useCountriesQuery();
  const currencies = useCurrencyPresetsQuery();

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Setup" title="Company" meta={merchant.name} onBack={() => router.back()} />
      {countries.data && currencies.data ? (
        <CompanyForm merchant={merchant} countries={countries.data} currencies={currencies.data} />
      ) : (
        <View style={styles.state}>
          <QueryState
            query={countries.data ? currencies : countries}
            offline="You're offline. The company will load when you reconnect."
            failure="Couldn't load the company. Try again."
          />
        </View>
      )}
    </View>
  );
}

type FormProps = Props & { countries: Country[]; currencies: CurrencyPreset[] };

function CompanyForm({ merchant, countries, currencies }: FormProps) {
  const update = useUpdateCompanyMutation({ merchantId: merchant.id });
  const wide = useShellWide();
  const inFlight = update.isPending && !update.isPaused;
  const notice = mutationNotice(update, failureMessage("Couldn't save the company. Try again."));

  const { control, handleSubmit, reset, formState } = useForm<CompanyValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: merchant.name,
      abbr: merchant.abbr,
      country_code: merchant.country_code,
      default_currency: merchant.default_currency,
    },
    mode: 'onTouched',
  });

  // Refused while a save is pending, paused included: a second tap offline would queue a second write.
  const save = handleSubmit((values) => {
    if (!update.isPending) update.mutate(values, { onSuccess: () => reset(values) });
  });

  return (
    <>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <FieldGrid>
          <ControlledText control={control} name="name" label="Company Name" required placeholder="e.g. Corner Cafe" maxLength={80} />
          <ControlledText
            control={control}
            name="abbr"
            label="Abbreviation"
            required
            hint="Shown after account and warehouse names"
            autoCapitalize="characters"
            maxLength={10}
          />
          <CountryCurrencyFields control={control} countries={countries} currencies={currencies} />
        </FieldGrid>
      </ScrollView>
      <FormFooter notice={notice}>
        <Button
          mode="contained"
          onPress={save}
          loading={inFlight}
          // Nothing to save until something changed; a pending save, paused included, holds it too.
          disabled={update.isPending || !formState.isDirty}
          style={wide ? styles.hug : undefined}
          contentStyle={styles.leading}
        >
          Save
        </Button>
      </FormFooter>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  // Held to the single-column measure, left-aligned (.claude/instruction_mds/frontend.md rule 18, §9).
  body: { padding: spacing.md, width: '100%', maxWidth: 720 },
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  leading: { justifyContent: 'flex-start' },
  // Wide, the button hugs its label: a full-width primary button across a tablet reads as a banner.
  hug: { alignSelf: 'flex-start' },
});
