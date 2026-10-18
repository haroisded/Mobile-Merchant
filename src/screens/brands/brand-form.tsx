import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { closesForm, useConfirm } from '../../components/confirm-dialog';
import { ControlledText, FieldGrid } from '../../components/form-fields';
import { ControlledSelect } from '../../components/search-select';
import { ledgerOptions, useAccountsQuery } from '../../features/accounts/queries';
import type { Account } from '../../features/accounts/queries';
import { useBrandsQuery, useDeleteBrandMutation, useSaveBrandMutation } from '../../features/brands/queries';
import type { Brand } from '../../features/brands/queries';
import { brandSchema } from '../../features/brands/schema';
import type { BrandValues } from '../../features/brands/schema';
import { priceListOptions, usePriceListsQuery } from '../../features/price-lists/queries';
import type { PriceList } from '../../features/price-lists/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useWarehousesQuery, warehouseOptions } from '../../features/warehouses/queries';
import type { Warehouse } from '../../features/warehouses/queries';
import { useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice, postgrestError, usedElsewhere } from '../../lib/errors';

type Props = { merchantId: string; brandId?: string; onDismiss: () => void };

/** Create a brand or edit one — the body of src/app/(app)/forms/brand.tsx (page narrow, Dialog wide). */
export function BrandForm({ merchantId, brandId, onDismiss }: Props) {
  // Every member may select these (All's Select on each), so a Brand editor can pick from them.
  const brands = useBrandsQuery({ merchantId }).data;
  const warehouses = useWarehousesQuery({ merchantId }).data;
  const priceLists = usePriceListsQuery({ merchantId }).data;
  const accounts = useAccountsQuery({ merchantId }).data;
  if (!brands || !warehouses || !priceLists || !accounts) return null;
  const existing = brandId ? brands.find((brand) => brand.id === brandId) : undefined;

  return <Form merchantId={merchantId} options={{ warehouses, priceLists, accounts }} existing={existing} onDismiss={onDismiss} />;
}

const defaults = (existing: Brand | undefined): BrandValues => ({
  brand: existing?.brand ?? '',
  description: existing?.description ?? '',
  default_warehouse: existing?.default_warehouse ?? '',
  default_price_list: existing?.default_price_list ?? '',
  income_account: existing?.income_account ?? '',
});

const saveFailure = (error: Error | null) => {
  const cause = postgrestError(error);
  if (cause?.code === '23505') return 'There is already a brand with this name.';
  if (cause?.message === 'default_invalid') return "One of the defaults can't be used any more — pick it again.";
  return failureMessage("Couldn't save this brand. Try again.");
};

type Options = { warehouses: Warehouse[]; priceLists: PriceList[]; accounts: Account[] };

type FormProps = { merchantId: string; options: Options; existing: Brand | undefined; onDismiss: () => void };

function Form({ merchantId, options, existing, onDismiss }: FormProps) {
  const wide = useShellWide();
  const save = useSaveBrandMutation({ merchantId, brandId: existing?.id });
  const remove = useDeleteBrandMutation();
  const confirm = useConfirm();
  const deletable = can(usePermissions({ merchantId }).data, 'Brand', 'delete');
  const notice = mutationNotice(save, saveFailure(save.error));

  const { control, handleSubmit } = useForm<BrandValues>({
    resolver: zodResolver(brandSchema),
    defaultValues: defaults(existing),
    mode: 'onTouched',
  });

  const submit = handleSubmit(saveOnce(save, onDismiss));

  const askDelete = (brand: Brand) =>
    confirm.ask({
      title: `Delete ${brand.brand}?`,
      body: 'It leaves the list of brands, with its defaults.',
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(brand.id),
      // An item may name it now (items_brand_fk, 23503).
      failure: (cause) => usedElsewhere(cause) ?? failureMessage("Couldn't delete this brand. Try again."),
      onDone: closesForm(wide, onDismiss),
    });

  return (
    <>
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        dismissable={!(save.isPending && !save.isPaused)}
        kicker="Brand"
        title={existing?.brand ?? 'New brand'}
        notice={notice}
        actions={<FormActions mutation={save} onCancel={onDismiss} onSave={submit} onDelete={existing && deletable ? () => askDelete(existing) : undefined} />}
      >
        <FieldGrid>
          <ControlledText control={control} name="brand" label="Brand Name" required span="full" placeholder="e.g. Nestlé" maxLength={140} />
          <ControlledText control={control} name="description" label="Description" span="full" placeholder="e.g. Coffee and creamers" maxLength={1000} />
          {/* docs.frappe.io/erpnext/brand 2.1: what an item of this brand takes when it is sold. */}
          <ControlledSelect
            control={control}
            name="default_warehouse"
            label="Default Warehouse"
            hint="Where its items are sold from"
            title="Default Warehouse"
            options={warehouseOptions(options.warehouses, existing?.default_warehouse)}
          />
          <ControlledSelect
            control={control}
            name="default_price_list"
            label="Default Price List"
            title="Default Price List"
            options={priceListOptions(options.priceLists, existing?.default_price_list)}
          />
          <ControlledSelect
            control={control}
            name="income_account"
            label="Default Income Account"
            hint="An Income ledger"
            title="Default Income Account"
            options={ledgerOptions(options.accounts, (account) => account.root_type === 'Income', existing?.income_account)}
          />
        </FieldGrid>
      </AdaptiveDialog>
      {confirm.dialog}
    </>
  );
}
