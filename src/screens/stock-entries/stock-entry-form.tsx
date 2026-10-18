import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';

import { saveOnce } from '../../components/adaptive-dialog';
import { DocumentPage, DocumentState, useDocumentAccess } from '../../components/document-page';
import { ControlledDate, ControlledText, FieldGrid } from '../../components/form-fields';
import { RepeatableList } from '../../components/repeatable-rows';
import { ControlledSelect } from '../../components/search-select';
import { SectionHeading } from '../../components/section-heading';
import { ItemField, PostedAmount, QuantityField, StockDocumentAccounting, useStockDocumentRecords } from '../../components/stock-document';
import type { StockDocumentRecords } from '../../components/stock-document';
import { useMoney } from '../../features/currencies/queries';
import type { Merchant } from '../../features/merchants/queries';
import { invalidateStockEntries, useDeleteStockEntryMutation, useSaveStockEntryMutation, useStockEntryQuery } from '../../features/stock-entries/queries';
import type { StockEntryDocument } from '../../features/stock-entries/queries';
import { bringsTo, STOCK_ENTRY_PURPOSES, stockEntrySchema, takesFrom } from '../../features/stock-entries/schema';
import type { StockEntryValues } from '../../features/stock-entries/schema';
import { warehouseOptions } from '../../features/warehouses/queries';

/**
 * One Stock Entry (docs.frappe.io/erpnext/stock-entry): a Material Receipt, Issue or Transfer, its
 * warehouses and its rows. A page of the Stock stack — src/app/(app)/systems/[id]/stock/stock-entry.tsx — at
 * every width; new when there is no `docId`. A draft is edited and saved; Submit moves the stock, and from
 * then on the page only shows what it posted.
 */
export function StockEntryPage({ merchant, docId }: { merchant: Merchant; docId?: string }) {
  const save = useSaveStockEntryMutation({ merchantId: merchant.id });
  // A new document becomes the saved one on this same page: Save answers with its id, and Submit needs one.
  const id = docId ?? save.data;
  const entry = useStockEntryQuery({ id });
  const { records, loading } = useStockDocumentRecords(merchant.id);

  if (!records || (id !== undefined && !entry.data)) return <DocumentState doctype="Stock Entry" query={loading ?? entry} />;

  return (
    <Form
      // A saved or submitted document is a new form: its fields start from what the database holds.
      key={`${entry.data?.id}:${entry.data?.docstatus}`}
      merchant={merchant}
      records={records}
      existing={entry.data ?? undefined}
      save={save}
    />
  );
}

const blank = (today: string): StockEntryValues => ({
  id: '',
  purpose: 'Material Receipt',
  posting_date: today,
  from_warehouse: '',
  to_warehouse: '',
  difference_account: '',
  items: [{ item_id: '', qty: '', basic_rate: '' }],
});

const text = (value: string | number | null) => String(value ?? '');

const saved = (entry: StockEntryDocument): StockEntryValues => ({
  id: entry.id,
  purpose: entry.purpose,
  posting_date: entry.posting_date,
  from_warehouse: text(entry.from_warehouse),
  to_warehouse: text(entry.to_warehouse),
  difference_account: text(entry.difference_account),
  items: entry.stock_entry_items.map((row) => ({ item_id: row.item_id, qty: String(row.qty), basic_rate: text(row.basic_rate) })),
});

type FormProps = { merchant: Merchant; records: StockDocumentRecords; existing: StockEntryDocument | undefined; save: ReturnType<typeof useSaveStockEntryMutation> };

