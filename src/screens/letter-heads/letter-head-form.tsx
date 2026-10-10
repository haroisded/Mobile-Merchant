import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { closesForm, useConfirm } from '../../components/confirm-dialog';
import { ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { useDeleteLetterHeadMutation, useLetterHeadsQuery, useSaveLetterHeadMutation } from '../../features/letter-heads/queries';
import type { LetterHead } from '../../features/letter-heads/queries';
import { letterHeadSchema } from '../../features/letter-heads/schema';
import type { LetterHeadValues } from '../../features/letter-heads/schema';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';

type Props = { merchantId: string; letterHeadId?: string; onDismiss: () => void };

/** Create a letter head or edit one — the body of src/app/(app)/forms/letter-head.tsx (page narrow, Dialog wide). */
export function LetterHeadForm({ merchantId, letterHeadId, onDismiss }: Props) {
  // The list this form was opened from fetched the same key, so this is a cache hit.
  const heads = useLetterHeadsQuery({ merchantId }).data;
  if (!heads) return null;
  const existing = letterHeadId ? heads.find((head) => head.id === letterHeadId) : undefined;

  return <Form merchantId={merchantId} existing={existing} onDismiss={onDismiss} />;
}

const defaults = (existing: LetterHead | undefined): LetterHeadValues => ({
  letter_head_name: existing?.letter_head_name ?? '',
  content: existing?.content ?? '',
  footer: existing?.footer ?? '',
  is_default: existing?.is_default ?? false,
  disabled: existing?.disabled ?? false,
});

const saveFailure = (error: Error | null) =>
  postgrestError(error)?.code === '23505' ? 'There is already a letter head with this name.' : failureMessage("Couldn't save this letter head. Try again.");

function Form({ merchantId, existing, onDismiss }: { merchantId: string; existing: LetterHead | undefined; onDismiss: () => void }) {
  const wide = useShellWide();
  const save = useSaveLetterHeadMutation({ merchantId, letterHeadId: existing?.id });
  const remove = useDeleteLetterHeadMutation();
  const confirm = useConfirm();
  const deletable = can(usePermissions({ merchantId }).data, 'Letter Head', 'delete');
  const notice = mutationNotice(save, saveFailure(save.error));

  const { control, handleSubmit } = useForm<LetterHeadValues>({
    resolver: zodResolver(letterHeadSchema),
    defaultValues: defaults(existing),
    mode: 'onTouched',
  });

  const submit = handleSubmit(saveOnce(save, onDismiss));

  const askDelete = (head: LetterHead) =>
    confirm.ask({
      title: `Delete ${head.letter_head_name}?`,
      body: 'Receipts stop printing it. Disable it instead to keep it for later.',
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(head.id),
      failure: () => failureMessage("Couldn't delete this letter head. Try again."),
      onDone: closesForm(wide, onDismiss),
    });

  return (
    <>
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        dismissable={!(save.isPending && !save.isPaused)}
        kicker="Letter Head"
        title={existing?.letter_head_name ?? 'New letter head'}
        notice={notice}
        actions={
          <FormActions mutation={save} onCancel={onDismiss} onSave={submit} onDelete={existing && deletable ? () => askDelete(existing) : undefined} />
        }
      >
        <FieldGrid>
          <ControlledText control={control} name="letter_head_name" label="Name" required span="full" placeholder="e.g. Main Branch" maxLength={140} />
          {/* docs.frappe.io/erpnext/letter-head: "your organization's name, logo, address, etc" — text here; the logo arrives with printing. */}
          <ControlledText
            control={control}
            name="content"
            label="Header"
            hint="Name, address, tax ID: one per line"
            span="full"
            multiline
            placeholder="e.g. Corner Cafe"
            maxLength={1000}
          />
          <ControlledText control={control} name="footer" label="Footer" hint="Printed at the foot" span="full" multiline maxLength={500} />
          <ControlledSwitch
            control={control}
            name="is_default"
            label="Default Letter Head"
            on="Printed when Print Settings prints with a letter head"
            off="Not the default"
            deps={['disabled']}
          />
          <ControlledSwitch control={control} name="disabled" label="Disabled" on="Not printed" off="In use" deps={['is_default']} />
        </FieldGrid>
      </AdaptiveDialog>
      {confirm.dialog}
    </>
  );
}
