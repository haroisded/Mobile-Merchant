import { zodResolver } from '@hookform/resolvers/zod';
import { router, useNavigation } from 'expo-router';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { saveOnce } from '../../components/adaptive-dialog';
import { Button } from '../../components/button';
import { useConfirm } from '../../components/confirm-dialog';
import { ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { PageForm } from '../../components/form-footer';
import { ItemTaxFields, useItemTaxRecords } from '../../components/item-tax-fields';
import type { ItemTaxRecords } from '../../components/item-tax-fields';
import { PageHeader } from '../../components/page-header';
import { RepeatableList } from '../../components/repeatable-rows';
import { SalesDefaultsFields, useSalesDefaultsRecords } from '../../components/sales-defaults-fields';
import type { SalesDefaultsRecords } from '../../components/sales-defaults-fields';
import { ControlledSelect } from '../../components/search-select';
import { SectionHeading } from '../../components/section-heading';
import { useBrandsQuery } from '../../features/brands/queries';
import type { Brand } from '../../features/brands/queries';
import { useItemGroupsQuery } from '../../features/item-groups/queries';
import type { ItemGroup } from '../../features/item-groups/queries';
import { itemLabel, useDeleteItemMutation, useItemsQuery, useSaveItemMutation } from '../../features/items/queries';
import type { Item } from '../../features/items/queries';
import { itemSchema } from '../../features/items/schema';
import type { ItemValues } from '../../features/items/schema';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useSellingSettingsQuery } from '../../features/selling-settings/queries';
import { useStockSettingsQuery } from '../../features/stock-settings/queries';
import type { StockSettings } from '../../features/stock-settings/queries';
import { uomOptions, useUomsQuery } from '../../features/uoms/queries';
import type { Uom } from '../../features/uoms/queries';
import { useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice, postgrestError, usedElsewhere } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';

type Records = {
  groups: ItemGroup[];
  uoms: Uom[];
  brands: Brand[];
  stockSettings: StockSettings;
  /** Selling Settings' Default Price List's name: where a new item's Standard Selling Rate is written. */
  sellingPriceList: string | undefined;
  sales: SalesDefaultsRecords;
  tax: ItemTaxRecords;
};

/**
 * One Item (docs.frappe.io/erpnext/item): what it is, how its stock is kept, the units it sells in, the
 * defaults a sale falls back on, and its Item Tax rows. A page of the Stock stack —
 * src/app/(app)/systems/[id]/stock/item.tsx — at every width, being a long form; new when there is no `itemId`.
 */
export function ItemPage({ merchant, itemId }: { merchant: Merchant; itemId?: string }) {
  // The list this page was opened from fetched the items; the rest are cache hits once Setup has been browsed.
  const items = useItemsQuery({ merchantId: merchant.id }).data;
  const groups = useItemGroupsQuery({ merchantId: merchant.id }).data;
  const uoms = useUomsQuery({ merchantId: merchant.id }).data;
  const brands = useBrandsQuery({ merchantId: merchant.id }).data;
  const stockSettings = useStockSettingsQuery({ merchantId: merchant.id }).data;
  const sellingSettings = useSellingSettingsQuery({ merchantId: merchant.id }).data;
  const sales = useSalesDefaultsRecords(merchant.id);
  const tax = useItemTaxRecords(merchant.id);
  if (!items || !groups || !uoms || !brands || !stockSettings || !sellingSettings || !sales || !tax) return null;

  return (
    <Form
      merchant={merchant}
      records={{
        groups,
        uoms,
        brands,
        stockSettings,
        sellingPriceList: sales.priceLists.find((priceList) => priceList.id === sellingSettings.default_price_list)?.price_list_name,
        sales,
        tax,
      }}
      existing={itemId ? items.find((item) => item.id === itemId) : undefined}
    />
  );
}

// A new item starts from Stock Settings: its group (when that is one items go in), unit and warehouse.
const blank = ({ groups, stockSettings }: Records): ItemValues => ({
  item_code: '',
  item_name: '',
  item_group_id: groups.find((group) => group.id === stockSettings.item_group && !group.is_group)?.id ?? '',
  stock_uom: stockSettings.stock_uom ?? '',
  description: '',
  brand_id: '',
  disabled: false,
  is_stock_item: true,
  valuation_method: '',
  allow_negative_stock: false,
  reorder_level: '',
  sales_uom: '',
  default_warehouse: stockSettings.default_warehouse ?? '',
  default_price_list: '',
  selling_cost_center: '',
  income_account: '',
  expense_account: '',
  standard_rate: '',
  uoms: [],
  taxes: [],
});

