import type { Control, FieldPathByValue, FieldValues } from 'react-hook-form';

import { ledgerOptions, useAccountsQuery } from '../features/accounts/queries';
import type { Account } from '../features/accounts/queries';
import { costCenterOptions, useCostCentersQuery } from '../features/cost-centers/queries';
import type { CostCenter } from '../features/cost-centers/queries';
import { priceListOptions, usePriceListsQuery } from '../features/price-lists/queries';
import type { PriceList } from '../features/price-lists/queries';
import { useWarehousesQuery, warehouseOptions } from '../features/warehouses/queries';
import type { Warehouse } from '../features/warehouses/queries';
import { FieldGrid } from './form-fields';
import { ControlledSelect } from './search-select';

export type SalesDefaultsRecords = { priceLists: PriceList[]; warehouses: Warehouse[]; costCenters: CostCenter[]; accounts: Account[] };

/**
 * The masters the fields below pick from; undefined until all four have loaded. Every member may select them
 * (All's Select on each), so whoever edits the record can pick.
 */
export function useSalesDefaultsRecords(merchantId: string): SalesDefaultsRecords | undefined {
  const priceLists = usePriceListsQuery({ merchantId }).data;
  const warehouses = useWarehousesQuery({ merchantId }).data;
  const costCenters = useCostCentersQuery({ merchantId }).data;
  const accounts = useAccountsQuery({ merchantId }).data;

  return priceLists && warehouses && costCenters && accounts ? { priceLists, warehouses, costCenters, accounts } : undefined;
}

type Props<T extends FieldValues> = {
  control: Control<T>;
  /** The form's field for each default. */
  names: Record<'priceList' | 'warehouse' | 'costCenter' | 'income' | 'expense', FieldPathByValue<T, string>>;
  /** The saved record: each default it names stays listed once disabled, so the field still shows it. */
  saved:
    | { default_price_list: string | null; default_warehouse: string | null; selling_cost_center: string | null; income_account: string | null; expense_account: string | null }
    | undefined;
  records: SalesDefaultsRecords;
  /** The company's abbreviation, shown after warehouse, cost center and account names. */
  abbr: string;
  disabled: boolean;
};

/**
 * The five defaults an Item and an Item Group both hand a sale (docs.frappe.io/erpnext/item 3.9, /item-group
 * 2.2): price list, warehouse, selling cost center, income and expense account. Which record each may name is
 * the database's rule (private.validate_defaults).
 */
export function SalesDefaultsFields<T extends FieldValues>({ control, names, saved, records, abbr, disabled }: Props<T>) {
  return (
    <FieldGrid>
      <ControlledSelect
        control={control}
        name={names.priceList}
        label="Default Price List"
        title="Default Price List"
        options={priceListOptions(records.priceLists, saved?.default_price_list)}
        disabled={disabled}
      />
      <ControlledSelect
        control={control}
        name={names.warehouse}
        label="Default Warehouse"
        hint="Where it is sold from"
        title="Default Warehouse"
        options={warehouseOptions(records.warehouses, abbr, saved?.default_warehouse)}
        disabled={disabled}
      />
      <ControlledSelect
        control={control}
        name={names.costCenter}
        label="Default Selling Cost Center"
        title="Default Selling Cost Center"
        options={costCenterOptions(records.costCenters, abbr, saved?.selling_cost_center)}
        disabled={disabled}
      />
      <ControlledSelect
        control={control}
        name={names.income}
        label="Default Income Account"
        hint="An Income ledger"
        title="Default Income Account"
        options={ledgerOptions(records.accounts, abbr, (account) => account.root_type === 'Income', saved?.income_account)}
        disabled={disabled}
      />
      <ControlledSelect
        control={control}
        name={names.expense}
        label="Default Expense Account"
        hint="An Expense ledger, such as Cost of Goods Sold"
        title="Default Expense Account"
        options={ledgerOptions(records.accounts, abbr, (account) => account.root_type === 'Expense', saved?.expense_account)}
        disabled={disabled}
      />
    </FieldGrid>
  );
}
