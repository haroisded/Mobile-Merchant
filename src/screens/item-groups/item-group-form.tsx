import { zodResolver } from '@hookform/resolvers/zod';
import { router, useNavigation } from 'expo-router';
import type { ReactNode } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { saveOnce } from '../../components/adaptive-dialog';
import { Button } from '../../components/button';
import { useConfirm } from '../../components/confirm-dialog';
import { treeFailure, treePlacement } from '../../components/folder-nav';
import { ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { PageForm } from '../../components/form-footer';
import { ItemTaxFields, useItemTaxRecords } from '../../components/item-tax-fields';
import type { ItemTaxRecords } from '../../components/item-tax-fields';
import { PageHeader } from '../../components/page-header';
import { RepeatableList } from '../../components/repeatable-rows';
import { SalesDefaultsFields, useSalesDefaultsRecords } from '../../components/sales-defaults-fields';
import type { SalesDefaultsRecords } from '../../components/sales-defaults-fields';
import { ControlledSelect } from '../../components/search-select';
import { SectionHeading } from '../../components/section-heading';
import { useDeleteItemGroupMutation, useItemGroupsQuery, useSaveItemGroupMutation } from '../../features/item-groups/queries';
import type { ItemGroup } from '../../features/item-groups/queries';
import { itemGroupSchema } from '../../features/item-groups/schema';
import type { ItemGroupValues } from '../../features/item-groups/schema';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useShellWide } from '../../lib/columns';
import { mutationNotice } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';

type Records = { groups: ItemGroup[]; sales: SalesDefaultsRecords; tax: ItemTaxRecords };

/**
 * One Item Group (docs.frappe.io/erpnext/item-group): its place in the tree, the defaults its items take, and
 * its Item Tax rows. A page of the Setup stack — src/app/(app)/systems/[id]/setup/item-group.tsx — at every
 * width, being a long form; new under `parentId` when there is no `groupId`.
 */
export function ItemGroupPage({ merchant, groupId, parentId }: { merchant: Merchant; groupId?: string; parentId?: string }) {
  // The tree this page was opened from fetched the groups; the rest are cache hits once Setup has been browsed.
  const groups = useItemGroupsQuery({ merchantId: merchant.id }).data;
  const sales = useSalesDefaultsRecords(merchant.id);
  const tax = useItemTaxRecords(merchant.id);
  if (!groups || !sales || !tax) return null;

  return <Form merchant={merchant} records={{ groups, sales, tax }} existing={groupId ? groups.find((group) => group.id === groupId) : undefined} parentId={parentId} />;
}

const defaults = (existing: ItemGroup | undefined, parentId: string | undefined): ItemGroupValues => ({
  item_group_name: existing?.item_group_name ?? '',
  parent_id: existing?.parent_id ?? parentId ?? '',
  is_group: existing?.is_group ?? false,
  default_price_list: existing?.default_price_list ?? '',
  default_warehouse: existing?.default_warehouse ?? '',
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
function GroupHeader({ merchant, existing, save }: { merchant: Merchant; existing: ItemGroup | undefined; save: ReactNode }) {
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
      body: 'Its Item Tax rows go with it. One with groups or items under it, or one a tax rule or Stock Settings uses, cannot be deleted.',
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
        actions={[
          existing && deletable ? (
            <Button key="delete" mode="outlined" textColor={colors.error} icon="delete" onPress={() => askDelete(existing)}>
              Delete
            </Button>
          ) : null,
          save,
        ]}
      />
      {confirm.dialog}
    </>
  );
}

type FormProps = { merchant: Merchant; records: Records; existing: ItemGroup | undefined; parentId: string | undefined };

function Form({ merchant, records, existing, parentId }: FormProps) {
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const editable = can(permissions, 'Item Group', existing ? 'write' : 'create');
  const save = useSaveItemGroupMutation({ merchantId: merchant.id, groupId: existing?.id });
  const notice = mutationNotice(save, treeFailure(save.error, "Couldn't save this item group. Try again."));
  const { root, hasChildren, parents } = treePlacement(records.groups, existing, (group) => ({ value: group.id, label: group.item_group_name }));

  const { control, handleSubmit, formState } = useForm<ItemGroupValues>({
    resolver: zodResolver(itemGroupSchema),
    defaultValues: defaults(existing, parentId),
    mode: 'onTouched',
  });
  const taxes = useFieldArray({ control, name: 'taxes' });

  const submit = handleSubmit(saveOnce(save, () => router.back()));

  return (
    <View style={styles.fill}>
      <PageForm
        header={(button) => <GroupHeader merchant={merchant} existing={existing} save={button} />}
        editable={editable}
        readOnly="Changing it needs Item Group write."
        notice={notice}
        mutation={save}
        // A group not yet saved always has something to check: Save names what is missing ("Enter a name.").
        dirty={!existing || formState.isDirty}
        unsaved={formState.isDirty}
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
        <SalesDefaultsFields
          control={control}
          names={{ priceList: 'default_price_list', warehouse: 'default_warehouse', income: 'income_account', expense: 'expense_account' }}
          saved={existing}
          records={records.sales}
          disabled={!editable}
        />
        <SectionHeading title="Item Tax" hint="The Item Tax Template its items take — for a tax category, from a date, within a net rate" />
        <RepeatableList
          fields={taxes.fields}
          editable={editable}
          empty="No item taxes: its items are taxed as the sale's template says."
          addLabel="Add Item Tax"
          onAdd={() => taxes.append({ item_tax_template_id: '', tax_category_id: '', valid_from: '', minimum_net_rate: '', maximum_net_rate: '' })}
          onRemove={taxes.remove}
        >
          {(index) => <TaxRowFields control={control} index={index} records={records.tax} disabled={!editable} />}
        </RepeatableList>
      </PageForm>
    </View>
  );
}

type RowProps = { control: Control<ItemGroupValues>; index: number; records: ItemTaxRecords; disabled: boolean };

/** One Item Tax row: the template, and the conditions under which it applies. */
function TaxRowFields({ control, index, records, disabled }: RowProps) {
  const row = useWatch({ control, name: `taxes.${index}` });
  if (!row) return null;

  return (
    <FieldGrid>
      <ItemTaxFields
        control={control}
        names={{ template: `taxes.${index}.item_tax_template_id`, category: `taxes.${index}.tax_category_id`, validFrom: `taxes.${index}.valid_from` }}
        row={row}
        records={records}
        disabled={disabled}
      />
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
