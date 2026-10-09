import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { closesForm, useConfirm } from '../../components/confirm-dialog';
import { ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useDeleteTaxCategoryMutation, useSaveTaxCategoryMutation, useTaxCategoriesQuery } from '../../features/tax-categories/queries';
import type { TaxCategory } from '../../features/tax-categories/queries';
import { taxCategorySchema } from '../../features/tax-categories/schema';
import type { TaxCategoryValues } from '../../features/tax-categories/schema';
import { useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';

type Props = { merchantId: string; categoryId?: string; onDismiss: () => void };

/** Create a tax category or edit one — the body of src/app/(app)/forms/tax-category.tsx (page narrow, Dialog wide). */
export function TaxCategoryForm({ merchantId, categoryId, onDismiss }: Props) {
  // The list this form was opened from fetched the same key, so this is a cache hit.
  const categories = useTaxCategoriesQuery({ merchantId }).data;
  if (!categories) return null;
  const existing = categoryId ? categories.find((category) => category.id === categoryId) : undefined;

  return <Form merchantId={merchantId} existing={existing} onDismiss={onDismiss} />;
}

const saveFailure = (error: Error | null) =>
  postgrestError(error)?.code === '23505' ? 'There is already a tax category with this title.' : failureMessage("Couldn't save this tax category. Try again.");

// A template still naming it (sales_tax_templates_category_fk).
const deleteFailure = (error: Error | null) =>
  postgrestError(error)?.code === '23503'
    ? "It's in use by a Sales Taxes and Charges Template. Disable it instead."
    : failureMessage("Couldn't delete this tax category. Try again.");

function Form({ merchantId, existing, onDismiss }: { merchantId: string; existing: TaxCategory | undefined; onDismiss: () => void }) {
  const wide = useShellWide();
  const save = useSaveTaxCategoryMutation({ merchantId, categoryId: existing?.id });
  const remove = useDeleteTaxCategoryMutation();
  const confirm = useConfirm();
  const deletable = can(usePermissions({ merchantId }).data, 'Tax Category', 'delete');
  const notice = mutationNotice(save, saveFailure(save.error));

  const { control, handleSubmit } = useForm<TaxCategoryValues>({
    resolver: zodResolver(taxCategorySchema),
    defaultValues: { title: existing?.title ?? '', disabled: existing?.disabled ?? false },
    mode: 'onTouched',
  });

  const submit = handleSubmit(saveOnce(save, onDismiss));

  const askDelete = (category: TaxCategory) =>
    confirm.ask({
      title: `Delete ${category.title}?`,
      body: 'It leaves the list of tax treatments. Disable it instead to keep it on what already uses it.',
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(category.id),
      failure: deleteFailure,
      onDone: closesForm(wide, onDismiss),
    });

  return (
    <>
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        dismissable={!(save.isPending && !save.isPaused)}
        kicker="Tax Category"
        title={existing?.title ?? 'New tax category'}
        notice={notice}
        actions={<FormActions mutation={save} onCancel={onDismiss} onSave={submit} onDelete={existing && deletable ? () => askDelete(existing) : undefined} />}
      >
        <FieldGrid>
          <ControlledText control={control} name="title" label="Title" required span="full" placeholder="e.g. VAT Exempt" maxLength={140} />
          {existing ? <ControlledSwitch control={control} name="disabled" label="Disabled" span="full" on="Not offered for new templates" off="In use" /> : null}
        </FieldGrid>
      </AdaptiveDialog>
      {confirm.dialog}
    </>
  );
}
