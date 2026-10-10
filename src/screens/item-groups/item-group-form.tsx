import { zodResolver } from '@hookform/resolvers/zod';
import { router, useNavigation } from 'expo-router';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { saveOnce } from '../../components/adaptive-dialog';
import { Button } from '../../components/button';
import { useConfirm } from '../../components/confirm-dialog';
import { treeFailure, treePlacement } from '../../components/folder-nav';
import { ControlledDate, ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { PageForm } from '../../components/form-footer';
import { PageHeader } from '../../components/page-header';
import { AddRowButton, RepeatableRow } from '../../components/repeatable-rows';
import { ControlledSelect } from '../../components/search-select';
import { SectionHeading } from '../../components/section-heading';
import { Text } from '../../components/text';
import { ledgerOptions, useAccountsQuery } from '../../features/accounts/queries';
import type { Account } from '../../features/accounts/queries';
import { costCenterOptions, useCostCentersQuery } from '../../features/cost-centers/queries';
import type { CostCenter } from '../../features/cost-centers/queries';
import { useDeleteItemGroupMutation, useItemGroupsQuery, useSaveItemGroupMutation } from '../../features/item-groups/queries';
import type { ItemGroup } from '../../features/item-groups/queries';
import { itemGroupSchema } from '../../features/item-groups/schema';
import type { ItemGroupValues } from '../../features/item-groups/schema';
import { useItemTaxTemplatesQuery } from '../../features/item-tax-templates/queries';
import type { ItemTaxTemplate } from '../../features/item-tax-templates/queries';
import type { Merchant } from '../../features/merchants/queries';
import { priceListOptions, usePriceListsQuery } from '../../features/price-lists/queries';
import type { PriceList } from '../../features/price-lists/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useTaxCategoriesQuery } from '../../features/tax-categories/queries';
import type { TaxCategory } from '../../features/tax-categories/queries';
import { useWarehousesQuery, warehouseOptions } from '../../features/warehouses/queries';
import type { Warehouse } from '../../features/warehouses/queries';
import { useShellWide } from '../../lib/columns';
import { mutationNotice } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';

type Records = {
  groups: ItemGroup[];
  priceLists: PriceList[];
  warehouses: Warehouse[];
  costCenters: CostCenter[];
  accounts: Account[];
  itemTemplates: ItemTaxTemplate[];
  categories: TaxCategory[];
};

/**
 * One Item Group (docs.frappe.io/erpnext/item-group): its place in the tree, the defaults its items take, and
 * its Item Tax rows. A page of the Setup stack — src/app/(app)/systems/[id]/setup/item-group.tsx — at every
 * width, being a long form; new under `parentId` when there is no `groupId`.
 */
export function ItemGroupPage({ merchant, groupId, parentId }: { merchant: Merchant; groupId?: string; parentId?: string }) {
  // Every member may select these (All's Select on each), so an Item Group editor can pick from them. The tree
  // this page was opened from fetched the groups; the rest are cache hits once Setup has been browsed.
  const groups = useItemGroupsQuery({ merchantId: merchant.id }).data;
  const priceLists = usePriceListsQuery({ merchantId: merchant.id }).data;
  const warehouses = useWarehousesQuery({ merchantId: merchant.id }).data;
  const costCenters = useCostCentersQuery({ merchantId: merchant.id }).data;
  const accounts = useAccountsQuery({ merchantId: merchant.id }).data;
  const itemTemplates = useItemTaxTemplatesQuery({ merchantId: merchant.id }).data;
  const categories = useTaxCategoriesQuery({ merchantId: merchant.id }).data;
  if (!groups || !priceLists || !warehouses || !costCenters || !accounts || !itemTemplates || !categories) return null;
  const existing = groupId ? groups.find((group) => group.id === groupId) : undefined;

  return (
    <Form
      merchant={merchant}
      records={{ groups, priceLists, warehouses, costCenters, accounts, itemTemplates, categories }}
      existing={existing}
      parentId={parentId}
    />
  );
}

const defaults = (existing: ItemGroup | undefined, parentId: string | undefined): ItemGroupValues => ({
  item_group_name: existing?.item_group_name ?? '',
  parent_id: existing?.parent_id ?? parentId ?? '',
  is_group: existing?.is_group ?? false,
  default_price_list: existing?.default_price_list ?? '',
  default_warehouse: existing?.default_warehouse ?? '',
  selling_cost_center: existing?.selling_cost_center ?? '',
  income_account: existing?.income_account ?? '',
  expense_account: existing?.expense_account ?? '',
  taxes: (existing?.item_group_taxes ?? []).map((row) => ({
    item_tax_template_id: row.item_tax_template_id,
    tax_category_id: row.tax_category_id ?? '',
    valid_from: row.valid_from ?? '',
    minimum_net_rate: String(row.minimum_net_rate),
    maximum_net_rate: String(row.maximum_net_rate),
  })),
});

/** The page's header: kicker, title, and the red Delete with its confirm for whoever may delete. */
function GroupHeader({ merchant, existing }: { merchant: Merchant; existing: ItemGroup | undefined }) {
  const { colors } = useAppTheme();
  const navigation = useNavigation();
  const wide = useShellWide();
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const remove = useDeleteItemGroupMutation();
  const confirm = useConfirm();
  // All Item Groups keeps its place: it is where New Item Group starts, so it offers no Delete.
  const deletable = existing?.parent_id && can(permissions, 'Item Group', 'delete');

  const askDelete = (group: ItemGroup) =>
    confirm.ask({
      title: `Delete ${group.item_group_name}?`,
      body: 'Its Item Tax rows go with it. One with groups under it, or one a tax rule or Stock Settings uses, cannot be deleted.',
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(group.id),
      failure: (cause) => treeFailure(cause, "Couldn't delete this item group. Try again."),
      // A page of the Setup stack, as the tax template page is (src/screens/sales-tax-templates/template-form.tsx):
      // it pops through its own navigator, and on a phone the confirm's sheet of the outer stack pops too.
      onDone: () => {
        navigation.goBack();
        if (!wide) router.back();
      },
    });

  return (
    <>
      <PageHeader
        kicker="Item Group"
        title={existing?.item_group_name ?? 'New item group'}
        onBack={() => router.back()}
        actions={
          existing && deletable ? (
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

type FormProps = { merchant: Merchant; records: Records; existing: ItemGroup | undefined; parentId: string | undefined };

function Form({ merchant, records, existing, parentId }: FormProps) {
  const { colors } = useAppTheme();
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const editable = can(permissions, 'Item Group', existing ? 'write' : 'create');
  const save = useSaveItemGroupMutation({ merchantId: merchant.id, groupId: existing?.id });
  const notice = mutationNotice(save, treeFailure(save.error, "Couldn't save this item group. Try again."));
  const { root, hasChildren, parents } = treePlacement(records.groups, existing, (group) => ({ value: group.id, label: group.item_group_name }));
  const abbr = merchant.abbr;

  const { control, handleSubmit, formState } = useForm<ItemGroupValues>({
    resolver: zodResolver(itemGroupSchema),
    defaultValues: defaults(existing, parentId),
    mode: 'onTouched',
  });
  const taxes = useFieldArray({ control, name: 'taxes' });

  const submit = handleSubmit(saveOnce(save, () => router.back()));

  return (
    <View style={styles.fill}>
      <GroupHeader merchant={merchant} existing={existing} />
      <PageForm
        editable={editable}
        readOnly="Changing it needs Item Group write."
        notice={notice}
        mutation={save}
        // A group not yet saved always has something to check: Save names what is missing ("Enter a name.").
        dirty={!existing || formState.isDirty}
        onSave={submit}
      >
        <FieldGrid>
          <ControlledText control={control} name="item_group_name" label="Item Group Name" required span="full" placeholder="e.g. Beverages" maxLength={140} disabled={!editable} />
          {/* All Item Groups: no parent to pick, always a group. */}
          {root ? null : (
            <>
              <ControlledSelect control={control} name="parent_id" label="Parent Item Group" required title="Parent Item Group" options={parents} disabled={!editable} />
              <ControlledSwitch
                control={control}
                name="is_group"
                label="Is Group"
                on="A group: other item groups sit under it"
                off="Items are classified into it"
                hint={hasChildren ? 'Has groups under it, so it stays a group' : undefined}
                disabled={!editable || hasChildren}
              />
            </>
          )}
        </FieldGrid>
        {/* docs.frappe.io/erpnext/item-group 2.2 */}
        <SectionHeading title="Defaults" hint="What its items start with when they are sold" />
        <FieldGrid>
          <ControlledSelect
            control={control}
            name="default_price_list"
            label="Default Price List"
            title="Default Price List"
            options={priceListOptions(records.priceLists, existing?.default_price_list)}
            disabled={!editable}
          />
          <ControlledSelect
            control={control}
            name="default_warehouse"
            label="Default Warehouse"
            hint="Where its items are sold from"
            title="Default Warehouse"
            options={warehouseOptions(records.warehouses, abbr, existing?.default_warehouse)}
            disabled={!editable}
          />
          <ControlledSelect
            control={control}
            name="selling_cost_center"
            label="Default Selling Cost Center"
            title="Default Selling Cost Center"
            options={costCenterOptions(records.costCenters, abbr, existing?.selling_cost_center)}
            disabled={!editable}
          />
          <ControlledSelect
            control={control}
            name="income_account"
            label="Default Income Account"
            hint="An Income ledger"
            title="Default Income Account"
            options={ledgerOptions(records.accounts, abbr, (account) => account.root_type === 'Income', existing?.income_account)}
            disabled={!editable}
          />
          <ControlledSelect
            control={control}
            name="expense_account"
            label="Default Expense Account"
            hint="An Expense ledger, such as Cost of Goods Sold"
            title="Default Expense Account"
            options={ledgerOptions(records.accounts, abbr, (account) => account.root_type === 'Expense', existing?.expense_account)}
            disabled={!editable}
          />
        </FieldGrid>
        <SectionHeading title="Item Tax" hint="The Item Tax Template its items take — for a tax category, from a date, within a net rate" />
        {taxes.fields.map((field, index) => (
          <RepeatableRow key={field.id} title={`Row ${index + 1}`} onRemove={editable ? () => taxes.remove(index) : undefined}>
            <TaxRowFields control={control} index={index} records={records} disabled={!editable} />
          </RepeatableRow>
        ))}
        {taxes.fields.length === 0 ? (
          <Text variant="bodyMedium" style={{ color: colors.onSurfaceMuted }}>
            No item taxes: its items are taxed as the sale's template says.
          </Text>
        ) : null}
        {editable ? (
          <AddRowButton onPress={() => taxes.append({ item_tax_template_id: '', tax_category_id: '', valid_from: '', minimum_net_rate: '', maximum_net_rate: '' })}>
            Add Item Tax
          </AddRowButton>
        ) : null}
      </PageForm>
    </View>
  );
}

type RowProps = { control: Control<ItemGroupValues>; index: number; records: Records; disabled: boolean };

/** One Item Tax row: the template, and the conditions under which it applies. */
function TaxRowFields({ control, index, records, disabled }: RowProps) {
  const row = useWatch({ control, name: `taxes.${index}` });
  if (!row) return null;

  // Enabled ones, plus the row's own once disabled, so a saved row still shows it.
  const templates = records.itemTemplates
    .filter((template) => !template.disabled || template.id === row.item_tax_template_id)
    .map((template) => ({ value: template.id, label: template.title }));
  const categories = [
    { value: '', label: 'Any' },
    ...records.categories
      .filter((category) => !category.disabled || category.id === row.tax_category_id)
      .map((category) => ({ value: category.id, label: category.title })),
  ];

  return (
    <FieldGrid>
      <ControlledSelect
        control={control}
        name={`taxes.${index}.item_tax_template_id`}
        label="Item Tax Template"
        required
        span="full"
        title="Item Tax Template"
        options={templates}
        disabled={disabled}
      />
      <ControlledSelect control={control} name={`taxes.${index}.tax_category_id`} label="Tax Category" title="Tax Category" options={categories} disabled={disabled} />
      <ControlledDate control={control} name={`taxes.${index}.valid_from`} label="Valid From" hint="Empty: always" clearable disabled={disabled} />
      <ControlledText
        control={control}
        name={`taxes.${index}.minimum_net_rate`}
        label="Minimum Net Rate"
        placeholder="0"
        keyboardType="decimal-pad"
        maxLength={14}
        disabled={disabled}
      />
      <ControlledText
        control={control}
        name={`taxes.${index}.maximum_net_rate`}
        label="Maximum Net Rate"
        hint="0: no limit"
        placeholder="0"
        keyboardType="decimal-pad"
        maxLength={14}
        disabled={disabled}
      />
    </FieldGrid>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
