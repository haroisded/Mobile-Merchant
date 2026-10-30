import type { Control } from 'react-hook-form';

import type { Country } from '../features/countries/queries';
import type { CurrencyPreset } from '../features/currency-presets/queries';
import type { CompanyValues } from '../features/merchants/schema';
import { ControlledSelect } from './search-select';

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
 * which is what puts it in src/components/ (.claude/instruction_mds/structure.md rule 7). Two ControlledSelects:
 * a pick is the field's touch there, so an onTouched form clears "Select a country." the moment one is picked
 * (TC-STR-07; a copy of the binding here had missed it).
 */
export function CountryCurrencyFields<T extends CompanyValues>({ control: form, countries, currencies, onCountryPicked, disabled }: Props<T>) {
  // SAFETY: T extends CompanyValues, so country_code and default_currency are string fields of T; TypeScript
  // cannot resolve a generic form's paths, and Control is invariant in its values.
  const control = form as Control<CompanyValues>;

  return (
    <>
      <ControlledSelect
        control={control}
        name="country_code"
        label="Country"
        required
        disabled={disabled}
        title="Country"
        onPicked={(code) => {
          const country = countries.find((candidate) => candidate.code === code);
          if (country) onCountryPicked?.(country);
        }}
        options={countries.map((country) => ({ value: country.code, label: country.country_name, hint: country.code }))}
      />
      <ControlledSelect
        control={control}
        name="default_currency"
        label="Default Currency"
        required
        disabled={disabled}
        hint="The currency the books are kept in"
        title="Default Currency"
        options={currencies.map((currency) => ({
          value: currency.code,
          label: `${currency.code} · ${currency.currency_name}`,
          hint: currency.symbol ?? undefined,
        }))}
      />
    </>
  );
}
