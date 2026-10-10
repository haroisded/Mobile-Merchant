import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { closesForm, useConfirm } from '../../components/confirm-dialog';
import { ControlledDate, ControlledText, FieldGrid } from '../../components/form-fields';
import { ControlledSelect } from '../../components/search-select';
import { itemGroupOptions } from '../../features/item-groups/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useDeleteTaxRuleMutation, useSaveTaxRuleMutation } from '../../features/tax-rules/queries';
import type { TaxRule } from '../../features/tax-rules/queries';
import { taxRuleSchema } from '../../features/tax-rules/schema';
import type { TaxRuleValues } from '../../features/tax-rules/schema';
import { useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';
import { useTaxRuleRecords } from './records';
import type { TaxRuleRecords } from './records';

type Props = { merchantId: string; ruleId?: string; onDismiss: () => void };

/** Create a Tax Rule or edit one — the body of src/app/(app)/forms/tax-rule.tsx (page narrow, Dialog wide). */
export function TaxRuleForm({ merchantId, ruleId, onDismiss }: Props) {
  const records = useTaxRuleRecords({ merchantId });
  if (!records) return null;
  const existing = ruleId ? records.rules.find((rule) => rule.id === ruleId) : undefined;

  return <Form merchantId={merchantId} options={records} existing={existing} onDismiss={onDismiss} />;
}

const defaults = (existing: TaxRule | undefined): TaxRuleValues => ({
  sales_tax_template_id: existing?.sales_tax_template_id ?? '',
  tax_category_id: existing?.tax_category_id ?? '',
  item_group_id: existing?.item_group_id ?? '',
  from_date: existing?.from_date ?? '',
  to_date: existing?.to_date ?? '',
  priority: String(existing?.priority ?? 1),
});

/** The database's refusals in words (supabase/migrations/20261010011005_tax_rules.sql). */
const saveFailure = (error: Error | null) => {
  const cause = postgrestError(error);
  if (cause?.code === '23P01') return 'Another rule with the same conditions and priority covers some of these dates. Change a condition, the dates or the priority.';
  if (cause?.message.includes('tax_rules_dates')) return "To Date can't be before From Date.";
  return failureMessage("Couldn't save this tax rule. Try again.");
};

type FormProps = { merchantId: string; options: TaxRuleRecords; existing: TaxRule | undefined; onDismiss: () => void };

function Form({ merchantId, options, existing, onDismiss }: FormProps) {
  const wide = useShellWide();
  const save = useSaveTaxRuleMutation({ merchantId, ruleId: existing?.id });
  const remove = useDeleteTaxRuleMutation();
  const confirm = useConfirm();
  const deletable = can(usePermissions({ merchantId }).data, 'Tax Rule', 'delete');
  const notice = mutationNotice(save, saveFailure(save.error));

  const { control, handleSubmit } = useForm<TaxRuleValues>({
    resolver: zodResolver(taxRuleSchema),
    defaultValues: defaults(existing),
    mode: 'onTouched',
  });

  const submit = handleSubmit(saveOnce(save, onDismiss));

  const askDelete = (rule: TaxRule) =>
    confirm.ask({
      title: 'Delete this tax rule?',
      body: 'Sales it chose a template for take the next rule that matches, or the default template.',
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(rule.id),
      failure: () => failureMessage("Couldn't delete this tax rule. Try again."),
      onDone: closesForm(wide, onDismiss),
    });

  // Enabled ones, plus the rule's own once disabled, so a saved field still shows it.
  const templates = options.templates
    .filter((template) => !template.disabled || template.id === existing?.sales_tax_template_id)
    .map((template) => ({ value: template.id, label: template.title, hint: template.is_default ? 'Default' : undefined }));
  const categories = [
    { value: '', label: 'Any' },
    ...options.categories
      .filter((category) => !category.disabled || category.id === existing?.tax_category_id)
      .map((category) => ({ value: category.id, label: category.title })),
  ];
  // "None" reads as no condition here: any item group.
  const groups = itemGroupOptions(options.groups).map((option) => (option.value === '' ? { value: '', label: 'Any' } : option));

  return (
    <>
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        dismissable={!(save.isPending && !save.isPaused)}
        kicker="Tax Rule"
        title={existing ? 'Edit tax rule' : 'New tax rule'}
        notice={notice}
        actions={<FormActions mutation={save} onCancel={onDismiss} onSave={submit} onDelete={existing && deletable ? () => askDelete(existing) : undefined} />}
      >
        <FieldGrid>
          <ControlledSelect
            control={control}
            name="sales_tax_template_id"
            label="Sales Taxes and Charges Template"
            required
            span="full"
            title="Sales Taxes and Charges Template"
            options={templates}
          />
          {/* docs.frappe.io/erpnext/tax-rule: leave a condition blank when it is not needed; each one filled narrows the rule. */}
          <ControlledSelect control={control} name="tax_category_id" label="Tax Category" hint="Blank: any" title="Tax Category" options={categories} />
          <ControlledSelect control={control} name="item_group_id" label="Item Group" hint="And every group under it" title="Item Group" options={groups} />
          <ControlledDate control={control} name="from_date" label="From Date" hint="Blank: from the start" clearable />
          <ControlledDate control={control} name="to_date" label="To Date" hint="Blank: no end" clearable />
          <ControlledText
            control={control}
            name="priority"
            label="Priority"
            required
            hint="1 is the highest"
            keyboardType="number-pad"
            maxLength={4}
          />
        </FieldGrid>
      </AdaptiveDialog>
      {confirm.dialog}
    </>
  );
}
