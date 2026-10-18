import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { closesForm, useConfirm } from '../../components/confirm-dialog';
import { treeFailure, treePlacement } from '../../components/folder-nav';
import { ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { ControlledSelect } from '../../components/search-select';
import { accountLabel, useAccountsQuery, useDeleteAccountMutation, useSaveAccountMutation } from '../../features/accounts/queries';
import type { Account } from '../../features/accounts/queries';
import { ACCOUNT_TYPES, accountSchema } from '../../features/accounts/schema';
import type { AccountValues } from '../../features/accounts/schema';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useShellWide } from '../../lib/columns';
import { mutationNotice } from '../../lib/errors';

type Props = { merchantId: string; accountId?: string; parentId?: string; onDismiss: () => void };

/** Add an account under a group, or edit one — the body of src/app/(app)/forms/account.tsx (page narrow, Dialog wide). */
export function AccountForm({ merchantId, accountId, parentId, onDismiss }: Props) {
  // The tree this form was opened from fetched the same key, so it is a cache hit.
  const accounts = useAccountsQuery({ merchantId }).data;
  if (!accounts) return null;
  const existing = accountId ? accounts.find((account) => account.id === accountId) : undefined;

  return <Form merchantId={merchantId} accounts={accounts} existing={existing} parentId={parentId} onDismiss={onDismiss} />;
}

const defaults = (existing: Account | undefined, parent: Account | undefined): AccountValues => ({
  account_name: existing?.account_name ?? '',
  account_number: existing?.account_number ?? '',
  parent_id: existing?.parent_id ?? parent?.id ?? '',
  root_type: existing?.root_type ?? parent?.root_type ?? '',
  is_group: existing?.is_group ?? false,
  account_type: existing?.account_type ?? '',
  disabled: existing?.disabled ?? false,
});

type FormProps = { merchantId: string; accounts: Account[]; existing: Account | undefined; parentId?: string; onDismiss: () => void };

function Form({ merchantId, accounts, existing, parentId, onDismiss }: FormProps) {
  const wide = useShellWide();
  const save = useSaveAccountMutation({ merchantId, accountId: existing?.id });
  const remove = useDeleteAccountMutation();
  const confirm = useConfirm();
  const label = accountLabel;
  const parent = accounts.find((account) => account.id === parentId);
  // A root stays: there is no way to add one back.
  const deletable = existing?.parent_id && can(usePermissions({ merchantId }).data, 'Account', 'delete');
  const notice = mutationNotice(save, treeFailure(save.error, "Couldn't save this account. Try again."));

  const { control, handleSubmit } = useForm<AccountValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: defaults(existing, parent),
    mode: 'onTouched',
  });

  const submit = handleSubmit(saveOnce(save, onDismiss));

  const askDelete = (account: Account) =>
    confirm.ask({
      title: `Delete ${label(account)}?`,
      body: 'It leaves the Chart of Accounts. An account with accounts under it, or one already used, cannot be deleted — disable it instead.',
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(account.id),
      failure: (cause) => treeFailure(cause, "Couldn't delete this account. Try again."),
      onDone: closesForm(wide, onDismiss),
    });

  return (
    <>
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        dismissable={!(save.isPending && !save.isPaused)}
        // The root type, as the folder page above it shows: an account takes its parent's.
        kicker={existing?.root_type ?? parent?.root_type ?? 'Account'}
        title={existing ? label(existing) : 'New account'}
        notice={notice}
        actions={<FormActions mutation={save} onCancel={onDismiss} onSave={submit} onDelete={existing && deletable ? () => askDelete(existing) : undefined} />}
      >
        <AccountFields control={control} accounts={accounts} existing={existing} label={label} />
      </AdaptiveDialog>
      {confirm.dialog}
    </>
  );
}

type FieldsProps = { control: Control<AccountValues>; accounts: Account[]; existing: Account | undefined; label: (account: Account) => string };

function AccountFields({ control, accounts, existing, label }: FieldsProps) {
  // The hint names each group's root type: an account takes its parent's (private.validate_tree).
  const { root, hasChildren, parents } = treePlacement(accounts, existing, (account) => ({ value: account.id, label: label(account), hint: account.root_type }));
  const pickedParent = useWatch({ control, name: 'parent_id' });
  // A root has no parent: its own root type.
  const rootType = accounts.find((account) => account.id === pickedParent)?.root_type ?? existing?.root_type ?? '';
  const types = [{ value: '', label: 'None' }, ...(ACCOUNT_TYPES.get(rootType) ?? []).map((type) => ({ value: type, label: type }))];

  return (
    <FieldGrid>
      <ControlledText control={control} name="account_name" label="Account Name" required span="full" placeholder="e.g. Petty Cash" maxLength={140} />
      <ControlledText control={control} name="account_number" label="Account Number" hint="Shown before the name" placeholder="e.g. 1110" maxLength={20} />
      <ControlledSelect control={control} name="account_type" label="Account Type" hint={`For ${rootType || 'this root type'}`} title="Account Type" options={types} />
      {/* A root: no parent to pick, always a group. */}
      {root ? null : (
        <>
          <ControlledSelect control={control} name="parent_id" label="Parent Account" required title="Parent Account" span="full" options={parents} />
          <ControlledSwitch
            control={control}
            name="is_group"
            label="Is Group"
            span="full"
            on="A group: other accounts sit under it"
            off="A ledger: sales and stock post to it"
            hint={hasChildren ? 'Has accounts under it, so it stays a group' : undefined}
            disabled={hasChildren}
          />
        </>
      )}
      {existing ? <ControlledSwitch control={control} name="disabled" label="Disabled" span="full" on="Hidden from new entries" off="In use" /> : null}
    </FieldGrid>
  );
}
