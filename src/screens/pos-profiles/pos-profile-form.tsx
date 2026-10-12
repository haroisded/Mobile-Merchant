import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { saveOnce } from '../../components/adaptive-dialog';
import { ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { PageForm } from '../../components/form-footer';
import { RecordPageHeader } from '../../components/record-page-header';
import { RepeatableList } from '../../components/repeatable-rows';
import { useSalesDefaultsRecords } from '../../components/sales-defaults-fields';
import type { SalesDefaultsRecords } from '../../components/sales-defaults-fields';
import { ControlledSelect } from '../../components/search-select';
import { SectionHeading } from '../../components/section-heading';
import { ledgerOptions } from '../../features/accounts/queries';
import { costCenterOptions } from '../../features/cost-centers/queries';
import { useItemGroupsQuery } from '../../features/item-groups/queries';
import type { ItemGroup } from '../../features/item-groups/queries';
import { useLetterHeadsQuery } from '../../features/letter-heads/queries';
import type { LetterHead } from '../../features/letter-heads/queries';
import { useMembersQuery } from '../../features/members/queries';
import type { Member } from '../../features/members/queries';
import type { Merchant } from '../../features/merchants/queries';
import { useModesOfPaymentQuery } from '../../features/modes-of-payment/queries';
import type { ModeOfPayment } from '../../features/modes-of-payment/queries';
import { useDeletePosProfileMutation, usePosProfilesQuery, useSavePosProfileMutation } from '../../features/pos-profiles/queries';
import type { PosProfile } from '../../features/pos-profiles/queries';
import { APPLY_DISCOUNT_ON, paymentsGap, posProfileSchema } from '../../features/pos-profiles/schema';
import type { PosProfileValues } from '../../features/pos-profiles/schema';
import { priceListOptions } from '../../features/price-lists/queries';
import { usePrintFormatsQuery } from '../../features/print-formats/queries';
import type { PrintFormat } from '../../features/print-formats/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useSalesTaxTemplatesQuery } from '../../features/sales-tax-templates/queries';
import type { SalesTaxTemplate } from '../../features/sales-tax-templates/queries';
import { useTaxCategoriesQuery } from '../../features/tax-categories/queries';
import type { TaxCategory } from '../../features/tax-categories/queries';
import { warehouseOptions } from '../../features/warehouses/queries';
import { failureMessage, mutationNotice, postgrestError, usedElsewhere } from '../../lib/errors';

type Records = {
  sales: SalesDefaultsRecords;
  templates: SalesTaxTemplate[];
  categories: TaxCategory[];
  formats: PrintFormat[];
  letterHeads: LetterHead[];
  members: Member[];
  modes: ModeOfPayment[];
  groups: ItemGroup[];
};

/**
 * One POS Profile (docs.frappe.io/erpnext/pos-profile): a register's warehouse, prices, taxes and print
 * layout, who may use it, what it takes in payment, which items it lists, the accounts that win over an
 * item's, and its Configurations. A page of the Setup stack —
 * src/app/(app)/systems/[id]/setup/pos-profile.tsx — at every width, being a long form with rows.
 */
export function PosProfilePage({ merchant, profileId }: { merchant: Merchant; profileId?: string }) {
  // The list this page was opened from fetched the profiles; the masters are cache hits once Setup has been browsed.
  const profiles = usePosProfilesQuery({ merchantId: merchant.id }).data;
  const sales = useSalesDefaultsRecords(merchant.id);
  const templates = useSalesTaxTemplatesQuery({ merchantId: merchant.id }).data;
  const categories = useTaxCategoriesQuery({ merchantId: merchant.id }).data;
  const formats = usePrintFormatsQuery({ merchantId: merchant.id }).data;
  const letterHeads = useLetterHeadsQuery({ merchantId: merchant.id }).data;
  const members = useMembersQuery({ merchantId: merchant.id }).data;
  const modes = useModesOfPaymentQuery({ merchantId: merchant.id }).data;
  const groups = useItemGroupsQuery({ merchantId: merchant.id }).data;
  if (!profiles || !sales || !templates || !categories || !formats || !letterHeads || !members || !modes || !groups) return null;

  return (
    <Form
      merchant={merchant}
      records={{ sales, templates, categories, formats, letterHeads, members, modes, groups }}
      existing={profileId ? profiles.find((profile) => profile.id === profileId) : undefined}
    />
  );
}

// A new profile: nothing picked, and Set Grand Total to Default Payment Method on, as the table starts it.
const BLANK: PosProfileValues = {
  pos_profile_name: '',
  disabled: false,
  warehouse: '',
  selling_price_list: '',
  taxes_and_charges: '',
  tax_category: '',
  print_format: '',
  letter_head: '',
  account_for_change_amount: '',
  write_off_account: '',
  write_off_cost_center: '',
  write_off_limit: '',
  income_account: '',
  expense_account: '',
  cost_center: '',
  hide_unavailable_items: false,
  allow_rate_change: false,
  set_grand_total_to_default_mop: true,
  print_receipt_on_order_complete: false,
  apply_discount_on: 'Grand Total',
  allow_discount_change: false,
  ignore_pricing_rule: false,
  discount_account: '',
  users: [],
  payments: [],
  item_groups: [],
};

// The links a profile may leave empty: null in the table, '' in the form.
const LINKS = [
  'selling_price_list',
  'taxes_and_charges',
  'tax_category',
  'print_format',
  'letter_head',
  'account_for_change_amount',
  'write_off_account',
  'write_off_cost_center',
  'income_account',
  'expense_account',
  'cost_center',
  'discount_account',
] as const;

const saved = (profile: PosProfile): PosProfileValues => {
  const values: PosProfileValues = {
    ...BLANK,
    pos_profile_name: profile.pos_profile_name,
    disabled: profile.disabled,
    warehouse: profile.warehouse,
    write_off_limit: String(profile.write_off_limit),
    hide_unavailable_items: profile.hide_unavailable_items,
    allow_rate_change: profile.allow_rate_change,
    set_grand_total_to_default_mop: profile.set_grand_total_to_default_mop,
    print_receipt_on_order_complete: profile.print_receipt_on_order_complete,
    apply_discount_on: profile.apply_discount_on === 'Net Total' ? 'Net Total' : 'Grand Total',
    allow_discount_change: profile.allow_discount_change,
    ignore_pricing_rule: profile.ignore_pricing_rule,
    users: profile.pos_profile_users.map((row) => ({ member_id: row.member_id, is_default: row.is_default })),
    payments: profile.pos_profile_payments.map((row) => ({
      mode_of_payment_id: row.mode_of_payment_id,
      is_default: row.is_default,
      allow_in_returns: row.allow_in_returns,
    })),
    item_groups: profile.pos_profile_item_groups.map((row) => ({ item_group_id: row.item_group_id })),
  };
  for (const link of LINKS) values[link] = profile[link] ?? '';
  return values;
};

/** None first, then the records still offered — and the saved one, so the field keeps showing it once disabled. */
const offered = <T extends { id: string; disabled: boolean }>(records: T[], label: (record: T) => string, keep: string | null | undefined) => [
  { value: '', label: 'None' },
  ...records.filter((record) => record.id === keep || !record.disabled).map((record) => ({ value: record.id, label: label(record) })),
];

// What private.validate_pos_profile and private.validate_pos_profile_payments name. The payment rows' other
// two rules never get there: paymentsGap stops the save first.
const REFUSALS = new Map([
  ['default_invalid', "One of the records it names can't be used any more — pick it again."],
  ['payment_mode_unusable', 'Each payment method needs an enabled mode of payment with a default account. Set the account in Modes of Payment first.'],
]);

const saveFailure = (error: Error | null) => {
  const cause = postgrestError(error);
  if (cause?.code === '23505') {
    return cause.message.includes('pos_profile_users_one_default')
      ? 'One of these users already has another profile as their default. Turn Default off on one of them.'
      : 'There is already a POS Profile with this name.';
  }
  return REFUSALS.get(cause?.message ?? '') ?? failureMessage("Couldn't save this POS Profile. Try again.");
};

const deleteFailure = (cause: Error | null) =>
  usedElsewhere(cause) ??
  (postgrestError(cause)?.code === '23503' ? "It's in use. Disable it instead." : failureMessage("Couldn't delete this POS Profile. Try again."));

// Its own component, not inlined in Form: the delete's condition would put Form past fallow's complexity limit.
function ProfileHeader({ merchant, existing }: { merchant: Merchant; existing: PosProfile | undefined }) {
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const remove = useDeletePosProfileMutation();

  return (
    <RecordPageHeader
      kicker="POS Profile"
      title={existing?.pos_profile_name ?? 'New POS Profile'}
      remove={
        existing && can(permissions, 'POS Profile', 'delete')
          ? {
              title: `Delete ${existing.pos_profile_name}?`,
              body: 'Its users, payment methods and item groups go with it. A profile that has been sold with cannot be deleted — disable it instead.',
              run: () => remove.mutateAsync(existing.id),
              failure: deleteFailure,
            }
          : undefined
      }
    />
  );
}

function Form({ merchant, records, existing }: { merchant: Merchant; records: Records; existing: PosProfile | undefined }) {
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const editable = can(permissions, 'POS Profile', existing ? 'write' : 'create');
  const save = useSavePosProfileMutation({ merchantId: merchant.id, profileId: existing?.id });

  const { control, handleSubmit, formState } = useForm<PosProfileValues>({
    resolver: zodResolver(posProfileSchema),
    defaultValues: existing ? saved(existing) : BLANK,
    mode: 'onTouched',
  });
  const users = useFieldArray({ control, name: 'users' });
  const payments = useFieldArray({ control, name: 'payments' });
  const itemGroups = useFieldArray({ control, name: 'item_groups' });
  // What the payment rows lack as a set is said under Save once it has been tried, not while the page is still empty.
  const gap = paymentsGap(useWatch({ control, name: 'payments' }));
  const notice = mutationNotice(save, saveFailure(save.error), formState.isSubmitted ? gap : null);

  // Made per render, not per tap: saveOnce's guard is the handler two quick taps share.
  const send = saveOnce(save, () => router.back());
  const submit = handleSubmit((values) => {
    if (!paymentsGap(values.payments)) send(values);
  });

  const { accounts, costCenters, priceLists, warehouses } = records.sales;
  const abbr = merchant.abbr;
  const memberOptions = records.members.map((member) => ({ value: member.id, label: member.full_name || member.email, hint: member.full_name ? member.email : undefined }));
  // Every enabled mode is offered, and the saved ones stay listed; one with no account yet says so, and the save names it.
  const savedModes = new Set(existing?.pos_profile_payments.map((row) => row.mode_of_payment_id));
  const modeOptions = records.modes
    .filter((mode) => mode.enabled || savedModes.has(mode.id))
    .map((mode) => ({ value: mode.id, label: mode.mode_of_payment, hint: mode.default_account ? mode.type : 'No default account' }));
  const groupOptions = records.groups.map((group) => ({ value: group.id, label: group.item_group_name, hint: group.is_group ? 'Group' : undefined }));

  return (
    <View style={styles.fill}>
      <ProfileHeader merchant={merchant} existing={existing} />
      <PageForm
        editable={editable}
        readOnly="Changing it needs POS Profile write."
        notice={notice}
        mutation={save}
        // A profile not yet saved always has something to check: Save names what is missing.
        dirty={!existing || formState.isDirty}
        onSave={submit}
      >
        <FieldGrid>
          <ControlledText control={control} name="pos_profile_name" label="POS Profile Name" required span="full" placeholder="e.g. Front Counter" maxLength={140} disabled={!editable} />
          <ControlledSelect
            control={control}
            name="warehouse"
            label="Warehouse"
            required
            hint="Where its sales take stock from"
            title="Warehouse"
            options={warehouseOptions(warehouses, abbr, existing?.warehouse).filter((option) => option.value !== '')}
            disabled={!editable}
          />
          <ControlledSelect
            control={control}
            name="selling_price_list"
            label="Price List"
            hint="None: Selling Settings' default"
            title="Price List"
            options={priceListOptions(priceLists, existing?.selling_price_list)}
            disabled={!editable}
          />
          <ControlledSelect
            control={control}
            name="taxes_and_charges"
            label="Taxes and Charges"
            hint="None: a tax rule, else the default template"
            title="Taxes and Charges"
            options={offered(records.templates, (template) => template.title, existing?.taxes_and_charges)}
            disabled={!editable}
          />
          <ControlledSelect
            control={control}
            name="tax_category"
            label="Tax Category"
            hint="The tax rules of this category apply"
            title="Tax Category"
            options={offered(records.categories, (category) => category.title, existing?.tax_category)}
            disabled={!editable}
          />
          <ControlledSelect
            control={control}
            name="print_format"
            label="Print Format"
            hint="None: the default format"
            title="Print Format"
            options={offered(records.formats, (format) => format.print_format_name, existing?.print_format)}
            disabled={!editable}
          />
          <ControlledSelect
            control={control}
            name="letter_head"
            label="Letter Head"
            hint="None: the default letter head"
            title="Letter Head"
            options={offered(records.letterHeads, (head) => head.letter_head_name, existing?.letter_head)}
            disabled={!editable}
          />
          {existing ? (
            <ControlledSwitch control={control} name="disabled" label="Disabled" on="No session can be opened on it" off="Can be sold with" disabled={!editable} />
          ) : null}
        </FieldGrid>

        <SectionHeading title="Applicable for Users" hint="With one listed, only the listed users may use this profile" />
        <RepeatableList
          fields={users.fields}
          editable={editable}
          empty="No users listed: everyone who may sell can use this profile."
          addLabel="Add User"
          onAdd={() => users.append({ member_id: '', is_default: false })}
          onRemove={users.remove}
        >
          {(index) => (
            <FieldGrid>
              <ControlledSelect control={control} name={`users.${index}.member_id`} label="User" required title="User" options={memberOptions} disabled={!editable} />
              <ControlledSwitch
                control={control}
                name={`users.${index}.is_default`}
                label="Default"
                on="The profile this user starts with"
                off="Picked by hand"
                disabled={!editable}
              />
            </FieldGrid>
          )}
        </RepeatableList>

        <SectionHeading title="Payment Methods" hint="Only these are offered at checkout" />
        <RepeatableList
          fields={payments.fields}
          editable={editable}
          empty="No payment methods yet. Add at least one."
          addLabel="Add Payment Method"
          // The first row starts as the default: one always is.
          onAdd={() => payments.append({ mode_of_payment_id: '', is_default: payments.fields.length === 0, allow_in_returns: false })}
          onRemove={payments.remove}
        >
          {(index) => (
            <FieldGrid>
              <ControlledSelect
                control={control}
                name={`payments.${index}.mode_of_payment_id`}
                label="Mode of Payment"
                required
                span="full"
                title="Mode of Payment"
                options={modeOptions}
                disabled={!editable}
              />
              <ControlledSwitch
                control={control}
                name={`payments.${index}.is_default`}
                label="Default"
                on="Offered first at checkout"
                off="Offered after the default"
                disabled={!editable}
              />
              <ControlledSwitch
                control={control}
                name={`payments.${index}.allow_in_returns`}
                label="Allow in Returns"
                on="A refund can be paid out through it"
                off="Not used for refunds"
                disabled={!editable}
              />
            </FieldGrid>
          )}
        </RepeatableList>

        <SectionHeading title="Item Groups" hint="The groups whose items the register lists" />
        <RepeatableList
          fields={itemGroups.fields}
          editable={editable}
          empty="No item groups listed: the register lists every item."
          addLabel="Add Item Group"
          onAdd={() => itemGroups.append({ item_group_id: '' })}
          onRemove={itemGroups.remove}
        >
          {(index) => (
            <FieldGrid>
              <ControlledSelect
                control={control}
                name={`item_groups.${index}.item_group_id`}
                label="Item Group"
                required
                span="full"
                hint="A group brings the groups under it"
                title="Item Group"
                options={groupOptions}
                disabled={!editable}
              />
            </FieldGrid>
          )}
        </RepeatableList>

        {/* docs.frappe.io/erpnext/pos-profile, Accounting */}
        <SectionHeading title="Accounting" hint="Where set, they win over the item's and the company's" />
        <FieldGrid>
          <ControlledSelect
            control={control}
            name="account_for_change_amount"
            label="Account for Change Amount"
            hint="A Cash or Bank ledger"
            title="Account for Change Amount"
            options={ledgerOptions(accounts, abbr, (account) => account.account_type === 'Cash' || account.account_type === 'Bank', existing?.account_for_change_amount)}
            disabled={!editable}
          />
          <ControlledSelect
            control={control}
            name="write_off_account"
            label="Write Off Account"
            hint="An Expense ledger"
            title="Write Off Account"
            options={ledgerOptions(accounts, abbr, (account) => account.root_type === 'Expense', existing?.write_off_account)}
            disabled={!editable}
          />
          <ControlledSelect
            control={control}
            name="write_off_cost_center"
            label="Write Off Cost Center"
            title="Write Off Cost Center"
            options={costCenterOptions(costCenters, abbr, existing?.write_off_cost_center)}
            disabled={!editable}
          />
          <ControlledText
            control={control}
            name="write_off_limit"
            label="Write Off Limit"
            hint="The biggest shortfall a sale may write off"
            placeholder="0"
            keyboardType="decimal-pad"
            maxLength={14}
            disabled={!editable}
          />
          <ControlledSelect
            control={control}
            name="income_account"
            label="Income Account"
            hint="An Income ledger"
            title="Income Account"
            options={ledgerOptions(accounts, abbr, (account) => account.root_type === 'Income', existing?.income_account)}
            disabled={!editable}
          />
          <ControlledSelect
            control={control}
            name="expense_account"
            label="Expense Account"
            hint="An Expense ledger, such as Cost of Goods Sold"
            title="Expense Account"
            options={ledgerOptions(accounts, abbr, (account) => account.root_type === 'Expense', existing?.expense_account)}
            disabled={!editable}
          />
          <ControlledSelect
            control={control}
            name="cost_center"
            label="Cost Center"
            title="Cost Center"
            options={costCenterOptions(costCenters, abbr, existing?.cost_center)}
            disabled={!editable}
          />
          <ControlledSelect
            control={control}
            name="discount_account"
            label="Discount Account"
            hint="Under Discount Accounting, where this register's additional discounts post. None: the company's"
            title="Discount Account"
            options={ledgerOptions(accounts, abbr, (account) => account.root_type === 'Income' || account.root_type === 'Expense', existing?.discount_account)}
            disabled={!editable}
          />
        </FieldGrid>

        {/* docs.frappe.io/erpnext/pos-profile, Configurations */}
        <SectionHeading title="Configurations" hint="How the register behaves" />
        <FieldGrid>
          <ControlledSwitch
            control={control}
            name="hide_unavailable_items"
            label="Hide Unavailable Items"
            on="Items with no stock are not listed"
            off="Every item is listed, in stock or not"
            disabled={!editable}
          />
          <ControlledSwitch
            control={control}
            name="allow_rate_change"
            label="Allow User to Edit Rate"
            on="A cashier can change a line's rate"
            off="A line's rate always comes from the price list"
            disabled={!editable}
          />
          <ControlledSwitch
            control={control}
            name="allow_discount_change"
            label="Allow User to Edit Discount"
            on="A cashier can discount a line, and the whole sale"
            off="Only a pricing rule discounts a sale"
            disabled={!editable}
          />
          <ControlledSelect
            control={control}
            name="apply_discount_on"
            label="Apply Discount On"
            hint="What a sale's additional discount is taken from, to start with"
            title="Apply Discount On"
            options={APPLY_DISCOUNT_ON.map((basis) => ({ value: basis, label: basis }))}
            disabled={!editable}
          />
          <ControlledSwitch
            control={control}
            name="ignore_pricing_rule"
            label="Ignore Pricing Rule"
            on="No pricing rule applies at this register"
            off="Pricing rules price its sales"
            disabled={!editable}
          />
          <ControlledSwitch
            control={control}
            name="set_grand_total_to_default_mop"
            label="Set Grand Total to Default Payment Method"
            on="Checkout starts with the total on the default method"
            off="Checkout starts with no amount entered"
            disabled={!editable}
          />
          <ControlledSwitch
            control={control}
            name="print_receipt_on_order_complete"
            label="Print Receipt on Order Complete"
            on="The receipt opens by itself after a sale"
            off="The receipt is opened from Orders"
            disabled={!editable}
          />
        </FieldGrid>
      </PageForm>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
