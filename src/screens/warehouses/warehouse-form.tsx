import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { closesForm, useConfirm } from '../../components/confirm-dialog';
import { treeFailure, treePlacement } from '../../components/folder-nav';
import { ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { ControlledSelect } from '../../components/search-select';
import { accountLabel, ledgerOptions, useAccountsQuery } from '../../features/accounts/queries';
import type { Account } from '../../features/accounts/queries';
import { useMerchantsQuery } from '../../features/merchants/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { inventoryAccount, useDeleteWarehouseMutation, useSaveWarehouseMutation, useWarehousesQuery, warehouseLabel } from '../../features/warehouses/queries';
import type { Warehouse } from '../../features/warehouses/queries';
import { warehouseSchema } from '../../features/warehouses/schema';
import type { WarehouseValues } from '../../features/warehouses/schema';
import { useShellWide } from '../../lib/columns';
import { mutationNotice } from '../../lib/errors';

type Props = { merchantId: string; warehouseId?: string; parentId?: string; onDismiss: () => void };

/** Add a warehouse under a group, or edit one — the body of src/app/(app)/forms/warehouse.tsx. */
export function WarehouseForm({ merchantId, warehouseId, parentId, onDismiss }: Props) {
  // The tree and the system this form was opened from fetched the same keys, so these are cache hits.
  const warehouses = useWarehousesQuery({ merchantId }).data;
  const accounts = useAccountsQuery({ merchantId }).data;
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === merchantId);
  if (!warehouses || !accounts || !merchant) return null;
  const existing = warehouseId ? warehouses.find((warehouse) => warehouse.id === warehouseId) : undefined;

  return <Form merchant={merchant} warehouses={warehouses} accounts={accounts} existing={existing} parentId={parentId} onDismiss={onDismiss} />;
}

const defaults = (existing: Warehouse | undefined, parentId: string | undefined): WarehouseValues => ({
  warehouse_name: existing?.warehouse_name ?? '',
  parent_id: existing?.parent_id ?? parentId ?? '',
  is_group: existing?.is_group ?? false,
  account: existing?.account ?? '',
  disabled: existing?.disabled ?? false,
});

type FormProps = {
  merchant: Merchant;
  warehouses: Warehouse[];
  accounts: Account[];
  existing: Warehouse | undefined;
  parentId?: string;
  onDismiss: () => void;
};

function Form({ merchant, warehouses, accounts, existing, parentId, onDismiss }: FormProps) {
  const wide = useShellWide();
  const save = useSaveWarehouseMutation({ merchantId: merchant.id, warehouseId: existing?.id });
  const remove = useDeleteWarehouseMutation();
  const confirm = useConfirm();
  const label = (warehouse: Warehouse) => warehouseLabel(warehouse, merchant.abbr);
  // All Warehouses keeps its place: it is where New Warehouse starts, so the form offers no Delete for it.
  const deletable = existing?.parent_id && can(usePermissions({ merchantId: merchant.id }).data, 'Warehouse', 'delete');
  const notice = mutationNotice(save, treeFailure(save.error, "Couldn't save this warehouse. Try again."));

  const { control, handleSubmit } = useForm<WarehouseValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: defaults(existing, parentId),
    mode: 'onTouched',
  });

  const submit = handleSubmit(saveOnce(save, onDismiss));

  const askDelete = (warehouse: Warehouse) =>
    confirm.ask({
      title: `Delete ${label(warehouse)}?`,
      body: 'It leaves the Warehouses. One with warehouses under it, or one a brand uses, cannot be deleted — disable it instead.',
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(warehouse.id),
      failure: (cause) => treeFailure(cause, "Couldn't delete this warehouse. Try again."),
      onDone: closesForm(wide, onDismiss),
    });

  return (
    <>
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        dismissable={!(save.isPending && !save.isPaused)}
        kicker="Warehouse"
        title={existing ? label(existing) : 'New warehouse'}
        notice={notice}
        actions={<FormActions mutation={save} onCancel={onDismiss} onSave={submit} onDelete={existing && deletable ? () => askDelete(existing) : undefined} />}
      >
        <WarehouseFields control={control} merchant={merchant} warehouses={warehouses} accounts={accounts} existing={existing} label={label} />
      </AdaptiveDialog>
      {confirm.dialog}
    </>
  );
}

type FieldsProps = {
  control: Control<WarehouseValues>;
  merchant: Merchant;
  warehouses: Warehouse[];
  accounts: Account[];
  existing: Warehouse | undefined;
  label: (warehouse: Warehouse) => string;
};

function WarehouseFields({ control, merchant, warehouses, accounts, existing, label }: FieldsProps) {
  const { root, hasChildren, parents } = treePlacement(warehouses, existing, (warehouse) => ({ value: warehouse.id, label: label(warehouse) }));
  const parent = useWatch({ control, name: 'parent_id' });
  const account = useWatch({ control, name: 'account' });
  // What an empty Account falls back to: the parent's, up the tree, then the Company's (docs 4.3).
  const fallback = parent ? inventoryAccount(warehouses, parent, merchant.default_inventory_account) : null;
  const fallbackAccount = accounts.find((candidate) => candidate.id === (fallback?.account ?? merchant.default_inventory_account));

  return (
    <FieldGrid>
      <ControlledText control={control} name="warehouse_name" label="Warehouse Name" required span="full" placeholder="e.g. Back Room" maxLength={140} />
      {/* All Warehouses: no parent to pick, always a group, never disabled. */}
      {root ? null : (
        <ControlledSelect control={control} name="parent_id" label="Parent Warehouse" required title="Parent Warehouse" options={parents} />
      )}
      <ControlledSelect
        control={control}
        name="account"
        label="Account"
        hint={account ? 'Stock ledger' : `Empty: uses ${fallbackAccount ? accountLabel(fallbackAccount, merchant.abbr) : 'none'}`}
        title="Account"
        options={ledgerOptions(accounts, merchant.abbr, (candidate) => candidate.account_type === 'Stock', account)}
      />
      {root ? null : (
        <>
          <ControlledSwitch
            control={control}
            name="is_group"
            label="Is Group"
            span="full"
            on="A group: other warehouses sit under it"
            off="A place stock is kept and sold from"
            hint={hasChildren ? 'Has warehouses under it, so it stays a group' : undefined}
            disabled={hasChildren}
          />
          {existing ? <ControlledSwitch control={control} name="disabled" label="Disabled" span="full" on="Hidden from new entries" off="In use" /> : null}
        </>
      )}
    </FieldGrid>
  );
}