const text = (value: string | number | null) => String(value ?? '');

const saved = (item: Item): ItemValues => ({
  item_code: item.item_code,
  item_name: item.item_name,
  item_group_id: item.item_group_id,
  stock_uom: item.stock_uom,
  description: text(item.description),
  brand_id: text(item.brand_id),
  disabled: item.disabled,
  is_stock_item: item.is_stock_item,
  valuation_method: text(item.valuation_method),
  allow_negative_stock: item.allow_negative_stock,
  reorder_level: text(item.reorder_level),
  sales_uom: text(item.sales_uom),
  default_warehouse: text(item.default_warehouse),
  default_price_list: text(item.default_price_list),
  selling_cost_center: text(item.selling_cost_center),
  income_account: text(item.income_account),
  expense_account: text(item.expense_account),
  standard_rate: '',
  uoms: item.item_uoms.map((row) => ({ uom_id: row.uom_id, conversion_factor: String(row.conversion_factor) })),
  taxes: item.item_taxes.map((row) => ({ item_tax_template_id: row.item_tax_template_id, tax_category_id: text(row.tax_category_id), valid_from: text(row.valid_from) })),
});

// Each refusal the database names (supabase/migrations/20261011134250_items.sql, 20261011134357_item_prices.sql).
const REFUSALS = new Map([
  ['item_group_is_group', 'Pick an item group that is not a group: items go in the groups under it.'],
  ['default_invalid', "The unit or one of the defaults can't be used any more — pick it again."],
  ['no_default_price_list', 'Selling Settings has no Default Price List for the Standard Selling Rate. Set one there, or clear the rate.'],
  ['price_list_disabled', "Selling Settings' Default Price List is disabled, so the Standard Selling Rate has nowhere to go. Clear the rate, or enable the list."],
  ['no_item_series', 'Document Naming Settings has no series for Item. Add one there first.'],
  ['no_fiscal_year', "No fiscal year covers today, so the Item series can't number this item."],
]);

const saveFailure = (error: Error | null) => {
  const cause = postgrestError(error);
  if (cause?.code === '23505') return 'There is already an item with this code.';
  return REFUSALS.get(cause?.message ?? '') ?? failureMessage("Couldn't save this item. Try again.");
};

const deleteFailure = (cause: Error | null) =>
  usedElsewhere(cause) ??
  (postgrestError(cause)?.code === '23503' ? "It's in use. Disable it instead." : failureMessage("Couldn't delete this item. Try again."));

/** The page's header: kicker, title, and the red Delete with its confirm for whoever may delete. */
function ItemHeader({ merchant, existing }: { merchant: Merchant; existing: Item | undefined }) {
  const { colors } = useAppTheme();
  const navigation = useNavigation();
  const wide = useShellWide();
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const remove = useDeleteItemMutation();
  const confirm = useConfirm();

  const askDelete = (item: Item) =>
    confirm.ask({
      title: `Delete ${item.item_code}?`,
      body: 'Its units, Item Tax rows and prices go with it. Disable it instead to keep them.',
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(item.id),
      failure: deleteFailure,
      // A page of the Stock stack, as an item group's is of Setup's (src/screens/item-groups/item-group-form.tsx):
      // it pops through its own navigator, and on a phone the confirm's sheet of the outer stack pops too.
      onDone: () => {
        navigation.goBack();
        if (!wide) router.back();
      },
    });

  return (
    <>
      <PageHeader
        kicker="Item"
        title={existing ? itemLabel(existing) : 'New item'}
        onBack={() => router.back()}
        actions={
          existing && can(permissions, 'Item', 'delete') ? (
            <Button mode="outlined" textColor={colors.error} icon="delete" onPress={() => askDelete(existing)}>
              Delete
            </Button>
          ) : null
        }
      />
      {confirm.dialog}
    </>
  );
}

