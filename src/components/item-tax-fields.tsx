import type { Control, FieldPathByValue, FieldValues } from 'react-hook-form';

import { useItemTaxTemplatesQuery } from '../features/item-tax-templates/queries';
import type { ItemTaxTemplate } from '../features/item-tax-templates/queries';
import { useTaxCategoriesQuery } from '../features/tax-categories/queries';
import type { TaxCategory } from '../features/tax-categories/queries';
import { ControlledDate } from './form-fields';
import { ControlledSelect } from './search-select';

export type ItemTaxRecords = { itemTemplates: ItemTaxTemplate[]; categories: TaxCategory[] };

/** The masters an Item Tax row picks from; undefined until both have loaded. */
export function useItemTaxRecords(merchantId: string): ItemTaxRecords | undefined {
  const itemTemplates = useItemTaxTemplatesQuery({ merchantId }).data;
  const categories = useTaxCategoriesQuery({ merchantId }).data;

  return itemTemplates && categories ? { itemTemplates, categories } : undefined;
}

type Props<T extends FieldValues> = {
  control: Control<T>;
  /** The row's field for each value. */
  names: Record<'template' | 'category' | 'validFrom', FieldPathByValue<T, string>>;
  /** The row as it stands: a template or category it names stays listed once disabled. */
  row: { item_tax_template_id: string; tax_category_id: string };
  records: ItemTaxRecords;
  disabled: boolean;
};

/**
 * One Item Tax row's fields, as an Item and an Item Group both keep them (docs.frappe.io/erpnext/item 3.16,
 * /item-group 2.3): the Item Tax Template, and the tax category and date it applies for. Laid out by the
 * caller's FieldGrid, which may add fields of its own after them.
 */
export function ItemTaxFields<T extends FieldValues>({ control, names, row, records, disabled }: Props<T>) {
  const templates = records.itemTemplates
    .filter((template) => !template.disabled || template.id === row.item_tax_template_id)
    .map((template) => ({ value: template.id, label: template.title }));
  const categories = [
    { value: '', label: 'Any' },
    ...records.categories.filter((category) => !category.disabled || category.id === row.tax_category_id).map((category) => ({ value: category.id, label: category.title })),
  ];

  return (
    <>
      <ControlledSelect control={control} name={names.template} label="Item Tax Template" required span="full" title="Item Tax Template" options={templates} disabled={disabled} />
      <ControlledSelect control={control} name={names.category} label="Tax Category" title="Tax Category" options={categories} disabled={disabled} />
      <ControlledDate control={control} name={names.validFrom} label="Valid From" hint="Empty: always" clearable disabled={disabled} />
    </>
  );
}
