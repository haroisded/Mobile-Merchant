import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { closesForm, useConfirm } from '../../components/confirm-dialog';
import { ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { NoteCallout } from '../../components/note-callout';
import { AddRowButton, RepeatableRow } from '../../components/repeatable-rows';
import { ControlledSelect } from '../../components/search-select';
import { ledgerOptions, useAccountsQuery } from '../../features/accounts/queries';
import type { Account } from '../../features/accounts/queries';
import { fitsTaxAccount } from '../../features/accounts/schema';
import { useDeleteItemTaxTemplateMutation, useItemTaxTemplatesQuery, useSaveItemTaxTemplateMutation } from '../../features/item-tax-templates/queries';
import type { ItemTaxTemplate } from '../../features/item-tax-templates/queries';
import { itemTaxTemplateSchema } from '../../features/item-tax-templates/schema';
import type { ItemTaxTemplateValues } from '../../features/item-tax-templates/schema';
import { useMerchantsQuery } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice, postgrestError, usedElsewhere } from '../../lib/errors';

type Props = { merchantId: string; templateId?: string; onDismiss: () => void };

/** Create an Item Tax Template or edit one — the body of src/app/(app)/forms/item-tax-template.tsx (page narrow, Dialog wide). */
export function ItemTaxTemplateForm({ merchantId, templateId, onDismiss }: Props) {
  // The list this form was opened from fetched the same keys, so these are cache hits.
  const templates = useItemTaxTemplatesQuery({ merchantId }).data;
  const accounts = useAccountsQuery({ merchantId }).data;
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === merchantId);
  if (!templates || !accounts || !merchant) return null;
  const existing = templateId ? templates.find((template) => template.id === templateId) : undefined;

  return <Form merchantId={merchantId} abbr={merchant.abbr} accounts={accounts} existing={existing} onDismiss={onDismiss} />;
}

const EMPTY_ROW = { account: '', tax_rate: '', not_applicable: false };

const defaults = (existing: ItemTaxTemplate | undefined): ItemTaxTemplateValues => ({
  title: existing?.title ?? '',
  disabled: existing?.disabled ?? false,
  rows: existing
    ? existing.item_tax_template_rows.map((row) => ({ account: row.account, tax_rate: String(row.tax_rate), not_applicable: row.not_applicable }))
    : [EMPTY_ROW],
});

const saveFailure = (error: Error | null) => {
  const cause = postgrestError(error);
  if (cause?.code === '23505' && cause.message.includes('account_unique')) return 'The same tax account is in two rows.';
  if (cause?.code === '23505') return 'There is already an item tax template with this title.';
  if (cause?.message === 'tax_account_invalid') return "A row's account can't be used for taxes any more — pick it again.";
  return failureMessage("Couldn't save this item tax template. Try again.");
};

type FormProps = { merchantId: string; abbr: string; accounts: Account[]; existing: ItemTaxTemplate | undefined; onDismiss: () => void };

function Form({ merchantId, abbr, accounts, existing, onDismiss }: FormProps) {
  const wide = useShellWide();
  const save = useSaveItemTaxTemplateMutation({ merchantId, templateId: existing?.id });
  const remove = useDeleteItemTaxTemplateMutation();
  const confirm = useConfirm();
  const deletable = can(usePermissions({ merchantId }).data, 'Item Tax Template', 'delete');
  const notice = mutationNotice(save, saveFailure(save.error));

  const { control, handleSubmit } = useForm<ItemTaxTemplateValues>({
    resolver: zodResolver(itemTaxTemplateSchema),
    defaultValues: defaults(existing),
    mode: 'onTouched',
  });
  const rows = useFieldArray({ control, name: 'rows' });
  const values = useWatch({ control, name: 'rows' });

  const submit = handleSubmit(saveOnce(save, onDismiss));

  const askDelete = (template: ItemTaxTemplate) =>
    confirm.ask({
      title: `Delete ${template.title}?`,
      body: 'Items and item groups that use it go back to the sale template’s own rates. Disable it instead to keep it for later.',
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(template.id),
      // An item group's Item Tax row may name it.
      failure: (cause) => usedElsewhere(cause) ?? failureMessage("Couldn't delete this item tax template. Try again."),
      onDone: closesForm(wide, onDismiss),
    });

  return (
    <>
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        dismissable={!(save.isPending && !save.isPaused)}
        kicker="Item Tax Template"
        title={existing?.title ?? 'New item tax template'}
        notice={notice}
        actions={<FormActions mutation={save} onCancel={onDismiss} onSave={submit} onDelete={existing && deletable ? () => askDelete(existing) : undefined} />}
      >
        {/* docs.frappe.io/erpnext/item-tax-template: the override needs its account in the sale's tax rows. */}
        <NoteCallout>
          Each rate replaces the sale template&apos;s rate for the same tax account. The sale template still needs a row for that account.
        </NoteCallout>
        <FieldGrid>
          <ControlledText control={control} name="title" label="Title" required span="full" placeholder="e.g. Reduced VAT 4%" maxLength={140} />
          {existing ? <ControlledSwitch control={control} name="disabled" label="Disabled" span="full" on="Not offered for items" off="In use" /> : null}
        </FieldGrid>
        {rows.fields.map((field, index) => (
          <RepeatableRow key={field.id} title={`Row ${index + 1}`} onRemove={() => rows.remove(index)}>
            <FieldGrid>
              <ControlledSelect
                control={control}
                name={`rows.${index}.account`}
                label="Tax"
                required
                span="full"
                title="Tax"
                options={ledgerOptions(accounts, abbr, fitsTaxAccount, values[index]?.account).slice(1)}
              />
              <ControlledText
                control={control}
                name={`rows.${index}.tax_rate`}
                label="Tax Rate"
                hint="%"
                placeholder="e.g. 4"
                keyboardType="decimal-pad"
                maxLength={12}
                disabled={values[index]?.not_applicable}
              />
              <ControlledSwitch
                control={control}
                name={`rows.${index}.not_applicable`}
                label="Not Applicable"
                on="This tax does not apply to these items"
                off="Applies at the rate above"
              />
            </FieldGrid>
          </RepeatableRow>
        ))}
        <AddRowButton onPress={() => rows.append(EMPTY_ROW)}>Add Row</AddRowButton>
      </AdaptiveDialog>
      {confirm.dialog}
    </>
  );
}
