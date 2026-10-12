import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { saveOnce } from '../../components/adaptive-dialog';
import { ControlledDate, ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { PageForm } from '../../components/form-footer';
import { RecordPageHeader } from '../../components/record-page-header';
import { RepeatableList } from '../../components/repeatable-rows';
import { ControlledSelect } from '../../components/search-select';
import { SectionHeading } from '../../components/section-heading';
import { useBrandsQuery } from '../../features/brands/queries';
import type { Brand } from '../../features/brands/queries';
import { useItemGroupsQuery } from '../../features/item-groups/queries';
import type { ItemGroup } from '../../features/item-groups/queries';
import { itemLabel, useItemsQuery } from '../../features/items/queries';
import type { Item } from '../../features/items/queries';
import type { Merchant } from '../../features/merchants/queries';
import { priceListOptions, usePriceListsQuery } from '../../features/price-lists/queries';
import type { PriceList } from '../../features/price-lists/queries';
import { resultOf, targetOf, useDeletePricingRuleMutation, usePricingRulesQuery, useSavePricingRuleMutation } from '../../features/pricing-rules/queries';
import type { PricingRule } from '../../features/pricing-rules/queries';
import { APPLY_ON, pricingRuleSchema, RATE_OR_DISCOUNT, targetsGap } from '../../features/pricing-rules/schema';
import type { PricingRuleValues } from '../../features/pricing-rules/schema';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';

type Records = { items: Item[]; groups: ItemGroup[]; brands: Brand[]; priceLists: PriceList[] };

/**
 * One Pricing Rule (docs.frappe.io/erpnext/pricing-rule): what it applies on, the quantities, amounts, dates
 * and price list it holds for, its priority, and the rate or discount it gives. A page of the Setup stack —
 * src/app/(app)/systems/[id]/setup/pricing-rule.tsx — at every width, being a form with rows.
 */
export function PricingRulePage({ merchant, ruleId }: { merchant: Merchant; ruleId?: string }) {
  // The list this page was opened from fetched the rules; the masters are cache hits once Setup has been browsed.
  const rules = usePricingRulesQuery({ merchantId: merchant.id }).data;
  const items = useItemsQuery({ merchantId: merchant.id }).data;
  const groups = useItemGroupsQuery({ merchantId: merchant.id }).data;
  const brands = useBrandsQuery({ merchantId: merchant.id }).data;
  const priceLists = usePriceListsQuery({ merchantId: merchant.id }).data;
  if (!rules || !items || !groups || !brands || !priceLists) return null;

  return <Form merchant={merchant} records={{ items, groups, brands, priceLists }} existing={ruleId ? rules.find((rule) => rule.id === ruleId) : undefined} />;
}

const BLANK: PricingRuleValues = {
  title: '',
  apply_on: 'Item Code',
  targets: [],
  min_qty: '',
  max_qty: '',
  min_amt: '',
  max_amt: '',
  valid_from: '',
  valid_upto: '',
  for_price_list: '',
  priority: '1',
  disable: false,
  rate_or_discount: 'Discount Percentage',
  value: '',
};

// 0 is "no limit" on the four ranges, shown as the empty field it is saved from.
const range = (value: number) => (value ? String(value) : '');

const saved = (rule: PricingRule): PricingRuleValues => ({
  title: rule.title,
  apply_on: APPLY_ON.find((kind) => kind === rule.apply_on) ?? 'Item Code',
  targets: rule.pricing_rule_targets.map((row) => ({ target: targetOf(row) })),
  min_qty: range(rule.min_qty),
  max_qty: range(rule.max_qty),
  min_amt: range(rule.min_amt),
  max_amt: range(rule.max_amt),
  valid_from: rule.valid_from ?? '',
  valid_upto: rule.valid_upto ?? '',
  for_price_list: rule.for_price_list ?? '',
  priority: String(rule.priority),
  disable: rule.disable,
  rate_or_discount: RATE_OR_DISCOUNT.find((kind) => kind === rule.rate_or_discount) ?? 'Discount Percentage',
  value: String(resultOf(rule)),
});

// What each Apply On's rows pick from, and how its one result field reads.
const TARGET = { 'Item Code': 'Item', 'Item Group': 'Item Group', Brand: 'Brand' };
const RESULT = {
  Rate: { label: 'Rate', hint: 'What one stock unit sells for under the rule' },
  'Discount Percentage': { label: 'Discount (%)', hint: 'Off the Price List Rate' },
  'Discount Amount': { label: 'Discount Amount', hint: 'Off the Price List Rate of each unit sold' },
};

const saveFailure = (error: Error | null) =>
  postgrestError(error)?.code === '23505' ? 'There is already a pricing rule with this title.' : failureMessage("Couldn't save this pricing rule. Try again.");

// Only a sale's line names a rule (pos_invoice_items_pricing_rule_fk); its own rows go with it.
const deleteFailure = (cause: Error | null) =>
  postgrestError(cause)?.code === '23503' ? 'It has priced a sale, so it stays. Disable it instead.' : failureMessage("Couldn't delete this pricing rule. Try again.");

// Its own component, not inlined in Form: the delete's condition would put Form past fallow's complexity limit.
function RuleHeader({ merchant, existing }: { merchant: Merchant; existing: PricingRule | undefined }) {
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const remove = useDeletePricingRuleMutation();

  return (
    <RecordPageHeader
      kicker="Pricing Rule"
      title={existing?.title ?? 'New Pricing Rule'}
      remove={
        existing && can(permissions, 'Pricing Rule', 'delete')
          ? {
              title: `Delete ${existing.title}?`,
              body: 'Its rows go with it. A rule that has priced a sale cannot be deleted — disable it instead.',
              run: () => remove.mutateAsync(existing.id),
              failure: deleteFailure,
            }
          : undefined
      }
    />
  );
}

/** What a rule's rows pick from, for the kind its Apply On names. A disabled item stays listed where it is saved. */
function targetOptions(kind: PricingRuleValues['apply_on'], records: Records, keep: Set<string>) {
  if (kind === 'Item Group') return records.groups.map((group) => ({ value: group.id, label: group.item_group_name, hint: group.is_group ? 'Group' : undefined }));
  if (kind === 'Brand') return records.brands.map((brand) => ({ value: brand.id, label: brand.brand }));
  return records.items.filter((item) => !item.disabled || keep.has(item.id)).map((item) => ({ value: item.id, label: itemLabel(item) }));
}

function Form({ merchant, records, existing }: { merchant: Merchant; records: Records; existing: PricingRule | undefined }) {
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const editable = can(permissions, 'Pricing Rule', existing ? 'write' : 'create');
  const save = useSavePricingRuleMutation({ merchantId: merchant.id, ruleId: existing?.id });

  const { control, handleSubmit, formState } = useForm<PricingRuleValues>({
    resolver: zodResolver(pricingRuleSchema),
    defaultValues: existing ? saved(existing) : BLANK,
    mode: 'onTouched',
  });
  const targets = useFieldArray({ control, name: 'targets' });
  const applyOn = useWatch({ control, name: 'apply_on' });
  const result = RESULT[useWatch({ control, name: 'rate_or_discount' })];
  // That the rule applies on nothing is said under Save once it has been tried, not while the page is still empty.
  const gap = targetsGap(useWatch({ control, name: 'targets' }));

  // Made per render, not per tap: saveOnce's guard is the handler two quick taps share.
  const send = saveOnce(save, () => router.back());
  const submit = handleSubmit((values) => {
    if (!targetsGap(values.targets)) send(values);
  });

  const options = targetOptions(applyOn, records, new Set(existing?.pricing_rule_targets.map(targetOf)));

  return (
    <View style={styles.fill}>
      <RuleHeader merchant={merchant} existing={existing} />
      <PageForm
        editable={editable}
        readOnly="Changing it needs Pricing Rule write."
        notice={mutationNotice(save, saveFailure(save.error), formState.isSubmitted ? gap : null)}
        mutation={save}
        // A rule not yet saved always has something to check: Save names what is missing.
        dirty={!existing || formState.isDirty}
        onSave={submit}
      >
        <FieldGrid>
          <ControlledText control={control} name="title" label="Title" required span="full" placeholder="e.g. Coffee, 10% from 2" maxLength={140} disabled={!editable} />
          <ControlledSelect
            control={control}
            name="apply_on"
            label="Apply On"
            required
            hint="What the rule is looked up by. An item's own rule wins over its group's, then its brand's"
            title="Apply On"
            options={APPLY_ON.map((kind) => ({ value: kind, label: kind }))}
            // The rows are of the kind picked: another kind starts from none.
            onPicked={() => targets.replace([])}
            disabled={!editable}
          />
          <ControlledText
            control={control}
            name="priority"
            label="Priority"
            required
            hint="When two rules of one kind fit a line, the lower number wins. 1 is the highest"
            placeholder="1"
            keyboardType="number-pad"
            maxLength={4}
            disabled={!editable}
          />
          {existing ? <ControlledSwitch control={control} name="disable" label="Disable" on="Applies to no sale" off="Applies where it fits" disabled={!editable} /> : null}
        </FieldGrid>

        <SectionHeading title={`${TARGET[applyOn]}s`} hint={applyOn === 'Item Group' ? 'What the rule applies on. A group brings the groups under it' : 'What the rule applies on'} />
        <RepeatableList
          fields={targets.fields}
          editable={editable}
          empty="Nothing listed yet. Add at least one."
          addLabel={`Add ${TARGET[applyOn]}`}
          onAdd={() => targets.append({ target: '' })}
          onRemove={targets.remove}
        >
          {(index) => (
            <FieldGrid>
              <ControlledSelect control={control} name={`targets.${index}.target`} label={TARGET[applyOn]} required span="full" title={TARGET[applyOn]} options={options} disabled={!editable} />
            </FieldGrid>
          )}
        </RepeatableList>

        <SectionHeading title="Conditions" hint="A line takes the rule only inside these. Empty: no limit" />
        <FieldGrid>
          <ControlledText control={control} name="min_qty" label="Min Qty" hint="In the item's stock unit" placeholder="0" keyboardType="decimal-pad" maxLength={14} disabled={!editable} />
          <ControlledText control={control} name="max_qty" label="Max Qty" hint="In the item's stock unit" placeholder="No limit" keyboardType="decimal-pad" maxLength={14} disabled={!editable} />
          <ControlledText control={control} name="min_amt" label="Min Amt" hint="Quantity × Price List Rate" placeholder="0" keyboardType="decimal-pad" maxLength={14} disabled={!editable} />
          <ControlledText control={control} name="max_amt" label="Max Amt" hint="Quantity × Price List Rate" placeholder="No limit" keyboardType="decimal-pad" maxLength={14} disabled={!editable} />
          <ControlledDate control={control} name="valid_from" label="Valid From" hint="Blank: from the start" clearable disabled={!editable} />
          <ControlledDate control={control} name="valid_upto" label="Valid Upto" hint="Blank: no end" clearable disabled={!editable} />
          <ControlledSelect
            control={control}
            name="for_price_list"
            label="For Price List"
            hint="None: sales on any price list"
            title="For Price List"
            options={priceListOptions(records.priceLists, existing?.for_price_list)}
            disabled={!editable}
          />
        </FieldGrid>

        <SectionHeading title="Price or Discount" hint="What a line that takes the rule sells for" />
        <FieldGrid>
          <ControlledSelect
            control={control}
            name="rate_or_discount"
            label="Rate or Discount"
            required
            title="Rate or Discount"
            options={RATE_OR_DISCOUNT.map((kind) => ({ value: kind, label: kind }))}
            disabled={!editable}
          />
          <ControlledText control={control} name="value" label={result.label} required hint={result.hint} placeholder="0" keyboardType="decimal-pad" maxLength={14} disabled={!editable} />
        </FieldGrid>
      </PageForm>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
