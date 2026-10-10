import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { CountryCurrencyFields } from '../../components/country-currency-fields';
import { ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { saveOnce } from '../../components/adaptive-dialog';
import { PageForm } from '../../components/form-footer';
import { NoteCallout } from '../../components/note-callout';
import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { ControlledSelect } from '../../components/search-select';
import { SectionHeading } from '../../components/section-heading';
import { ledgerOptions, useAccountsQuery } from '../../features/accounts/queries';
import type { Account } from '../../features/accounts/queries';
import { costCenterOptions, useCostCentersQuery } from '../../features/cost-centers/queries';
import type { CostCenter } from '../../features/cost-centers/queries';
import { useCountriesQuery } from '../../features/countries/queries';
import type { Country } from '../../features/countries/queries';
import { useCurrencyPresetsQuery } from '../../features/currency-presets/queries';
import type { CurrencyPreset } from '../../features/currency-presets/queries';
import { useUpdateCompanyMutation } from '../../features/merchants/queries';
import type { Merchant } from '../../features/merchants/queries';
import { companyFormSchema } from '../../features/merchants/schema';
import { can, usePermissions } from '../../features/role-permissions/queries';
import type { CompanyFormValues } from '../../features/merchants/schema';
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';
import { spacing } from '../../themes';

type Props = { merchant: Merchant };

/**
 * Company (ERPNext's Company, docs.frappe.io/erpnext/company-setup): the legal entity whose books this
 * system keeps — one per system, the system's name is the company's name — with its accounting defaults
 * (/company-accounting-defaults) and Perpetual Inventory (/perpetual-inventory).
 */
export function CompanyScreen({ merchant }: Props) {
  const countries = useCountriesQuery();
  const currencies = useCurrencyPresetsQuery();
  const accounts = useAccountsQuery({ merchantId: merchant.id });
  const costCenters = useCostCentersQuery({ merchantId: merchant.id });
  // The first of the four still missing decides the loading, offline or failure line.
  const missing = [countries, currencies, accounts, costCenters].find((query) => !query.data);

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Setup" title="Company" meta={merchant.name} onBack={() => router.back()} />
      {countries.data && currencies.data && accounts.data && costCenters.data ? (
        <CompanyForm merchant={merchant} countries={countries.data} currencies={currencies.data} accounts={accounts.data} costCenters={costCenters.data} />
      ) : (
        <View style={styles.state}>
          <QueryState
            query={missing ?? countries}
            offline="You're offline. The company will load when you reconnect."
            failure="Couldn't load the company. Try again."
          />
        </View>
      )}
    </View>
  );
}

type AccountField = {
  name:
    | 'default_cash_account'
    | 'default_bank_account'
    | 'default_income_account'
    | 'default_expense_account'
    | 'write_off_account'
    | 'round_off_account'
    | 'default_inventory_account'
    | 'stock_adjustment_account'
    | 'stock_received_but_not_billed'
    | 'expenses_included_in_valuation';
  label: string;
  hint: string;
  /** ERPNext's filter on the Company form, and private.validate_company_accounts's check. */
  fits: (account: Account) => boolean;
};

const ofType = (type: string) => (account: Account) => account.account_type === type;
const underRoot = (root: string) => (account: Account) => account.root_type === root;

// Company Accounting Defaults: the fallbacks when an item, warehouse, mode of payment or row names none.
const ACCOUNTS: AccountField[] = [
  { name: 'default_cash_account', label: 'Default Cash Account', hint: 'Cash ledger', fits: ofType('Cash') },
  { name: 'default_bank_account', label: 'Default Bank Account', hint: 'Bank ledger', fits: ofType('Bank') },
  { name: 'default_income_account', label: 'Default Income Account', hint: 'Income ledger', fits: underRoot('Income') },
  { name: 'default_expense_account', label: 'Default Expense Account', hint: 'Expense ledger', fits: underRoot('Expense') },
  { name: 'write_off_account', label: 'Write Off Account', hint: 'Small balances written off', fits: underRoot('Expense') },
  { name: 'round_off_account', label: 'Round Off Account', hint: 'Differences from rounding', fits: underRoot('Expense') },
];

