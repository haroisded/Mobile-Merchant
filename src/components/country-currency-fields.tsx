import { Controller } from 'react-hook-form';
import type { Control } from 'react-hook-form';

import type { Country } from '../features/countries/queries';
import type { CurrencyPreset } from '../features/currency-presets/queries';
import type { CompanyValues } from '../features/merchants/schema';
import { SearchSelect } from './search-select';

type Props<T extends CompanyValues> = {
  /** Create Store's form, or the Store page's, which adds the accounting defaults. */
  control: Control<T>;
  countries: Country[];
  currencies: CurrencyPreset[];
  /** Runs after a country is picked: Create Store uses it to propose that country's currency. */
  onCountryPicked?: (country: Country) => void;
  /** Shown but not editable: the caller may read the store, not write it. */
  disabled?: boolean;
};

/**
 * A store's Country and Default Currency — the pair both store forms carry, Create Store and the Store page,
 * which is what puts it in src/components/ (.claude/instruction_mds/structure.md rule 7).
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
              // A pick is the field's touch, as in ControlledSelect: a picker never blurs, and an onTouched form left
              // "Select a country." under a picked country (Create Store, tablet, 2026-10-28).
              field.onBlur();
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
            onChange={(code) => {
              field.onChange(code);
              field.onBlur();
            }}
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