function Form({ merchant, records, existing }: { merchant: Merchant; records: Records; existing: Item | undefined }) {
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const editable = can(permissions, 'Item', existing ? 'write' : 'create');
  const save = useSaveItemMutation({ merchantId: merchant.id, itemId: existing?.id });
  // Stock Settings' Item Naming By: a typed code, or the next name of the Item series.
  const fromSeries = !existing && records.stockSettings.item_naming_by === 'Naming Series';

  const { control, handleSubmit, formState } = useForm<ItemValues>({
    resolver: zodResolver(itemSchema(!fromSeries)),
    defaultValues: existing ? saved(existing) : blank(records),
    mode: 'onTouched',
  });
  const isStockItem = useWatch({ control, name: 'is_stock_item' });
  const section = { control, records, disabled: !editable };

  return (
    <View style={styles.fill}>
      <ItemHeader merchant={merchant} existing={existing} />
      <PageForm
        editable={editable}
        readOnly="Changing it needs Item write."
        notice={mutationNotice(save, saveFailure(save.error))}
        mutation={save}
        // An item not yet saved always has something to check: Save names what is missing ("Enter a code.").
        dirty={!existing || formState.isDirty}
        onSave={handleSubmit(saveOnce(save, () => router.back()))}
      >
        <Details {...section} existing={existing} fromSeries={fromSeries} priced={!existing && can(permissions, 'Item Price', 'create')} />
        {isStockItem ? <Inventory {...section} /> : null}
        <Units {...section} savedUom={existing?.stock_uom} />
        {/* docs.frappe.io/erpnext/item 3.9 */}
        <SectionHeading title="Defaults" hint="What a sale of it starts with; an empty one comes from its item group, its brand, then the company" />
        <SalesDefaultsFields
          control={control}
          names={{ priceList: 'default_price_list', warehouse: 'default_warehouse', costCenter: 'selling_cost_center', income: 'income_account', expense: 'expense_account' }}
          saved={existing}
          records={records.sales}
          abbr={merchant.abbr}
          disabled={!editable}
        />
        <Taxes {...section} />
      </PageForm>
    </View>
  );
}

type SectionProps = { control: Control<ItemValues>; records: Records; disabled: boolean };

type DetailsProps = SectionProps & {
  existing: Item | undefined;
  /** A new item under a naming series: its code comes from the series on Save. */
  fromSeries: boolean;
  /** A new item whose creator may write its first price. */
  priced: boolean;
};

/** What the item is (docs.frappe.io/erpnext/item 2.1, 2.2, 3.1). */
function Details({ control, records, disabled, existing, fromSeries, priced }: DetailsProps) {
  return (
    <FieldGrid>
      {fromSeries ? (
        <ControlledText control={control} name="item_code" label="Item Code" hint="Stock Settings: Naming Series" placeholder="Numbered by the Item series on Save" disabled />
      ) : (
        <ControlledText
          control={control}
          name="item_code"
          label="Item Code"
          required={!existing}
          hint={existing ? 'An item keeps its code' : undefined}
          placeholder="e.g. NOTE-A5"
          maxLength={140}
          disabled={disabled || existing !== undefined}
        />
      )}
      <ControlledText control={control} name="item_name" label="Item Name" hint="Empty: the code" placeholder="e.g. Notebook A5" maxLength={140} disabled={disabled} />
      <ControlledSelect
        control={control}
        name="item_group_id"
        label="Item Group"
        required
        title="Item Group"
        // Items go in the groups that are not groups; a saved item keeps showing its own.
        options={records.groups.filter((group) => !group.is_group || group.id === existing?.item_group_id).map((group) => ({ value: group.id, label: group.item_group_name }))}
        disabled={disabled}
      />
      <ControlledSelect
        control={control}
        name="stock_uom"
        label="Default Unit of Measure"
        required
        hint="The unit its stock is counted in"
        title="Default Unit of Measure"
        options={uomOptions(records.uoms, existing?.stock_uom)}
        disabled={disabled}
      />
      <ControlledSelect
        control={control}
        name="brand_id"
        label="Brand"
        title="Brand"
        options={[{ value: '', label: 'None' }, ...records.brands.map((brand) => ({ value: brand.id, label: brand.brand }))]}
        disabled={disabled}
      />
      <ControlledText control={control} name="description" label="Description" span="full" placeholder="e.g. 80 pages, ruled" maxLength={1000} multiline disabled={disabled} />
      <ControlledSwitch control={control} name="is_stock_item" label="Maintain Stock" on="Its stock is kept and counted" off="A service: no stock is kept" disabled={disabled} />
      {existing ? <ControlledSwitch control={control} name="disabled" label="Disabled" on="Can't be picked for a sale" off="Can be sold" disabled={disabled} /> : null}
      {/* docs.frappe.io/erpnext/item 2.2: read on creation only. */}
      {priced ? (
        <ControlledText
          control={control}
          name="standard_rate"
          label="Standard Selling Rate"
          hint={records.sellingPriceList ? `Becomes its price in ${records.sellingPriceList}` : 'Selling Settings names no price list'}
          placeholder="0"
          keyboardType="decimal-pad"
          maxLength={14}
          disabled={disabled}
        />
      ) : null}
    </FieldGrid>
  );
}

