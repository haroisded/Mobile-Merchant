import { Controller } from 'react-hook-form';
import type { Control } from 'react-hook-form';

import type { Country } from '../features/countries/queries';
import type { CurrencyPreset } from '../features/currency-presets/queries';
import type { CompanyValues } from '../features/merchants/schema';
import { SearchSelect } from './search-select';

type Props<T extends CompanyValues> = {
  /** Create System's form, or the Company screen's, which adds the accounting defaults. */
  control: Control<T>;
  countries: Country[];
  currencies: CurrencyPreset[];
  /** Runs after a country is picked: Create System uses it to propose that country's currency. */
  onCountryPicked?: (country: Country) => void;
  /** Shown but not editable: the caller may read the Company, not write it. */
  disabled?: boolean;
};

/**
 * A Company's Country and Default Currency — the pair both Company forms carry, Create System and the
 * Company screen, which is what puts it in src/components/ (.claude/instruction_mds/structure.md rule 7).
 */
export function CountryCurrencyFields<T extends CompanyValues>({ control: form, countries, currencies, onCountryPicked, disabled }: Props<T>) {
  // SAFETY: T extends CompanyValues, so country_code and default_currency are string fields of T; TypeScript
  // cannot resolve a generic form's paths, and Control is invariant in its values.
  const control = form as Control<CompanyValues>;

  return (
    <>
      <Controller
        control={control}
        name="country_code"
        render={({ field, fieldState }) => (
          <SearchSelect
            label="Country"
            required
            disabled={disabled}
            title="Country"
            value={field.value}
            onChange={(code) => {
              field.onChange(code);
              const country = countries.find((candidate) => candidate.code === code);
              if (country) onCountryPicked?.(country);
            }}
            error={fieldState.error?.message}
            options={countries.map((country) => ({ value: country.code, label: country.country_name, hint: country.code }))}
          />
        )}
      />
      <Controller
        control={control}
        name="default_currency"
        render={({ field, fieldState }) => (
          <SearchSelect
            label="Default Currency"
            required
            disabled={disabled}
            hint="The currency the books are kept in"
            title="Default Currency"
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message}
            options={currencies.map((currency) => ({
              value: currency.code,
              label: `${currency.code} · ${currency.currency_name}`,
              hint: currency.symbol ?? undefined,
            }))}
          />
        )}
      />
    </>
  );
}
