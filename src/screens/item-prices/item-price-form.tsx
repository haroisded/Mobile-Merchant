import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { closesForm, useConfirm } from '../../components/confirm-dialog';
import { ControlledDate, ControlledText, FieldGrid } from '../../components/form-fields';
import { ControlledSelect } from '../../components/search-select';
import { useDeleteItemPriceMutation, useItemPricesQuery, useSaveItemPriceMutation } from '../../features/item-prices/queries';
import type { ItemPrice } from '../../features/item-prices/queries';
import { itemPriceSchema } from '../../features/item-prices/schema';
import type { ItemPriceValues } from '../../features/item-prices/schema';
import { itemLabel, useItemsQuery } from '../../features/items/queries';
import type { Item } from '../../features/items/queries';
import { usePriceListsQuery } from '../../features/price-lists/queries';
import type { PriceList } from '../../features/price-lists/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useSellingSettingsQuery } from '../../features/selling-settings/queries';
import { useUomsQuery } from '../../features/uoms/queries';
import type { Uom } from '../../features/uoms/queries';
import { useShellWide } from '../../lib/columns';
import { todayDate } from '../../lib/dates';
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';

type Props = { merchantId: string; priceId?: string; onDismiss: () => void };

/** Create an item price or edit one — the body of src/app/(app)/forms/item-price.tsx (page narrow, Dialog wide). */
export function ItemPriceForm({ merchantId, priceId, onDismiss }: Props) {
  const prices = useItemPricesQuery({ merchantId }).data;
  const items = useItemsQuery({ merchantId }).data;
  const priceLists = usePriceListsQuery({ merchantId }).data;
  const uoms = useUomsQuery({ merchantId }).data;
  const sellingSettings = useSellingSettingsQuery({ merchantId }).data;
  if (!prices || !items || !priceLists || !uoms || !sellingSettings) return null;
  const existing = priceId ? prices.find((price) => price.id === priceId) : undefined;

  return (
    <Form
      merchantId={merchantId}
      options={{ items, priceLists, uoms }}
      // A new price starts in the list sales start on, while that list is still enabled.
      startingList={priceLists.find((priceList) => priceList.id === sellingSettings.default_price_list && priceList.enabled)?.id ?? ''}
      existing={existing}
      onDismiss={onDismiss}
    />
  );
}

// "Valid from is set to the date you created the Item Price" (docs.frappe.io/erpnext/item-price 2.6).
const defaults = (existing: ItemPrice | undefined, startingList: string): ItemPriceValues => ({
  item_id: existing?.item_id ?? '',
  price_list_id: existing?.price_list_id ?? startingList,
  uom_id: existing?.uom_id ?? '',
  price_list_rate: existing ? String(existing.price_list_rate) : '',
  valid_from: existing ? (existing.valid_from ?? '') : todayDate(),
  valid_upto: existing?.valid_upto ?? '',
});

// Each refusal the database names (supabase/migrations/20261011134357_item_prices.sql).
const REFUSALS = new Map([
  ['price_list_disabled', "That price list is disabled and can't take a price — pick another."],
  ['uom_not_on_item', "That unit is not one of the item's. Pick its stock unit, or add the unit to the item first."],
]);

const saveFailure = (error: Error | null) => {
  const cause = postgrestError(error);
  if (cause?.code === '23505') return 'This item already has a price in that price list and unit for these dates. Open it to change its rate.';
  return REFUSALS.get(cause?.message ?? '') ?? failureMessage("Couldn't save this price. Try again.");
};

type Options = { items: Item[]; priceLists: PriceList[]; uoms: Uom[] };

type FormProps = { merchantId: string; options: Options; startingList: string; existing: ItemPrice | undefined; onDismiss: () => void };

function Form({ merchantId, options, startingList, existing, onDismiss }: FormProps) {
  const wide = useShellWide();
  const save = useSaveItemPriceMutation({ merchantId, priceId: existing?.id });
  const remove = useDeleteItemPriceMutation();
  const confirm = useConfirm();
  const deletable = can(usePermissions({ merchantId }).data, 'Item Price', 'delete');
  const notice = mutationNotice(save, saveFailure(save.error));

  const { control, handleSubmit, setValue } = useForm<ItemPriceValues>({
    resolver: zodResolver(itemPriceSchema),
    defaultValues: defaults(existing, startingList),
    mode: 'onTouched',
  });
  const itemId = useWatch({ control, name: 'item_id' });
  const item = options.items.find((candidate) => candidate.id === itemId);
  const uomName = (id: string) => options.uoms.find((uom) => uom.id === id)?.uom_name ?? '';
  // "A price is always specific to a certain UOM": the item's stock unit, or one from its UOMs table.
  const units = item ? [item.stock_uom, ...item.item_uoms.map((row) => row.uom_id)] : [];

  const submit = handleSubmit(saveOnce(save, onDismiss));

  const askDelete = (price: ItemPrice) =>
    confirm.ask({
      title: 'Delete this price?',
      body: `${item ? itemLabel(item) : 'The item'} then has no rate in this price list for ${uomName(price.uom_id) || 'this unit'} on these dates.`,
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(price.id),
      failure: () => failureMessage("Couldn't delete this price. Try again."),
      onDone: closesForm(wide, onDismiss),
    });

  return (
    <>
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        dismissable={!(save.isPending && !save.isPaused)}
        kicker="Item Price"
        title={existing && item ? itemLabel(item) : 'New item price'}
        notice={notice}
        actions={<FormActions mutation={save} onCancel={onDismiss} onSave={submit} onDelete={existing && deletable ? () => askDelete(existing) : undefined} />}
      >
        <FieldGrid>
          <ControlledSelect
            control={control}
            name="item_id"
            label="Item"
            required
            span="full"
            title="Item"
            // Enabled items, plus the price's own once disabled.
            options={options.items.filter((candidate) => !candidate.disabled || candidate.id === existing?.item_id).map((candidate) => ({ value: candidate.id, label: itemLabel(candidate) }))}
            // The price starts in the item's own stock unit.
            onPicked={(picked) => setValue('uom_id', options.items.find((candidate) => candidate.id === picked)?.stock_uom ?? '', { shouldValidate: true })}
          />
          <ControlledSelect
            control={control}
            name="price_list_id"
            label="Price List"
            required
            title="Price List"
            options={options.priceLists
              .filter((priceList) => priceList.enabled || priceList.id === existing?.price_list_id)
              .map((priceList) => ({ value: priceList.id, label: priceList.price_list_name, hint: priceList.currency }))}
          />
          <ControlledSelect
            control={control}
            name="uom_id"
            label="UOM"
            required
            hint={item ? 'The unit this rate is for' : 'Pick the item first'}
            title="UOM"
            options={units.map((id) => ({ value: id, label: uomName(id) }))}
            disabled={!item}
          />
          <ControlledText control={control} name="price_list_rate" label="Rate" required placeholder="0.00" keyboardType="decimal-pad" maxLength={14} />
          <ControlledDate control={control} name="valid_from" label="Valid From" hint="Empty: from the start" clearable />
          <ControlledDate control={control} name="valid_upto" label="Valid Upto" hint="Empty: no end" clearable />
        </FieldGrid>
      </AdaptiveDialog>
      {confirm.dialog}
    </>
  );
}
