import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { saveOnce } from '../../components/adaptive-dialog';
import { ControlledSwitch, Field, FieldGrid } from '../../components/form-fields';
import { PageForm } from '../../components/form-footer';
import { NoteCallout } from '../../components/note-callout';
import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { SampleBox, SampleLine } from '../../components/sample-box';
import { ControlledSelect } from '../../components/search-select';
import { SectionHeading } from '../../components/section-heading';
import { itemGroupOptions, useItemGroupsQuery } from '../../features/item-groups/queries';
import type { ItemGroup } from '../../features/item-groups/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useSellingSettingsQuery } from '../../features/selling-settings/queries';
import { FALLBACK_WITH_AUTO_INSERT } from '../../features/selling-settings/schema';
import { useStockSettingsQuery, useUpdateStockSettingsMutation } from '../../features/stock-settings/queries';
import type { StockSettings } from '../../features/stock-settings/queries';
import { stockSettingsSchema } from '../../features/stock-settings/schema';
import type { StockSettingsValues } from '../../features/stock-settings/schema';
import { uomOptions, useUomsQuery } from '../../features/uoms/queries';
import type { Uom } from '../../features/uoms/queries';
import { useWarehousesQuery, warehouseOptions } from '../../features/warehouses/queries';
import type { Warehouse } from '../../features/warehouses/queries';
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';
import { spacing } from '../../themes';

const header = (save?: ReactNode) => <PageHeader kicker="Setup" title="Stock Settings" meta="What new items start with, and how stock is valued" onBack={() => router.back()} actions={save} />;

/**
 * Stock Settings (docs.frappe.io/erpnext/stock-settings, /fifo-and-moving-average): how new items are named,
 * the group, unit and warehouse they start with, the valuation method that costs each sale, negative stock,
 * and whether a first sale's rate becomes the item's price. No Show Barcode Field: an item's Barcode
 * always shows (ARCHITECTURE.md, Item barcodes).
 */
export function StockSettingsScreen({ merchant }: { merchant: Merchant }) {
  const settings = useStockSettingsQuery({ merchantId: merchant.id });
  // Every member may select these (All's Select on each).
  const groups = useItemGroupsQuery({ merchantId: merchant.id });
  const uoms = useUomsQuery({ merchantId: merchant.id });
  const warehouses = useWarehousesQuery({ merchantId: merchant.id });
  const loading = [settings, groups, uoms, warehouses].find((query) => !query.data) ?? settings;

  return (
    <View style={styles.fill}>
      {settings.data && groups.data && uoms.data && warehouses.data ? null : header()}
      {settings.data && groups.data && uoms.data && warehouses.data ? (
        <SettingsForm merchant={merchant} saved={settings.data} records={{ groups: groups.data, uoms: uoms.data, warehouses: warehouses.data }} />
      ) : (
        <View style={styles.state}>
          <QueryState query={loading} offline="You're offline. Stock Settings will load when you reconnect." failure="Couldn't load Stock Settings. Try again." />
        </View>
      )}
    </View>
  );
}

const defaults = (saved: StockSettings): StockSettingsValues => ({
  item_naming_by: saved.item_naming_by === 'Naming Series' ? 'Naming Series' : 'Item Code',
  item_group: saved.item_group ?? '',
  stock_uom: saved.stock_uom ?? '',
  default_warehouse: saved.default_warehouse ?? '',
  valuation_method: saved.valuation_method === 'Moving Average' ? 'Moving Average' : 'FIFO',
  allow_negative_stock: saved.allow_negative_stock,
  auto_insert_price_list_rate_if_missing: saved.auto_insert_price_list_rate_if_missing,
});

const NAMING_OPTIONS = [
  { value: 'Item Code', label: 'Item Code', hint: 'An item is named by the code typed for it' },
  { value: 'Naming Series', label: 'Naming Series', hint: "An item is numbered by the Item naming series" },
];

const METHOD_OPTIONS = [
  { value: 'FIFO', label: 'FIFO', hint: 'First in, first out: the oldest stock is sold first' },
  { value: 'Moving Average', label: 'Moving Average', hint: 'Every unit costs the running average' },
];

const saveFailure = (error: Error | null) => {
  const message = postgrestError(error)?.message;
  if (message === 'default_invalid') return "One of the defaults can't be used any more — pick it again.";
  if (message === 'valuation_locked') return 'Items that follow this setting have stock movements, so they keep Moving Average.';
  return failureMessage("Couldn't save Stock Settings. Try again.");
};

type Records = { groups: ItemGroup[]; uoms: Uom[]; warehouses: Warehouse[] };

