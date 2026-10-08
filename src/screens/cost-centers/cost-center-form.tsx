import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { Control } from 'react-hook-form';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { closesForm, useConfirm } from '../../components/confirm-dialog';
import { treeFailure, treePlacement } from '../../components/folder-nav';
import { ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { ControlledSelect } from '../../components/search-select';
import { costCenterLabel, useCostCentersQuery, useDeleteCostCenterMutation, useSaveCostCenterMutation } from '../../features/cost-centers/queries';
import type { CostCenter } from '../../features/cost-centers/queries';
import { costCenterSchema } from '../../features/cost-centers/schema';
import type { CostCenterValues } from '../../features/cost-centers/schema';
import { useMerchantsQuery } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useShellWide } from '../../lib/columns';
import { mutationNotice } from '../../lib/errors';

type Props = { merchantId: string; costCenterId?: string; parentId?: string; onDismiss: () => void };

/** Add a cost center under a group, or edit one — the body of src/app/(app)/forms/cost-center.tsx. */
export function CostCenterForm({ merchantId, costCenterId, parentId, onDismiss }: Props) {
  // The tree and the system this form was opened from fetched the same keys, so both are cache hits.
  const costCenters = useCostCentersQuery({ merchantId }).data;
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === merchantId);
  if (!costCenters || !merchant) return null;
  const existing = costCenterId ? costCenters.find((costCenter) => costCenter.id === costCenterId) : undefined;

  return (
    <Form merchantId={merchantId} abbr={merchant.abbr} costCenters={costCenters} existing={existing} parentId={parentId} onDismiss={onDismiss} />
  );
}

const defaults = (existing: CostCenter | undefined, parentId: string | undefined): CostCenterValues => ({
  cost_center_name: existing?.cost_center_name ?? '',
  cost_center_number: existing?.cost_center_number ?? '',
  parent_id: existing?.parent_id ?? parentId ?? '',
  is_group: existing?.is_group ?? false,
  disabled: existing?.disabled ?? false,
});

type FormProps = {
  merchantId: string;
  abbr: string;
  costCenters: CostCenter[];
  existing: CostCenter | undefined;
  parentId?: string;
  onDismiss: () => void;
};

function Form({ merchantId, abbr, costCenters, existing, parentId, onDismiss }: FormProps) {
  const wide = useShellWide();
  const save = useSaveCostCenterMutation({ merchantId, costCenterId: existing?.id });
  const remove = useDeleteCostCenterMutation();
  const confirm = useConfirm();
  const label = (costCenter: CostCenter) => costCenterLabel(costCenter, abbr);
  // The root is the company's: it goes only with the system (private.validate_tree).
  const deletable = existing?.parent_id && can(usePermissions({ merchantId }).data, 'Cost Center', 'delete');
  const notice = mutationNotice(save, treeFailure(save.error, "Couldn't save this cost center. Try again."));

  const { control, handleSubmit } = useForm<CostCenterValues>({
    resolver: zodResolver(costCenterSchema),
    defaultValues: defaults(existing, parentId),
    mode: 'onTouched',
  });

  const submit = handleSubmit(saveOnce(save, onDismiss));

  const askDelete = (costCenter: CostCenter) =>
    confirm.ask({
      title: `Delete ${label(costCenter)}?`,
      body: 'It leaves the Cost Centers. One with cost centers under it, or one already used, cannot be deleted — disable it instead.',
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(costCenter.id),
      failure: (cause) => treeFailure(cause, "Couldn't delete this cost center. Try again."),
      onDone: closesForm(wide, onDismiss),
    });

  return (
    <>
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        dismissable={!(save.isPending && !save.isPaused)}
        kicker="Cost Center"
        title={existing ? label(existing) : 'New cost center'}
        notice={notice}
        actions={<FormActions mutation={save} onCancel={onDismiss} onSave={submit} onDelete={existing && deletable ? () => askDelete(existing) : undefined} />}
      >
        <CostCenterFields control={control} costCenters={costCenters} existing={existing} label={label} />
      </AdaptiveDialog>
      {confirm.dialog}
    </>
  );
}

type FieldsProps = { control: Control<CostCenterValues>; costCenters: CostCenter[]; existing: CostCenter | undefined; label: (costCenter: CostCenter) => string };

function CostCenterFields({ control, costCenters, existing, label }: FieldsProps) {
  const { root, hasChildren, parents } = treePlacement(costCenters, existing, (costCenter) => ({ value: costCenter.id, label: label(costCenter) }));

  return (
    <FieldGrid>
      <ControlledText control={control} name="cost_center_name" label="Cost Center Name" required span="full" placeholder="e.g. Downtown Branch" maxLength={140} />
      <ControlledText control={control} name="cost_center_number" label="Cost Center Number" hint="Shown before the name" placeholder="e.g. 100" maxLength={20} />
      {/* The root is the company's: no parent to pick, always a group, never disabled. */}
      {root ? null : (
        <>
          <ControlledSelect control={control} name="parent_id" label="Parent Cost Center" required title="Parent Cost Center" options={parents} />
          <ControlledSwitch
            control={control}
            name="is_group"
            label="Is Group"
            span="full"
            on="A group: other cost centers sit under it"
            off="A ledger: income and expenses are tagged with it"
            hint={hasChildren ? 'Has cost centers under it, so it stays a group' : undefined}
            disabled={hasChildren}
          />
          {existing ? <ControlledSwitch control={control} name="disabled" label="Disabled" span="full" on="Hidden from new entries" off="In use" /> : null}
        </>
      )}
    </FieldGrid>
  );
}
