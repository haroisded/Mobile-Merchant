import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';

import { saveOnce } from '../../components/adaptive-dialog';
import { DocumentPage, DocumentState, useDocumentAccess } from '../../components/document-page';
import { ControlledDate, ControlledText, FieldGrid } from '../../components/form-fields';
import { RepeatableList } from '../../components/repeatable-rows';
import { ControlledSelect } from '../../components/search-select';
import { SectionHeading } from '../../components/section-heading';
import { PostedAmount, QuantityField, StockDocumentAccounting, useStockDocumentRecords } from '../../components/stock-document';
import type { StockDocumentRecords } from '../../components/stock-document';
import { useMoney } from '../../features/currencies/queries';
import { stockItemOptions } from '../../features/items/queries';
import type { Merchant } from '../../features/merchants/queries';
import {
  invalidateStockReconciliations,
  useDeleteStockReconciliationMutation,
  useSaveStockReconciliationMutation,
  useStockReconciliationQuery,
} from '../../features/stock-reconciliations/queries';
import type { StockReconciliationDocument } from '../../features/stock-reconciliations/queries';
import { STOCK_RECONCILIATION_PURPOSES, stockReconciliationSchema } from '../../features/stock-reconciliations/schema';
import type { StockReconciliationValues } from '../../features/stock-reconciliations/schema';
import { warehouseOptions } from '../../features/warehouses/queries';

/**
 * One Stock Reconciliation (docs.frappe.io/erpnext/stock-reconciliation, /opening-stock): the quantity and
 * valuation rate each row's item is set to in its warehouse — a system's Opening Stock, or a count against
 * the books. A page of the Stock stack — src/app/(app)/systems/[id]/stock/stock-reconciliation.tsx — at every
 * width; new when there is no `docId`. Submit makes the rows the books' own, and from then on the page only
 * shows what changed.
 */
export function StockReconciliationPage({ merchant, docId }: { merchant: Merchant; docId?: string }) {
  const save = useSaveStockReconciliationMutation({ merchantId: merchant.id });
  // A new document becomes the saved one on this same page: Save answers with its id, and Submit needs one.
  const id = docId ?? save.data;
  const reconciliation = useStockReconciliationQuery({ id });
  const { records, loading } = useStockDocumentRecords(merchant.id);

  if (!records || (id !== undefined && !reconciliation.data)) return <DocumentState doctype="Stock Reconciliation" query={loading ?? reconciliation} />;

  return (
    <Form
      // A saved or submitted document is a new form: its fields start from what the database holds.
      key={`${reconciliation.data?.id}:${reconciliation.data?.docstatus}`}
      merchant={merchant}
      records={records}
      existing={reconciliation.data ?? undefined}
      save={save}
    />
  );
}

const defaults = (existing: StockReconciliationDocument | undefined, today: string): StockReconciliationValues => ({
  id: existing?.id ?? '',
  purpose: existing?.purpose ?? 'Stock Reconciliation',
  posting_date: existing?.posting_date ?? today,
  difference_account: existing?.difference_account ?? '',
  cost_center: existing?.cost_center ?? '',
  // A new one starts with a row to fill.
  items: existing?.stock_reconciliation_items.map((row) => ({
    item_id: row.item_id,
    warehouse_id: row.warehouse_id,
    qty: String(row.qty),
    valuation_rate: String(row.valuation_rate),
  })) ?? [{ item_id: '', warehouse_id: '', qty: '', valuation_rate: '' }],
});

type FormProps = {
  merchant: Merchant;
  records: StockDocumentRecords;
  existing: StockReconciliationDocument | undefined;
  save: ReturnType<typeof useSaveStockReconciliationMutation>;
};

