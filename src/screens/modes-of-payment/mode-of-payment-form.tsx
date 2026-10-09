import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { closesForm, useConfirm } from '../../components/confirm-dialog';
import { ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { NoteCallout } from '../../components/note-callout';
import { ControlledSelect } from '../../components/search-select';
import { ledgerOptions, useAccountsQuery } from '../../features/accounts/queries';
import type { Account } from '../../features/accounts/queries';
import { useMerchantsQuery } from '../../features/merchants/queries';
import { useDeleteModeOfPaymentMutation, useModesOfPaymentQuery, useSaveModeOfPaymentMutation } from '../../features/modes-of-payment/queries';
import type { ModeOfPayment } from '../../features/modes-of-payment/queries';
import { fitsPaymentType, modeOfPaymentSchema, PAYMENT_TYPES } from '../../features/modes-of-payment/schema';
import type { ModeOfPaymentValues, PaymentType } from '../../features/modes-of-payment/schema';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';

type Props = { merchantId: string; modeId?: string; onDismiss: () => void };

/** Create a mode of payment or edit one — the body of src/app/(app)/forms/mode-of-payment.tsx (page narrow, Dialog wide). */
export function ModeOfPaymentForm({ merchantId, modeId, onDismiss }: Props) {
  // The list this form was opened from fetched the same keys, so these are cache hits.
  const modes = useModesOfPaymentQuery({ merchantId }).data;
  const accounts = useAccountsQuery({ merchantId }).data;
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === merchantId);
  if (!modes || !accounts || !merchant) return null;
  const existing = modeId ? modes.find((mode) => mode.id === modeId) : undefined;

  return <Form merchantId={merchantId} abbr={merchant.abbr} accounts={accounts} existing={existing} onDismiss={onDismiss} />;
}

const TYPE_OPTIONS: { value: PaymentType; label: string; hint: string }[] = [
  { value: 'Cash', label: 'Cash', hint: 'Notes and coins: a Cash ledger' },
  { value: 'Bank', label: 'Bank', hint: 'Card, transfer, cheque: a Bank ledger' },
  { value: 'General', label: 'General', hint: 'Anything else: a Cash or Bank ledger' },
  { value: 'Phone', label: 'Phone', hint: 'Mobile wallets: a Cash or Bank ledger' },
];

const ACCOUNT_HINTS = { Cash: 'Cash ledger', Bank: 'Bank ledger', General: 'Cash or Bank ledger', Phone: 'Cash or Bank ledger' } satisfies Record<PaymentType, string>;

const asPaymentType = (type: string): PaymentType => PAYMENT_TYPES.find((candidate) => candidate === type) ?? 'General';

/** Whether the picked account still fits after the type changes (private.validate_mode_of_payment_account). */
const stillFits = (accounts: Account[], accountId: string, type: string) => {
  const account = accounts.find((candidate) => candidate.id === accountId);
  return !account || fitsPaymentType(type)(account);
};

const defaults = (existing: ModeOfPayment | undefined): ModeOfPaymentValues => ({
  mode_of_payment: existing?.mode_of_payment ?? '',
  type: asPaymentType(existing?.type ?? 'Cash'),
  default_account: existing?.default_account ?? '',
  enabled: existing?.enabled ?? true,
});

const saveFailure = (error: Error | null) => {
  const cause = postgrestError(error);
  if (cause?.code === '23505') return 'There is already a mode of payment with this name.';
  if (cause?.message === 'mode_account_invalid') return "That account can't be used for this type any more — pick it again.";
  return failureMessage("Couldn't save this mode of payment. Try again.");
};

type FormProps = { merchantId: string; abbr: string; accounts: Account[]; existing: ModeOfPayment | undefined; onDismiss: () => void };

function Form({ merchantId, abbr, accounts, existing, onDismiss }: FormProps) {
  const wide = useShellWide();
  const save = useSaveModeOfPaymentMutation({ merchantId, modeId: existing?.id });
  const remove = useDeleteModeOfPaymentMutation();
  const confirm = useConfirm();
  const deletable = can(usePermissions({ merchantId }).data, 'Mode of Payment', 'delete');
  const notice = mutationNotice(save, saveFailure(save.error));

  const { control, handleSubmit, getValues, setValue } = useForm<ModeOfPaymentValues>({
    resolver: zodResolver(modeOfPaymentSchema),
    defaultValues: defaults(existing),
    mode: 'onTouched',
  });
  const type = useWatch({ control, name: 'type' });
  // Kept listed only while it is still the value: once a type change clears it, it drops out.
  const account = useWatch({ control, name: 'default_account' });

  const submit = handleSubmit(saveOnce(save, onDismiss));

  // A new type keeps the account only when it still fits.
  const onTypePicked = (picked: string) => {
    if (!stillFits(accounts, getValues('default_account'), picked)) setValue('default_account', '', { shouldDirty: true });
  };

  const askDelete = (mode: ModeOfPayment) =>
    confirm.ask({
      title: `Delete ${mode.mode_of_payment}?`,
      body: 'It leaves the list of ways a sale can be paid. Disable it instead to keep it for later.',
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(mode.id),
      failure: () => failureMessage("Couldn't delete this mode of payment. Try again."),
      onDone: closesForm(wide, onDismiss),
    });

  return (
    <>
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        dismissable={!(save.isPending && !save.isPaused)}
        kicker="Mode of Payment"
        title={existing?.mode_of_payment ?? 'New mode of payment'}
        notice={notice}
        actions={
          <FormActions mutation={save} onCancel={onDismiss} onSave={submit} onDelete={existing && deletable ? () => askDelete(existing) : undefined} />
        }
      >
        {/* docs.frappe.io/erpnext/bank-accounts-and-modes-of-payment: the type names the method, the account the ledger. */}
        <NoteCallout>
          The type says how the money arrives. The default account is the ledger it is recorded in — calling a mode Cash does not make its
          account a cash account.
        </NoteCallout>
        <FieldGrid>
          <ControlledText control={control} name="mode_of_payment" label="Name" required span="full" placeholder="e.g. GCash" maxLength={140} />
          <ControlledSelect control={control} name="type" label="Type" required title="Type" options={TYPE_OPTIONS} onPicked={onTypePicked} />
          <ControlledSelect
            control={control}
            name="default_account"
            label="Default Account"
            hint={ACCOUNT_HINTS[type]}
            title="Default Account"
            options={ledgerOptions(accounts, abbr, fitsPaymentType(type), account)}
          />
          <ControlledSwitch control={control} name="enabled" label="Enabled" span="full" on="Can be chosen at checkout" off="Hidden from new sales" />
        </FieldGrid>
      </AdaptiveDialog>
      {confirm.dialog}
    </>
  );
}
