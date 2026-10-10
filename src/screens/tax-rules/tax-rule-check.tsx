import { useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { AdaptiveDialog } from '../../components/adaptive-dialog';
import { Button } from '../../components/button';
import { ControlledDate, Field, FieldGrid } from '../../components/form-fields';
import { ControlledSelect } from '../../components/search-select';
import { Text } from '../../components/text';
import { itemGroupOptions } from '../../features/item-groups/queries';
import { ruleDates } from '../../features/tax-rules/queries';
import { resolveTaxRule } from '../../features/tax-rules/resolve';
import { todayDate } from '../../lib/dates';
import { useAppTheme } from '../../lib/theme';
import { pathTo } from '../../lib/tree';
import { radius, spacing } from '../../themes';
import { useTaxRuleRecords } from './records';
import type { TaxRuleRecords } from './records';

type Sample = { tax_category_id: string; item_group_id: string; date: string };

/**
 * Which Template?: a sample sale — a tax category, an item group, a date — run through the Tax Rules as a sale
 * will be (resolve.ts), with the template it gets and the rule that chose it. Nothing is saved: the fields are
 * a local form. The body of src/app/(app)/forms/tax-rule-check.tsx (page narrow, Dialog wide).
 */
export function TaxRuleCheck({ merchantId, onDismiss }: { merchantId: string; onDismiss: () => void }) {
  const records = useTaxRuleRecords({ merchantId });
  return records ? <Check records={records} onDismiss={onDismiss} /> : null;
}

function Check({ records, onDismiss }: { records: TaxRuleRecords; onDismiss: () => void }) {
  const { colors } = useAppTheme();
  const { control } = useForm<Sample>({ defaultValues: { tax_category_id: '', item_group_id: '', date: todayDate() } });
  const sample = useWatch({ control });
  const result = answer(records, sample);

  return (
    <AdaptiveDialog
      asPage
      onDismiss={onDismiss}
      kicker="Tax Rules"
      title="Which template?"
      actions={
        <Button mode="outlined" onPress={onDismiss} contentStyle={styles.action}>
          Close
        </Button>
      }
    >
      <FieldGrid>
        <ControlledSelect
          control={control}
          name="tax_category_id"
          label="Tax Category"
          title="Tax Category"
          options={[{ value: '', label: 'None' }, ...records.categories.map((category) => ({ value: category.id, label: category.title }))]}
        />
        <ControlledSelect control={control} name="item_group_id" label="Item Group" title="Item Group" options={itemGroupOptions(records.groups)} />
        <ControlledDate control={control} name="date" label="Sale Date" />
        <Field label="The sale takes" span="full">
          <View style={[styles.result, { borderColor: colors.outlineVariant }]}>
            <Text variant="titleMedium">{result.title}</Text>
            <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
              {result.why}
            </Text>
          </View>
        </Field>
      </FieldGrid>
    </AdaptiveDialog>
  );
}

/** The template the sample sale gets, and why — the rule that chose it, or what happens with none. */
function answer({ rules, templates, categories, groups }: TaxRuleRecords, sample: Partial<Sample>) {
  const disabled = new Set(templates.filter((template) => template.disabled).map((template) => template.id));
  const rule = resolveTaxRule(
    rules,
    {
      taxCategoryId: sample.tax_category_id || null,
      itemGroupIds: pathTo(groups, sample.item_group_id || undefined).map((group) => group.id),
      date: sample.date || todayDate(),
    },
    disabled
  );

  if (!rule) {
    const fallback = templates.find((template) => template.is_default && !template.disabled);
    return { title: 'No rule', why: `No rule matches: the sale keeps its POS Profile's template, or the default${fallback ? `, ${fallback.title}` : ''}.` };
  }

  const category = rule.tax_category_id ? `for ${categories.find((candidate) => candidate.id === rule.tax_category_id)?.title ?? '…'}` : null;
  const group = rule.item_group_id ? `on ${groups.find((candidate) => candidate.id === rule.item_group_id)?.item_group_name ?? '…'}` : null;
  const conditions = [category, group].filter((part) => part !== null).join(' ') || 'for every sale';
  // "always", "from 1 Jul 2026": only the leading word is lowered, never a month name.
  const dates = ruleDates(rule).replace(/^[A-Z]/, (first) => first.toLowerCase());
  return {
    title: templates.find((template) => template.id === rule.sales_tax_template_id)?.title ?? '…',
    why: `Chosen by the rule ${conditions}, ${dates}, priority ${rule.priority}.`,
  };
}

const styles = StyleSheet.create({
  action: { justifyContent: 'flex-start' },
  result: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.ms, gap: spacing.xs },
});