/** How its stock is valued, and when it counts as low (docs.frappe.io/erpnext/item 3.3, 3.4). */
function Inventory({ control, records, disabled }: SectionProps) {
  return (
    <>
      <SectionHeading title="Inventory" hint="How its stock is valued, and when it counts as low" />
      <FieldGrid>
        <ControlledSelect
          control={control}
          name="valuation_method"
          label="Valuation Method"
          title="Valuation Method"
          options={[
            { value: '', label: "Stock Settings' method", hint: records.stockSettings.valuation_method },
            { value: 'FIFO', label: 'FIFO' },
            { value: 'Moving Average', label: 'Moving Average' },
          ]}
          disabled={disabled}
        />
        <ControlledText
          control={control}
          name="reorder_level"
          label="Re-order Level"
          hint="At or below it, stock is low"
          placeholder="None"
          keyboardType="decimal-pad"
          maxLength={14}
          disabled={disabled}
        />
        <ControlledSwitch
          control={control}
          name="allow_negative_stock"
          label="Allow Negative Stock"
          on="Can be sold below zero, whatever Stock Settings say"
          off="Follows Stock Settings"
          disabled={disabled}
        />
      </FieldGrid>
    </>
  );
}

/** The other units it sells in, and the one a sale starts in (docs.frappe.io/erpnext/item 3.5, 3.13). */
function Units({ control, records, disabled, savedUom }: SectionProps & { savedUom: string | undefined }) {
  const rows = useFieldArray({ control, name: 'uoms' });
  const [stockUom, uoms] = useWatch({ control, name: ['stock_uom', 'uoms'] });
  const name = (id: string | undefined) => records.uoms.find((uom) => uom.id === id)?.uom_name;

  return (
    <>
      <SectionHeading title="Units of Measure" hint="Other units it sells in, and how many stock units make one of each" />
      <RepeatableList
        fields={rows.fields}
        editable={!disabled}
        empty="No other units: it is sold in its stock unit."
        addLabel="Add UOM"
        onAdd={() => rows.append({ uom_id: '', conversion_factor: '' })}
        onRemove={rows.remove}
      >
        {(index) => (
          <FieldGrid>
            <ControlledSelect control={control} name={`uoms.${index}.uom_id`} label="UOM" required title="UOM" options={uomOptions(records.uoms, uoms[index]?.uom_id)} disabled={disabled} />
            <ControlledText
              control={control}
              name={`uoms.${index}.conversion_factor`}
              label="Conversion Factor"
              required
              hint={`${name(stockUom) ?? 'Stock units'} in one ${name(uoms[index]?.uom_id) ?? 'of it'}`}
              placeholder="e.g. 12"
              keyboardType="decimal-pad"
              maxLength={14}
              disabled={disabled}
            />
          </FieldGrid>
        )}
      </RepeatableList>
      <FieldGrid>
        <ControlledSelect
          control={control}
          name="sales_uom"
          label="Default Sales Unit of Measure"
          hint="The unit a sale starts in"
          title="Default Sales Unit of Measure"
          options={[
            { value: '', label: 'The stock unit', hint: name(stockUom) ?? name(savedUom) },
            ...uoms.filter((row) => row.uom_id && row.uom_id !== stockUom).map((row) => ({ value: row.uom_id, label: name(row.uom_id) ?? '' })),
          ]}
          disabled={disabled}
        />
      </FieldGrid>
    </>
  );
}

/** Its Item Tax rows (docs.frappe.io/erpnext/item 3.16). */
function Taxes({ control, records, disabled }: SectionProps) {
  const rows = useFieldArray({ control, name: 'taxes' });
  const taxes = useWatch({ control, name: 'taxes' });

  return (
    <>
      <SectionHeading title="Item Tax" hint="The Item Tax Template it takes; these rows come before its item group's" />
      <RepeatableList
        fields={rows.fields}
        editable={!disabled}
        empty="No item taxes: it is taxed as its item group and the sale's template say."
        addLabel="Add Item Tax"
        onAdd={() => rows.append({ item_tax_template_id: '', tax_category_id: '', valid_from: '' })}
        onRemove={rows.remove}
      >
        {(index) => (
          <FieldGrid>
            <ItemTaxFields
              control={control}
              names={{ template: `taxes.${index}.item_tax_template_id`, category: `taxes.${index}.tax_category_id`, validFrom: `taxes.${index}.valid_from` }}
              row={taxes[index] ?? { item_tax_template_id: '', tax_category_id: '' }}
              records={records.tax}
              disabled={disabled}
            />
          </FieldGrid>
        )}
      </RepeatableList>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
