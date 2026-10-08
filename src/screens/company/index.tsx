import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { CountryCurrencyFields } from '../../components/country-currency-fields';
import { ControlledText, FieldGrid } from '../../components/form-fields';
import { saveOnce } from '../../components/adaptive-dialog';
import { PageForm } from '../../components/form-footer';
import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { useCountriesQuery } from '../../features/countries/queries';
import type { Country } from '../../features/countries/queries';
import { useCurrencyPresetsQuery } from '../../features/currency-presets/queries';
import type { CurrencyPreset } from '../../features/currency-presets/queries';
import { useUpdateCompanyMutation } from '../../features/merchants/queries';
import type { Merchant } from '../../features/merchants/queries';
import { companySchema } from '../../features/merchants/schema';
import { can, usePermissions } from '../../features/role-permissions/queries';
import type { CompanyValues } from '../../features/merchants/schema';
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
  // Read-only without Company write (System Manager and Accounts Manager have it; the owner always does).
  const editable = can(usePermissions({ merchantId: merchant.id }).data, 'Company', 'write');
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
  const save = handleSubmit(saveOnce(update, reset));

  return (
    <PageForm editable={editable} readOnly="Changing it needs Company write." notice={notice} mutation={update} dirty={formState.isDirty} onSave={save}>
      <FieldGrid>
        <ControlledText control={control} name="name" label="Company Name" required placeholder="e.g. Corner Cafe" maxLength={80} disabled={!editable} />
        <ControlledText
          control={control}
          name="abbr"
          label="Abbreviation"
          required
          hint="Shown after account and warehouse names"
          autoCapitalize="characters"
          maxLength={10}
          disabled={!editable}
        />
        <CountryCurrencyFields control={control} countries={countries} currencies={currencies} disabled={!editable} />
      </FieldGrid>
    </PageForm>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
});