function Form({ merchant, records, existing, save }: FormProps) {
  const { draft, editable } = useDocumentAccess(merchant.id, 'Stock Reconciliation', existing);
  const remove = useDeleteStockReconciliationMutation();
  const { control, handleSubmit, reset, formState } = useForm<StockReconciliationValues>({
    resolver: zodResolver(stockReconciliationSchema),
    defaultValues: defaults(existing, records.today),
    mode: 'onTouched',
  });
  const opening = useWatch({ control, name: 'purpose' }) === 'Opening Stock';

  return (
    <DocumentPage
      merchantId={merchant.id}
      doctype="Stock Reconciliation"
      document={existing}
      dirty={formState.isDirty}
      remove={remove.mutateAsync}
      invalidate={invalidateStockReconciliations}
      submitBody="Each row's quantity and valuation rate become the books' own, and the change in value posts. After that it can be cancelled, but not changed."
      cancelBody="Its stock movements and ledger entries are reversed. It stays on record as cancelled, and can't be submitted again."
      draft={draft}
      editable={editable}
      save={save}
      onSave={handleSubmit(saveOnce(save, reset))}
    >
      <FieldGrid>
        <ControlledSelect
          control={control}
          name="purpose"
          label="Purpose"
          required
          hint={opening ? "A system's first stock" : 'A count against the books'}
          title="Purpose"
          options={STOCK_RECONCILIATION_PURPOSES.map((value) => ({ value, label: value }))}
          disabled={!editable}
        />
        <ControlledDate control={control} name="posting_date" label="Posting Date" required disabled={!editable} />
      </FieldGrid>
      <Rows control={control} merchant={merchant} records={records} existing={existing} disabled={!editable} />
      <StockDocumentAccounting
        control={control}
        names={{ account: 'difference_account', costCenter: 'cost_center' }}
        records={records}
        abbr={merchant.abbr}
        saved={existing}
        accountDefault={opening ? 'Temporary Opening' : "the company's Stock Adjustment Account"}
        // An Opening Stock's is an asset or liability account (private.validate_stock_document).
        fits={(account) => !opening || account.root_type === 'Asset' || account.root_type === 'Liability'}
        disabled={!editable}
      />
    </DocumentPage>
  );
}

type RowsProps = {
  control: Control<StockReconciliationValues>;
  merchant: Merchant;
  records: StockDocumentRecords;
  existing: StockReconciliationDocument | undefined;
  disabled: boolean;
};

/**
 * What each item's stock is set to in a warehouse: the quantity counted, and what each unit is worth. A
 * posted document also says what the books held before, and the value the count changed.
 */
function Rows({ control, merchant, records, existing, disabled }: RowsProps) {
  const rows = useFieldArray({ control, name: 'items' });
  const items = useWatch({ control, name: 'items' });
  const money = useMoney(merchant);
  const held = (index: number) => {
    const posted = existing?.stock_reconciliation_items[index];
    return `The books held ${posted?.current_qty ?? 0} at ${money(posted?.current_valuation_rate ?? 0)}`;
  };

  return (
    <>
      <SectionHeading title="Items" hint="What each item's stock is set to in a warehouse: the quantity counted, and what each unit is worth" />
      <RepeatableList
        fields={rows.fields}
        editable={!disabled}
        empty="No items yet."
        addLabel="Add Item"
        onAdd={() => rows.append({ item_id: '', warehouse_id: '', qty: '', valuation_rate: '' })}
        onRemove={rows.remove}
      >
        {(index) => (
          <FieldGrid>
            <ControlledSelect
              control={control}
              name={`items.${index}.item_id`}
              label="Item"
              required
              title="Item"
              options={stockItemOptions(records.items, items[index]?.item_id)}
              disabled={disabled}
            />
            <ControlledSelect
              control={control}
              name={`items.${index}.warehouse_id`}
              label="Warehouse"
              required
              title="Warehouse"
              // Without None: a count is always of somewhere.
              options={warehouseOptions(records.warehouses, merchant.abbr, items[index]?.warehouse_id).slice(1)}
              disabled={disabled}
            />
            <QuantityField control={control} name={`items.${index}.qty`} records={records} itemId={items[index]?.item_id} disabled={disabled} />
            <ControlledText
              control={control}
              name={`items.${index}.valuation_rate`}
              label="Valuation Rate"
              hint="What each unit is worth"
              placeholder="0"
              keyboardType="decimal-pad"
              maxLength={14}
              disabled={disabled}
            />
            <PostedAmount label="Amount Difference" hint={held(index)} value={existing?.stock_reconciliation_items[index]?.amount_difference} money={money} />
          </FieldGrid>
        )}
      </RepeatableList>
    </>
  );
}
