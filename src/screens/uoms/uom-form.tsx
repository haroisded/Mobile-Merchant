import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { closesForm, useConfirm } from '../../components/confirm-dialog';
import { ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useDeleteUomMutation, useSaveUomMutation, useUomsQuery } from '../../features/uoms/queries';
import type { Uom } from '../../features/uoms/queries';
import { uomSchema } from '../../features/uoms/schema';
import type { UomValues } from '../../features/uoms/schema';
import { useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice, postgrestError, usedElsewhere } from '../../lib/errors';

type Props = { merchantId: string; uomId?: string; onDismiss: () => void };

/** Create a unit or edit one — the body of src/app/(app)/forms/uom.tsx (page narrow, Dialog wide). */
export function UomForm({ merchantId, uomId, onDismiss }: Props) {
  // The list this form was opened from fetched the same key, so this is a cache hit.
  const uoms = useUomsQuery({ merchantId }).data;
  if (!uoms) return null;
  const existing = uomId ? uoms.find((uom) => uom.id === uomId) : undefined;

  return <Form merchantId={merchantId} existing={existing} onDismiss={onDismiss} />;
}

const defaults = (existing: Uom | undefined): UomValues => ({
  uom_name: existing?.uom_name ?? '',
  must_be_whole_number: existing?.must_be_whole_number ?? false,
  enabled: existing?.enabled ?? true,
});

const saveFailure = (error: Error | null) =>
  postgrestError(error)?.code === '23505' ? 'There is already a unit with this name.' : failureMessage("Couldn't save this unit. Try again.");

// Stock Settings' default unit, else a conversion (uom_conversion_factors_from_fk / _to_fk).
const deleteFailure = (error: Error | null) =>
  usedElsewhere(error) ??
  (postgrestError(error)?.code === '23503'
    ? 'A conversion uses this unit. Delete that conversion first, or disable the unit.'
    : failureMessage("Couldn't delete this unit. Try again."));

function Form({ merchantId, existing, onDismiss }: { merchantId: string; existing: Uom | undefined; onDismiss: () => void }) {
  const wide = useShellWide();
  const save = useSaveUomMutation({ merchantId, uomId: existing?.id });
  const remove = useDeleteUomMutation();
  const confirm = useConfirm();
  const deletable = can(usePermissions({ merchantId }).data, 'UOM', 'delete');
  const notice = mutationNotice(save, saveFailure(save.error));

  const { control, handleSubmit } = useForm<UomValues>({
    resolver: zodResolver(uomSchema),
    defaultValues: defaults(existing),
    mode: 'onTouched',
  });

  const submit = handleSubmit(saveOnce(save, onDismiss));

  const askDelete = (uom: Uom) =>
    confirm.ask({
      title: `Delete ${uom.uom_name}?`,
      body: 'It leaves the list of units. Disable it instead to keep it for later.',
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(uom.id),
      failure: deleteFailure,
      onDone: closesForm(wide, onDismiss),
    });

  return (
    <>
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        dismissable={!(save.isPending && !save.isPaused)}
        kicker="UOM"
        title={existing?.uom_name ?? 'New UOM'}
        notice={notice}
        actions={<FormActions mutation={save} onCancel={onDismiss} onSave={submit} onDelete={existing && deletable ? () => askDelete(existing) : undefined} />}
      >
        <FieldGrid>
          <ControlledText control={control} name="uom_name" label="UOM Name" required span="full" placeholder="e.g. Dozen" maxLength={140} />
          {/* docs "Managing Fractions in UOM": on, a quantity of 1.5 in this unit is refused. */}
          <ControlledSwitch
            control={control}
            name="must_be_whole_number"
            label="Must Be Whole Number"
            span="full"
            on="Only whole quantities: 1, 2, 3"
            off="Fractions allowed: 1.5, 0.25"
          />
          <ControlledSwitch control={control} name="enabled" label="Enabled" span="full" on="Can be picked for items" off="Hidden from new items" />
        </FieldGrid>
      </AdaptiveDialog>
      {confirm.dialog}
    </>
  );
}
