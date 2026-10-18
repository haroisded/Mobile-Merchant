import type { Control, FieldPathByValue, FieldValues } from 'react-hook-form';

import { ledgerOptions, useAccountsQuery } from '../features/accounts/queries';
import type { Account } from '../features/accounts/queries';
import { stockItemOptions, useItemsQuery } from '../features/items/queries';
import type { Item } from '../features/items/queries';
import { useSystemSettingsQuery } from '../features/system-settings/queries';
import { useUomsQuery } from '../features/uoms/queries';
import type { Uom } from '../features/uoms/queries';
import { useWarehousesQuery } from '../features/warehouses/queries';
import type { Warehouse } from '../features/warehouses/queries';
import { todayIn } from '../lib/dates';
import { ControlledText, Field, FieldGrid } from './form-fields';
import { ControlledSelect } from './search-select';
import { SectionHeading } from './section-heading';
import { Text } from './text';

// What the stock documents share — a Stock Entry and a Stock Reconciliation: the masters their fields pick
// from, a row's Quantity and the figure Submit writes beside it, and the Accounting section both end with.

export type StockDocumentRecords = {
  items: Item[];
  uoms: Uom[];
  warehouses: Warehouse[];
  accounts: Account[];
  /** Today where the business is ("YYYY-MM-DD"): a new document's Posting Date. */
  today: string;
};

/**
 * What a stock document's fields start from and pick from — `records` once everything has loaded, and until
 * then the query still `loading`, for the page's state. Every member may select the masters and read System
 * Settings (All's rows on each).
 */
export function useStockDocumentRecords(merchantId: string) {
  const items = useItemsQuery({ merchantId });
  const uoms = useUomsQuery({ merchantId });
  const warehouses = useWarehousesQuery({ merchantId });
  const accounts = useAccountsQuery({ merchantId });
  const settings = useSystemSettingsQuery({ merchantId });

  const records: StockDocumentRecords | undefined =
    items.data && uoms.data && warehouses.data && accounts.data && settings.data
      ? { items: items.data, uoms: uoms.data, warehouses: warehouses.data, accounts: accounts.data, today: todayIn(settings.data.time_zone) }
      : undefined;

  return { records, loading: [items, uoms, warehouses, accounts, settings].find((query) => !query.data) };
}

type QuantityProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPathByValue<T, string>;
  records: StockDocumentRecords;
  /** The item the row names: its stock unit is the field's hint. */
  itemId: string | undefined;
  disabled: boolean;
};

/** A row's Item: a stock item, or the one the row already names. */
export function ItemField<T extends FieldValues>({ control, name, records, itemId, disabled }: QuantityProps<T>) {
  return (
    <ControlledSelect
      control={control}
      name={name}
      label="Item"
      required
      title="Item"
      options={stockItemOptions(records.items, itemId)}
      disabled={disabled}
    />
  );
}

/** A row's Quantity. Both documents count in the item's stock unit, so the field says which that is. */
export function QuantityField<T extends FieldValues>({ control, name, records, itemId, disabled }: QuantityProps<T>) {
  const item = records.items.find((candidate) => candidate.id === itemId);

  return (
    <ControlledText
      control={control}
      name={name}
      label="Quantity"
      required
      hint={records.uoms.find((uom) => uom.id === item?.stock_uom)?.uom_name}
      placeholder="0"
      keyboardType="decimal-pad"
      maxLength={14}
      disabled={disabled}
    />
  );
}

type PostedProps = { label: string; hint: string; value: number | null | undefined; money: (value: number) => string };

/** A figure Submit wrote onto a row — the value it moved, the difference it made. Nothing while it is a draft. */
export function PostedAmount({ label, hint, value, money }: PostedProps) {
  if (value === null || value === undefined) return null;

  return (
    <Field label={label} hint={hint} span="full">
      <Text variant="amount">{money(value)}</Text>
    </Field>
  );
}

type AccountingProps<T extends FieldValues> = {
  control: Control<T>;
  /** The form's Difference Account field. */
  name: FieldPathByValue<T, string>;
  records: StockDocumentRecords;
  /** The saved document: what it names stays listed once disabled. A new one says what an empty field takes. */
  saved: { difference_account: string | null } | undefined;
  /** What an empty Difference Account becomes on a new document ("the store's Stock Adjustment Account"). */
  accountDefault: string;
  /** The ledgers the Difference Account may be. */
  fits: (account: Account) => boolean;
  disabled: boolean;
};

/**
 * Where a stock document's change in stock value goes in the books (docs.frappe.io/erpnext/perpetual-inventory):
 * its Difference Account. On a new document an empty one is filled by the database
 * (private.validate_stock_document), so the field says with what.
 */
export function StockDocumentAccounting<T extends FieldValues>({ control, name, records, saved, accountDefault, fits, disabled }: AccountingProps<T>) {
  return (
    <>
      <SectionHeading title="Accounting" hint="With Perpetual Inventory on, where the change in stock value goes in the books" />
      <FieldGrid>
        <ControlledSelect
          control={control}
          name={name}
          label="Difference Account"
          hint={saved ? undefined : `Empty: ${accountDefault}`}
          title="Difference Account"
          options={ledgerOptions(records.accounts, fits, saved?.difference_account)}
          disabled={disabled}
        />
      </FieldGrid>
    </>
  );
}
