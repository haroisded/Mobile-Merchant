import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { closesForm, useConfirm } from '../../components/confirm-dialog';
import { ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { ControlledSelect } from '../../components/search-select';
import { useCurrenciesQuery } from '../../features/currencies/queries';
import type { Currency } from '../../features/currencies/queries';
import { useMerchantsQuery } from '../../features/merchants/queries';
import { useDeletePriceListMutation, usePriceListsQuery, useSavePriceListMutation } from '../../features/price-lists/queries';
import type { PriceList } from '../../features/price-lists/queries';
import { priceListSchema } from '../../features/price-lists/schema';
import type { PriceListValues } from '../../features/price-lists/schema';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice, postgrestError, usedElsewhere } from '../../lib/errors';

type Props = { merchantId: string; priceListId?: string; onDismiss: () => void };

/** Create a price list or edit one — the body of src/app/(app)/forms/price-list.tsx (page narrow, Dialog wide). */
export function PriceListForm({ merchantId, priceListId, onDismiss }: Props) {
  // The list this form was opened from fetched its key, so that one is a cache hit.
  const priceLists = usePriceListsQuery({ merchantId }).data;
  const currencies = useCurrenciesQuery({ merchantId }).data;
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === merchantId);
  if (!priceLists || !currencies || !merchant) return null;
  const existing = priceListId ? priceLists.find((priceList) => priceList.id === priceListId) : undefined;

  return <Form merchantId={merchantId} baseCurrency={merchant.default_currency} currencies={currencies} existing={existing} onDismiss={onDismiss} />;
}

const defaults = (existing: PriceList | undefined, baseCurrency: string): PriceListValues => ({
  price_list_name: existing?.price_list_name ?? '',
  currency: existing?.currency ?? baseCurrency,
  enabled: existing?.enabled ?? true,
  price_not_uom_dependent: existing?.price_not_uom_dependent ?? false,
});

const saveFailure = (error: Error | null) =>
  postgrestError(error)?.code === '23505' ? 'There is already a price list with this name.' : failureMessage("Couldn't save this price list. Try again.");

// Selling Settings' or an item group's default, else a brand's (brands_price_list_fk).
const deleteFailure = (error: Error | null) =>
  usedElsewhere(error) ??
  (postgrestError(error)?.code === '23503'
    ? "It's a brand's default price list. Clear it on the brand first, or disable this one."
    : failureMessage("Couldn't delete this price list. Try again."));

type FormProps = { merchantId: string; baseCurrency: string; currencies: Currency[]; existing: PriceList | undefined; onDismiss: () => void };

function Form({ merchantId, baseCurrency, currencies, existing, onDismiss }: FormProps) {
  const wide = useShellWide();
  const save = useSavePriceListMutation({ merchantId, priceListId: existing?.id });
  const remove = useDeletePriceListMutation();
  const confirm = useConfirm();
  const deletable = can(usePermissions({ merchantId }).data, 'Price List', 'delete');
  const notice = mutationNotice(save, saveFailure(save.error));

  const { control, handleSubmit } = useForm<PriceListValues>({
    resolver: zodResolver(priceListSchema),
    defaultValues: defaults(existing, baseCurrency),
    mode: 'onTouched',
  });

  const submit = handleSubmit(saveOnce(save, onDismiss));

  const askDelete = (priceList: PriceList) =>
    confirm.ask({
      title: `Delete ${priceList.price_list_name}?`,
      body: 'It leaves the price lists. Disable it instead to keep it for later.',
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(priceList.id),
      failure: deleteFailure,
      onDone: closesForm(wide, onDismiss),
    });

  return (
    <>
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        dismissable={!(save.isPending && !save.isPaused)}
        kicker="Price List"
        title={existing?.price_list_name ?? 'New price list'}
        notice={notice}
        actions={<FormActions mutation={save} onCancel={onDismiss} onSave={submit} onDelete={existing && deletable ? () => askDelete(existing) : undefined} />}
      >
        <FieldGrid>
          <ControlledText control={control} name="price_list_name" label="Price List Name" required span="full" placeholder="e.g. Wholesale" maxLength={140} />
          <ControlledSelect
            control={control}
            name="currency"
            label="Currency"
            required
            title="Currency"
            options={currencies.map((currency) => ({ value: currency.code, label: currency.code, hint: currency.symbol ?? undefined }))}
          />
          <ControlledSwitch control={control} name="enabled" label="Enabled" span="full" on="Can be picked for a sale" off="Hidden from new sales" />
          {/* docs.frappe.io/erpnext/price-lists: the tomatoes example — 1 Box = 10 Kilos at 10 a Kilo prices a Box at 100. */}
          <ControlledSwitch
            control={control}
            name="price_not_uom_dependent"
            label="Price Not UOM Dependent"
            span="full"
            on="A price per unit also prices bigger units by their conversion"
            off="Each unit needs its own price"
          />
        </FieldGrid>
      </AdaptiveDialog>
      {confirm.dialog}
    </>
  );
}