// Perpetual Inventory's four accounts (docs.frappe.io/erpnext/perpetual-inventory §1).
const STOCK: AccountField[] = [
  { name: 'default_inventory_account', label: 'Default Inventory Account', hint: 'Stock ledger', fits: ofType('Stock') },
  { name: 'stock_adjustment_account', label: 'Stock Adjustment Account', hint: 'Counts that differ', fits: ofType('Stock Adjustment') },
  {
    name: 'stock_received_but_not_billed',
    label: 'Stock Received But Not Billed',
    hint: 'Received, not yet invoiced',
    fits: ofType('Stock Received But Not Billed'),
  },
  {
    name: 'expenses_included_in_valuation',
    label: 'Expenses Included In Valuation',
    hint: 'Freight and duty in stock value',
    fits: ofType('Expenses Included In Valuation'),
  },
];

const saveFailure = (error: Error | null) =>
  postgrestError(error)?.message === 'company_account_invalid'
    ? "One of the accounts can't be used there any more — it was disabled or changed. Pick it again."
    : failureMessage("Couldn't save the company. Try again.");

const defaults = (merchant: Merchant): CompanyFormValues => ({
  name: merchant.name,
  abbr: merchant.abbr,
  country_code: merchant.country_code,
  default_currency: merchant.default_currency,
  default_cash_account: merchant.default_cash_account ?? '',
  default_bank_account: merchant.default_bank_account ?? '',
  default_income_account: merchant.default_income_account ?? '',
  default_expense_account: merchant.default_expense_account ?? '',
  cost_center: merchant.cost_center ?? '',
  write_off_account: merchant.write_off_account ?? '',
  round_off_account: merchant.round_off_account ?? '',
  round_off_cost_center: merchant.round_off_cost_center ?? '',
  enable_perpetual_inventory: merchant.enable_perpetual_inventory,
  default_inventory_account: merchant.default_inventory_account ?? '',
  stock_adjustment_account: merchant.stock_adjustment_account ?? '',
  stock_received_but_not_billed: merchant.stock_received_but_not_billed ?? '',
  expenses_included_in_valuation: merchant.expenses_included_in_valuation ?? '',
});

type FormProps = Props & { countries: Country[]; currencies: CurrencyPreset[]; accounts: Account[]; costCenters: CostCenter[] };

function CompanyForm({ merchant, countries, currencies, accounts, costCenters }: FormProps) {
  const update = useUpdateCompanyMutation({ merchantId: merchant.id });
  // Read-only without Company write (System Manager and Accounts Manager have it; the owner always does).
  const editable = can(usePermissions({ merchantId: merchant.id }).data, 'Company', 'write');
  const notice = mutationNotice(update, saveFailure(update.error));

  const { control, handleSubmit, reset, formState } = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: defaults(merchant),
    mode: 'onTouched',
  });
  const perpetual = useWatch({ control, name: 'enable_perpetual_inventory' });
  const inventoryAccount = useWatch({ control, name: 'default_inventory_account' });
  const save = handleSubmit(saveOnce(update, reset));

  const costCenterSelect = (name: 'cost_center' | 'round_off_cost_center', label: string) => (
    <ControlledSelect
      control={control}
      name={name}
      label={label}
      hint="Cost center"
      title={label}
      options={costCenterOptions(costCenters, merchant.abbr, merchant[name])}
      disabled={!editable}
    />
  );

  const accountSelect = (field: AccountField) => (
    <ControlledSelect
      key={field.name}
      control={control}
      name={field.name}
      label={field.label}
      hint={field.hint}
      title={field.label}
      options={ledgerOptions(accounts, merchant.abbr, field.fits, merchant[field.name])}
      disabled={!editable}
    />
  );

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

      <SectionHeading title="Accounts" hint="Used when an item, payment or line names no account of its own" />
      <FieldGrid>
        {ACCOUNTS.slice(0, 4).map(accountSelect)}
        {costCenterSelect('cost_center', 'Default Cost Center')}
        {ACCOUNTS.slice(4).map(accountSelect)}
        {costCenterSelect('round_off_cost_center', 'Round Off Cost Center')}
      </FieldGrid>

      <SectionHeading title="Stock" hint="How stock shows in the books" />
      {/* ERPNext only warns here: a warehouse's own inventory account can still serve (docs …/accounting-of-inventory-stock). */}
      {perpetual && inventoryAccount === '' ? (
        <NoteCallout tone="error">Perpetual Inventory is on but no Default Inventory Account is set. Each warehouse will need an inventory account of its own.</NoteCallout>
      ) : null}
      <FieldGrid>
        <ControlledSwitch
          control={control}
          name="enable_perpetual_inventory"
          label="Perpetual Inventory"
          span="full"
          on="Every stock movement is posted to the books as it happens"
          off="Stock is posted to the books by hand, period by period"
          disabled={!editable}
        />
        {STOCK.map(accountSelect)}
      </FieldGrid>
    </PageForm>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
});
