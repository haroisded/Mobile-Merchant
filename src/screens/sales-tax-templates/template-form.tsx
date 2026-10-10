import { zodResolver } from '@hookform/resolvers/zod';
import { router, useNavigation } from 'expo-router';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import type { Control, UseFormGetValues, UseFormSetValue } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { saveOnce } from '../../components/adaptive-dialog';
import { Button } from '../../components/button';
import { useConfirm } from '../../components/confirm-dialog';
import { ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { PageForm } from '../../components/form-footer';
import { PageHeader } from '../../components/page-header';
import { AddRowButton, RepeatableRow } from '../../components/repeatable-rows';
import { ControlledSelect } from '../../components/search-select';
import { Text } from '../../components/text';
import { ledgerOptions, useAccountsQuery } from '../../features/accounts/queries';
import type { Account } from '../../features/accounts/queries';
import { fitsTaxAccount } from '../../features/accounts/schema';
import { costCenterOptions, useCostCentersQuery } from '../../features/cost-centers/queries';
import type { CostCenter } from '../../features/cost-centers/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { PREVIOUS_ROW_TYPES } from '../../features/sales-tax-templates/calculate';
import type { ChargeType } from '../../features/sales-tax-templates/calculate';
import { useDeleteSalesTaxTemplateMutation, useSalesTaxTemplatesQuery, useSaveSalesTaxTemplateMutation } from '../../features/sales-tax-templates/queries';
import type { SalesTaxTemplate } from '../../features/sales-tax-templates/queries';
import { salesTaxTemplateSchema } from '../../features/sales-tax-templates/schema';
import type { SalesTaxTemplateValues } from '../../features/sales-tax-templates/schema';
import { useTaxCategoriesQuery } from '../../features/tax-categories/queries';
import type { TaxCategory } from '../../features/tax-categories/queries';
import { useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice, postgrestError, usedElsewhere } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';
import { TaxPreview } from './tax-preview';

/**
 * One Sales Taxes and Charges Template: its title, category and default, the rows in calculation order, and a
 * Preview that applies them to a sample price. A page of the Setup stack — src/app/(app)/systems/[id]/setup/
 * sales-tax-template.tsx — at every width, being a long form.
 */
export function SalesTaxTemplatePage({ merchant, templateId }: { merchant: Merchant; templateId?: string }) {
  // The list this page was opened from fetched the templates and categories; the rest are cache hits once
  // Setup has been browsed, and a short load otherwise.
  const templates = useSalesTaxTemplatesQuery({ merchantId: merchant.id }).data;
  const accounts = useAccountsQuery({ merchantId: merchant.id }).data;
  const costCenters = useCostCentersQuery({ merchantId: merchant.id }).data;
  const categories = useTaxCategoriesQuery({ merchantId: merchant.id }).data;
  if (!templates || !accounts || !costCenters || !categories) return null;
  const existing = templateId ? templates.find((template) => template.id === templateId) : undefined;

  return <Form merchant={merchant} accounts={accounts} costCenters={costCenters} categories={categories} existing={existing} />;
}

const TYPE_OPTIONS: { value: ChargeType; label: string; hint: string }[] = [
  { value: 'On Net Total', label: 'On Net Total', hint: "A percentage of the items' net total" },
  { value: 'Actual', label: 'Actual', hint: 'A fixed amount' },
  { value: 'On Previous Row Amount', label: 'On Previous Row Amount', hint: "A percentage of an earlier row's tax" },
  { value: 'On Previous Row Total', label: 'On Previous Row Total', hint: 'A percentage of the total after an earlier row' },
  { value: 'On Item Quantity', label: 'On Item Quantity', hint: 'An amount per unit sold' },
];

const asChargeType = (type: string): ChargeType => TYPE_OPTIONS.find((option) => option.value === type)?.value ?? 'On Net Total';

const defaults = (existing: SalesTaxTemplate | undefined): SalesTaxTemplateValues => ({
  title: existing?.title ?? '',
  tax_category_id: existing?.tax_category_id ?? '',
  is_default: existing?.is_default ?? false,
  disabled: existing?.disabled ?? false,
  rows: (existing?.sales_tax_template_rows ?? []).map((row) => ({
    charge_type: asChargeType(row.charge_type),
    account: row.account,
    description: row.description,
    rate: String(row.rate),
    tax_amount: String(row.tax_amount),
    row_id: row.row_id === null ? '' : String(row.row_id),
    included_in_print_rate: row.included_in_print_rate,
    cost_center: row.cost_center ?? '',
  })),
});

/** The database's refusals in words (supabase/migrations/20261009091028_taxes.sql). */
const saveFailure = (error: Error | null) => {
  const cause = postgrestError(error);
  if (cause?.message.includes('one_per_category')) return 'Another enabled template already uses this tax category.';
  if (cause?.code === '23505') return 'There is already a template with this title.';
  if (cause?.message === 'tax_account_invalid') return "A row's account can't be used for taxes any more — pick it again.";
  if (cause?.message === 'tax_cost_center_invalid') return "A row's cost center is a group or disabled — pick another.";
  if (cause?.message === 'tax_inclusive_reference') return 'An included tax is calculated on a row that is not included.';
  return failureMessage("Couldn't save this template. Try again.");
};

type FormProps = {
  merchant: Merchant;
  accounts: Account[];
  costCenters: CostCenter[];
  categories: TaxCategory[];
  existing: SalesTaxTemplate | undefined;
};

/** The page's header: kicker, title, and the red Delete with its confirm for whoever may delete. */
function TemplateHeader({ merchant, existing }: { merchant: Merchant; existing: SalesTaxTemplate | undefined }) {
  const { colors } = useAppTheme();
  const navigation = useNavigation();
  const wide = useShellWide();
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const remove = useDeleteSalesTaxTemplateMutation();
  const confirm = useConfirm();

  const askDelete = (template: SalesTaxTemplate) =>
    confirm.ask({
      title: `Delete ${template.title}?`,
      body: 'Its rows go with it. Disable it instead to keep it for later.',
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(template.id),
      // A tax rule may name it.
      failure: (cause) => usedElsewhere(cause) ?? failureMessage("Couldn't delete this template. Try again."),
      // A page of the Setup stack, not a forms/ route, so not closesForm: this page pops through its own
      // navigator, and on a phone the confirm's sheet of the outer stack pops too (a tablet's is a Dialog on
      // this page). Rejected: router.dismissTo the list — from the sheet the paths part at the outer stack, and
      // React Navigation 7's nested NAVIGATE (no `pop`) pushed a second list over this page, so Back reopened
      // it as "New template" with the deleted values (device run, 2026-10-09).
      onDone: () => {
        navigation.goBack();
        if (!wide) router.back();
      },
    });

  return (
    <>
      <PageHeader
        kicker="Sales Taxes and Charges Template"
        title={existing?.title ?? 'New template'}
        onBack={() => router.back()}
        actions={
          existing && can(permissions, 'Sales Taxes and Charges Template', 'delete') ? (
            <Button mode="outlined" textColor={colors.error} icon="delete" onPress={() => askDelete(existing)}>
              Delete
            </Button>
          ) : null
        }
      />
      {confirm.dialog}
    </>
  );
}

function Form({ merchant, accounts, costCenters, categories, existing }: FormProps) {
  const { colors } = useAppTheme();
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const editable = can(permissions, 'Sales Taxes and Charges Template', existing ? 'write' : 'create');
  const save = useSaveSalesTaxTemplateMutation({ merchantId: merchant.id, templateId: existing?.id });
  const notice = mutationNotice(save, saveFailure(save.error));

  const { control, handleSubmit, getValues, setValue, formState } = useForm<SalesTaxTemplateValues>({
    resolver: zodResolver(salesTaxTemplateSchema),
    defaultValues: defaults(existing),
    mode: 'onTouched',
  });
  const rows = useFieldArray({ control, name: 'rows' });
  const category = useWatch({ control, name: 'tax_category_id' });

  const submit = handleSubmit(saveOnce(save, () => router.back()));

  const categoryOptions = [
    { value: '', label: 'None' },
    ...categories.filter((candidate) => !candidate.disabled || candidate.id === category).map((candidate) => ({ value: candidate.id, label: candidate.title })),
  ];

  return (
    <View style={styles.fill}>
      <TemplateHeader merchant={merchant} existing={existing} />
      <PageForm
        editable={editable}
        readOnly="Changing it needs Sales Taxes and Charges Template write."
        notice={notice}
        mutation={save}
        // A template not yet saved always has something to check: Save names what is missing ("Enter a title.").
        dirty={!existing || formState.isDirty}
        onSave={submit}
      >
        <FieldGrid>
          <ControlledText control={control} name="title" label="Title" required span="full" placeholder="e.g. VAT 12% included" maxLength={140} disabled={!editable} />
          <ControlledSelect
            control={control}
            name="tax_category_id"
            label="Tax Category"
            hint="One enabled template per category"
            title="Tax Category"
            options={categoryOptions}
            disabled={!editable}
          />
          <ControlledSwitch
            control={control}
            name="is_default"
            label="Default"
            on="New sales start with this template"
            off="Not the default"
            deps={['disabled']}
            disabled={!editable}
          />
          <ControlledSwitch control={control} name="disabled" label="Disabled" on="Not offered for new sales" off="In use" deps={['is_default']} disabled={!editable} />
        </FieldGrid>
        {/* Form section heading: headlineSmall and its bodySmall hint (.claude/instruction_mds/frontend.md §5). */}
        <View style={styles.heading}>
          <Text variant="headlineSmall">Taxes and Charges</Text>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
            Calculated in this order; a row can be calculated on one above it
          </Text>
        </View>
        {rows.fields.map((field, index) => (
          <RepeatableRow key={field.id} title={`Row ${index + 1}`} onRemove={editable ? () => rows.remove(index) : undefined}>
            <TaxRowFields
              control={control}
              index={index}
              abbr={merchant.abbr}
              accounts={accounts}
              costCenters={costCenters}
              getValues={getValues}
              setValue={setValue}
              disabled={!editable}
            />
          </RepeatableRow>
        ))}
        {rows.fields.length === 0 ? <Text variant="bodyMedium">No rows yet: a sale with this template pays no tax.</Text> : null}
        {editable ? (
          <AddRowButton
            onPress={() =>
              rows.append({
                charge_type: 'On Net Total',
                account: '',
                description: '',
                rate: '',
                tax_amount: '',
                row_id: '',
                included_in_print_rate: false,
                // ERPNext's default for a tax row: the company's cost center.
                cost_center: merchant.cost_center ?? '',
              })
            }
          >
            Add Row
          </AddRowButton>
        ) : null}
        <TaxPreview merchant={merchant} control={control} />
      </PageForm>
    </View>
  );
}

type RowProps = {
  control: Control<SalesTaxTemplateValues>;
  index: number;
  abbr: string;
  accounts: Account[];
  costCenters: CostCenter[];
  getValues: UseFormGetValues<SalesTaxTemplateValues>;
  setValue: UseFormSetValue<SalesTaxTemplateValues>;
  disabled: boolean;
};

/** One tax row's fields: only those its type uses (docs.frappe.io/erpnext/types-in-tax-template). */
function TaxRowFields({ control, index, abbr, accounts, costCenters, getValues, setValue, disabled }: RowProps) {
  const row = useWatch({ control, name: `rows.${index}` });
  const all = useWatch({ control, name: 'rows' });
  if (!row) return null;
  const previous = PREVIOUS_ROW_TYPES.includes(row.charge_type);

  // A new type keeps only the fields it uses: no reference off the previous-row types, nothing included on Actual.
  const onTypePicked = (picked: string) => {
    if (!PREVIOUS_ROW_TYPES.includes(picked)) setValue(`rows.${index}.row_id`, '', { shouldDirty: true });
    if (picked === 'Actual') setValue(`rows.${index}.included_in_print_rate`, false, { shouldDirty: true });
  };
  // ERPNext fills an empty Description from the account.
  const onAccountPicked = (picked: string) => {
    const account = accounts.find((candidate) => candidate.id === picked);
    if (account && getValues(`rows.${index}.description`).trim() === '') {
      setValue(`rows.${index}.description`, account.account_name, { shouldDirty: true, shouldValidate: true });
    }
  };

  return (
    <FieldGrid>
      <ControlledSelect control={control} name={`rows.${index}.charge_type`} label="Type" required title="Type" options={TYPE_OPTIONS} onPicked={onTypePicked} disabled={disabled} />
      <ControlledSelect
        control={control}
        name={`rows.${index}.account`}
        label="Account Head"
        required
        title="Account Head"
        options={ledgerOptions(accounts, abbr, fitsTaxAccount, row.account).slice(1)}
        onPicked={onAccountPicked}
        disabled={disabled}
      />
      {/* Not required: a blank amount or rate is 0, as ERPNext's Float field (the human's call, device run
          2026-10-09). Rejected: refusing a blank, which the REQUIRED label had promised but the form never did. */}
      {row.charge_type === 'Actual' ? (
        <ControlledText control={control} name={`rows.${index}.tax_amount`} label="Tax Amount" placeholder="e.g. 25" keyboardType="decimal-pad" maxLength={14} disabled={disabled} />
      ) : (
        <ControlledText
          control={control}
          name={`rows.${index}.rate`}
          label="Tax Rate"
          hint={row.charge_type === 'On Item Quantity' ? 'Per unit, not %' : '%'}
          placeholder="e.g. 12"
          keyboardType="decimal-pad"
          maxLength={12}
          disabled={disabled}
        />
      )}
      {previous ? (
        <ControlledSelect
          control={control}
          name={`rows.${index}.row_id`}
          label="Reference Row #"
          required
          title="Reference Row #"
          options={all.slice(0, index).map((earlier, k) => ({ value: String(k + 1), label: `Row ${k + 1}`, hint: earlier.description }))}
          disabled={disabled}
        />
      ) : null}
      <ControlledText control={control} name={`rows.${index}.description`} label="Description" required span="full" placeholder="e.g. VAT @ 12" maxLength={140} disabled={disabled} />
      <ControlledSelect
        control={control}
        name={`rows.${index}.cost_center`}
        label="Cost Center"
        title="Cost Center"
        options={costCenterOptions(costCenters, abbr, row.cost_center)}
        disabled={disabled}
      />
      {row.charge_type === 'Actual' ? null : (
        <ControlledSwitch
          control={control}
          name={`rows.${index}.included_in_print_rate`}
          label="Is this Tax included in Basic Rate?"
          span="full"
          on="Included: the price already holds this tax"
          off="Added on top of the price"
          disabled={disabled}
        />
      )}
    </FieldGrid>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  heading: { gap: spacing.xs, paddingTop: spacing.sm },
});
