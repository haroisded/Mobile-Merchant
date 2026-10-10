import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { closesForm, useConfirm } from '../../components/confirm-dialog';
import { ControlledText, FieldGrid } from '../../components/form-fields';
import { ControlledSelect } from '../../components/search-select';
import { can, usePermissions } from '../../features/role-permissions/queries';
import {
  factorLabel,
  useDeleteUomConversionFactorMutation,
  useSaveUomConversionFactorMutation,
  useUomConversionFactorsQuery,
} from '../../features/uom-conversion-factors/queries';
import type { UomConversionFactor } from '../../features/uom-conversion-factors/queries';
import { uomConversionFactorSchema } from '../../features/uom-conversion-factors/schema';
import type { UomConversionFactorValues } from '../../features/uom-conversion-factors/schema';
import { uomOptions, useUomsQuery } from '../../features/uoms/queries';
import type { Uom } from '../../features/uoms/queries';
import { useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';

type Props = { merchantId: string; factorId?: string; onDismiss: () => void };

/** Create a conversion or edit one — the body of src/app/(app)/forms/uom-conversion-factor.tsx (page narrow, Dialog wide). */
export function UomConversionFactorForm({ merchantId, factorId, onDismiss }: Props) {
  // The list this form was opened from fetched the same keys, so these are cache hits.
  const factors = useUomConversionFactorsQuery({ merchantId }).data;
  const uoms = useUomsQuery({ merchantId }).data;
  if (!factors || !uoms) return null;
  const existing = factorId ? factors.find((factor) => factor.id === factorId) : undefined;

  return <Form merchantId={merchantId} uoms={uoms} existing={existing} onDismiss={onDismiss} />;
}

const defaults = (existing: UomConversionFactor | undefined): UomConversionFactorValues => ({
  from_uom: existing?.from_uom ?? '',
  to_uom: existing?.to_uom ?? '',
  value: existing ? String(existing.value) : '',
});

const saveFailure = (error: Error | null) =>
  postgrestError(error)?.code === '23505'
    ? 'These two units already have a conversion. Open it to change its value.'
    : failureMessage("Couldn't save this conversion. Try again.");

type FormProps = { merchantId: string; uoms: Uom[]; existing: UomConversionFactor | undefined; onDismiss: () => void };

function Form({ merchantId, uoms, existing, onDismiss }: FormProps) {
  const wide = useShellWide();
  const save = useSaveUomConversionFactorMutation({ merchantId, factorId: existing?.id });
  const remove = useDeleteUomConversionFactorMutation();
  const confirm = useConfirm();
  const deletable = can(usePermissions({ merchantId }).data, 'UOM Conversion Factor', 'delete');
  const notice = mutationNotice(save, saveFailure(save.error));

  const { control, handleSubmit } = useForm<UomConversionFactorValues>({
    resolver: zodResolver(uomConversionFactorSchema),
    defaultValues: defaults(existing),
    mode: 'onTouched',
  });

  const submit = handleSubmit(saveOnce(save, onDismiss));

  const askDelete = (factor: UomConversionFactor) =>
    confirm.ask({
      title: `Delete ${factorLabel(factor, uoms)}?`,
      body: 'Items will no longer convert between these two units.',
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(factor.id),
      failure: () => failureMessage("Couldn't delete this conversion. Try again."),
      onDone: closesForm(wide, onDismiss),
    });

  return (
    <>
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        dismissable={!(save.isPending && !save.isPaused)}
        kicker="UOM Conversion Factor"
        title={existing ? factorLabel(existing, uoms) : 'New conversion'}
        notice={notice}
        actions={<FormActions mutation={save} onCancel={onDismiss} onSave={submit} onDelete={existing && deletable ? () => askDelete(existing) : undefined} />}
      >
        {/* One From UOM is Value To UOMs: 1 Kg = 1000 Gram. */}
        <FieldGrid>
          <ControlledSelect control={control} name="from_uom" label="From UOM" required title="From UOM" options={uomOptions(uoms, existing?.from_uom)} />
          <ControlledSelect control={control} name="to_uom" label="To UOM" required title="To UOM" options={uomOptions(uoms, existing?.to_uom)} />
          <ControlledText
            control={control}
            name="value"
            label="Value"
            required
            span="full"
            hint="How many To UOMs make one From UOM"
            placeholder="e.g. 1000"
            keyboardType="decimal-pad"
            maxLength={20}
          />
        </FieldGrid>
      </AdaptiveDialog>
      {confirm.dialog}
    </>
  );
}