function Form({ merchant, records, existing, save }: FormProps) {
  const { draft, editable } = useDocumentAccess(merchant.id, 'Stock Entry', existing);
  const remove = useDeleteStockEntryMutation();
  const { control, handleSubmit, reset, formState } = useForm<StockEntryValues>({
    resolver: zodResolver(stockEntrySchema),
    defaultValues: existing ? saved(existing) : blank(records.today),
    mode: 'onTouched',
  });
  const section = { control, merchant, records, existing, disabled: !editable };

  return (
    <DocumentPage
      merchantId={merchant.id}
      doctype="Stock Entry"
      document={existing}
      dirty={formState.isDirty}
      remove={remove.mutateAsync}
      invalidate={invalidateStockEntries}
      submitBody="Its stock moves now, and its value posts to the books. After that it can be cancelled, but not changed."
      cancelBody="Its stock movements and ledger entries are reversed. It stays on record as cancelled, and can't be submitted again."
      draft={draft}
      editable={editable}
      save={save}
      onSave={handleSubmit(saveOnce(save, reset))}
    >
      <Details {...section} />
      <Rows {...section} draft={draft} />
      <StockDocumentAccounting
        control={control}
        name="difference_account"
        records={records}
        saved={existing}
        accountDefault="the store's Stock Adjustment Account"
        fits={() => true}
        disabled={!editable}
      />
    </DocumentPage>
  );
}

type SectionProps = {
  control: Control<StockEntryValues>;
  merchant: Merchant;
  records: StockDocumentRecords;
  existing: StockEntryDocument | undefined;
  disabled: boolean;
};

/** What kind of movement it is, when, and between which warehouses (docs.frappe.io/erpnext/stock-entry-purpose). */
function Details({ control, records, existing, disabled }: SectionProps) {
  const purpose = useWatch({ control, name: 'purpose' });

  return (
    <FieldGrid>
      <ControlledSelect
        control={control}
        name="purpose"
        label="Purpose"
        required
        title="Purpose"
        options={STOCK_ENTRY_PURPOSES.map((value) => ({ value, label: value }))}
        disabled={disabled}
      />
      <ControlledDate control={control} name="posting_date" label="Posting Date" required disabled={disabled} />
      {takesFrom(purpose) ? (
        <ControlledSelect
          control={control}
          name="from_warehouse"
          label="Source Warehouse"
          required
          hint="Where the stock leaves"
          title="Source Warehouse"
          options={warehouseOptions(records.warehouses, existing?.from_warehouse)}
          disabled={disabled}
        />
      ) : null}
      {bringsTo(purpose) ? (
        <ControlledSelect
          control={control}
          name="to_warehouse"
          label="Target Warehouse"
          required
          hint="Where the stock goes"
          title="Target Warehouse"
          options={warehouseOptions(records.warehouses, existing?.to_warehouse)}
          disabled={disabled}
        />
      ) : null}
    </FieldGrid>
  );
}

/**
 * The items it moves, each in its stock unit. A receipt's rate is typed; an issue's or a transfer's is the
 * valuation the stock left at, which only a posted document knows — as it does each row's amount.
 */
function Rows({ control, merchant, records, existing, disabled, draft }: SectionProps & { draft: boolean }) {
  const rows = useFieldArray({ control, name: 'items' });
  const [purpose, items] = useWatch({ control, name: ['purpose', 'items'] });
  const money = useMoney(merchant);
  const receipt = purpose === 'Material Receipt';

  return (
    <>
      <SectionHeading title="Items" hint={receipt ? 'What came in, and what each unit cost' : 'What moves; it leaves at its own valuation'} />
      <RepeatableList
        fields={rows.fields}
        editable={!disabled}
        empty="No items yet."
        addLabel="Add Item"
        onAdd={() => rows.append({ item_id: '', qty: '', basic_rate: '' })}
        onRemove={rows.remove}
      >
        {(index) => (
          <FieldGrid>
            <ItemField control={control} name={`items.${index}.item_id`} records={records} itemId={items[index]?.item_id} disabled={disabled} />
            <QuantityField control={control} name={`items.${index}.qty`} records={records} itemId={items[index]?.item_id} disabled={disabled} />
            {receipt || !draft ? (
              <ControlledText
                control={control}
                name={`items.${index}.basic_rate`}
                label="Basic Rate"
                required={receipt}
                hint={receipt ? 'What each unit cost' : 'The valuation it left at'}
                placeholder="0"
                keyboardType="decimal-pad"
                maxLength={14}
                disabled={disabled || !receipt}
              />
            ) : null}
            <PostedAmount label="Amount" hint="The stock value this row moved" value={existing?.stock_entry_items[index]?.amount} money={money} />
          </FieldGrid>
        )}
      </RepeatableList>
    </>
  );
}