function SettingsForm({ merchant, saved, records }: { merchant: Merchant; saved: StockSettings; records: Records }) {
  const update = useUpdateStockSettingsMutation({ merchantId: merchant.id });
  const editable = can(usePermissions({ merchantId: merchant.id }).data, 'Stock Settings', 'write');
  // Every member may read Selling Settings (All's Read); without it, there is simply no warning.
  const fallback = useSellingSettingsQuery({ merchantId: merchant.id }).data?.fallback_to_default_price_list;
  const notice = mutationNotice(update, saveFailure(update.error));

  const { control, handleSubmit, reset, formState } = useForm<StockSettingsValues>({
    resolver: zodResolver(stockSettingsSchema),
    defaultValues: defaults(saved),
    mode: 'onTouched',
  });
  const autoInsert = useWatch({ control, name: 'auto_insert_price_list_rate_if_missing' });
  const method = useWatch({ control, name: 'valuation_method' });
  const save = handleSubmit(saveOnce(update, reset));

  return (
    <PageForm header={header} editable={editable} readOnly="Changing it needs Stock Settings write." notice={notice} mutation={update} dirty={formState.isDirty} unsaved={formState.isDirty} onSave={save}>
      {fallback && autoInsert ? <NoteCallout tone="error">{FALLBACK_WITH_AUTO_INSERT}</NoteCallout> : null}
      <FieldGrid>
        <ControlledSelect control={control} name="item_naming_by" label="Item Naming By" title="Item Naming By" options={NAMING_OPTIONS} disabled={!editable} />
        <ControlledSelect
          control={control}
          name="item_group"
          label="Default Item Group"
          hint="A new item's group"
          title="Default Item Group"
          options={itemGroupOptions(records.groups)}
          disabled={!editable}
        />
        <ControlledSelect
          control={control}
          name="stock_uom"
          label="Default Stock UOM"
          hint="The unit a new item is counted in"
          title="Default Stock UOM"
          options={[{ value: '', label: 'None' }, ...uomOptions(records.uoms, saved.stock_uom ?? undefined)]}
          disabled={!editable}
        />
        <ControlledSelect
          control={control}
          name="default_warehouse"
          label="Default Warehouse"
          hint="Where a new item's stock is kept"
          title="Default Warehouse"
          options={warehouseOptions(records.warehouses, saved.default_warehouse)}
          disabled={!editable}
        />
        <ControlledSelect
          control={control}
          name="valuation_method"
          label="Default Valuation Method"
          hint="A new item takes it"
          title="Default Valuation Method"
          options={METHOD_OPTIONS}
          disabled={!editable}
        />
        <ControlledSwitch
          control={control}
          name="allow_negative_stock"
          label="Allow Negative Stock"
          span="full"
          on="An item can be sold with no stock left; it goes below zero"
          off="An item can't be sold past the stock on hand"
          disabled={!editable}
        />
        <ControlledSwitch
          control={control}
          name="auto_insert_price_list_rate_if_missing"
          label="Auto Insert Price List Rate if Missing"
          span="full"
          on="An item's first sale writes its rate into the price list"
          off="An item's price comes only from its price list"
          disabled={!editable}
        />
      </FieldGrid>
      <ValuationExample method={method} />
    </PageForm>
  );
}

/**
 * The docs' worked example (docs.frappe.io/erpnext/fifo-and-moving-average §2.2, §3.2), the chosen method
 * first. ponytail: static copy — the valuation engine lands with stock posting (Opening Stock, POS Invoice),
 * and this reads from it then.
 */
function ValuationExample({ method }: { method: StockSettingsValues['valuation_method'] }) {
  const fifo = (
    <Field key="FIFO" label={method === 'FIFO' ? 'FIFO · Chosen' : 'FIFO'} span="full">
      <SampleBox>
        <SampleLine label="Cost of the 15 sold" value="1,600" sub="10 at 100, then 5 at 120: the oldest stock goes first" />
        <SampleLine label="The 5 left are worth" value="600" sub="5 at 120" />
      </SampleBox>
    </Field>
  );
  const average = (
    <Field key="Moving Average" label={method === 'Moving Average' ? 'Moving Average · Chosen' : 'Moving Average'} span="full">
      <SampleBox>
        <SampleLine label="Cost of the 15 sold" value="1,650" sub="15 at the average of 110: (10 × 100 + 10 × 120) ÷ 20" />
        <SampleLine label="The 5 left are worth" value="550" sub="5 at 110" />
      </SampleBox>
    </Field>
  );

  return (
    <>
      <SectionHeading
        title="FIFO or Moving Average"
        hint="Receive 10 at 100, then 10 at 120, then sell 15. Choose before items have stock: a method in use changes only from FIFO to Moving Average."
      />
      <FieldGrid>{method === 'FIFO' ? [fifo, average] : [average, fifo]}</FieldGrid>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
});
