import { Controller, useFormContext, useWatch } from 'react-hook-form';

import { MenuSelect } from '../../../components/MenuSelect';
import { CategoryPicker } from '../../categories/CategoryPicker';
import { useCategoriesQuery } from '../../categories/queries';
import { STATUS_META, generateSku, productStatus } from '../schema';
import type { ProductFormValues } from '../schema';
import { Field, FieldGrid, TagsField, TextField, SegmentedField, ToggleField } from './fields';

const STATUS_OPTIONS = productStatus.options.map((status) => ({ value: status, label: STATUS_META[status].label }));

export function GeneralSection({ merchantId }: { merchantId: string }) {
  const { control, setValue } = useFormContext<ProductFormValues>();
  const categories = useCategoriesQuery({ merchantId });
  const [type, categoryId] = useWatch({ control, name: ['type', 'categoryId'] });
  const categoryName = categories.data?.find((category) => category.id === categoryId)?.name ?? '';

  return (
    <FieldGrid>
      <TextField name="name" label="Product name" required span="full" placeholder="e.g. Iced Americano 16oz" />

      <Controller
        control={control}
        name="categoryId"
        render={({ field, fieldState }) => (
          <Field label="Category" required error={fieldState.error?.message}>
            <CategoryPicker
              merchantId={merchantId}
              parentId={null}
              value={field.value}
              onChange={(id) => {
                field.onChange(id);
                field.onBlur();
                // A subcategory belongs to one category; switching category drops it.
                setValue('subcategoryId', '', { shouldDirty: true });
              }}
              accessibilityLabel="Category"
              error={!!fieldState.error}
            />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="subcategoryId"
        render={({ field }) => (
          <Field label="Subcategory">
            {categoryId === '' ? (
              <MenuSelect
                value=""
                options={[]}
                onChange={() => undefined}
                placeholder="Pick a category first"
                accessibilityLabel="Subcategory"
                disabled
              />
            ) : (
              <CategoryPicker
                merchantId={merchantId}
                parentId={categoryId}
                value={field.value}
                onChange={field.onChange}
                accessibilityLabel="Subcategory"
                clearable
              />
            )}
          </Field>
        )}
      />

      <TextField
        name="sku"
        label="SKU"
        placeholder="e.g. STK-BEV-4K2Q"
        autoCapitalize="characters"
        action={{
          label: 'Auto-generate',
          onPress: () => setValue('sku', generateSku(type, categoryName), { shouldDirty: true, shouldValidate: true }),
        }}
      />
      {/* Scanning is not built yet (the human's scope note); the action renders inert. */}
      <TextField
        name="barcode"
        label="Barcode"
        placeholder="EAN, UPC or your own code"
        keyboardType="number-pad"
        action={{ label: 'Scan' }}
      />

      <TextField name="description" label="Description" span="full" multiline placeholder="What a cashier or customer should know" />
      <TagsField name="tags" label="Tags" span="full" placeholder="Add a tag and press enter" hint="Search and filtering" />

      <SegmentedField name="status" label="Status" span="full" options={STATUS_OPTIONS} />
      <ToggleField
        name="soldDirectly"
        label="Sold directly"
        span="full"
        on="Sold on its own at the register."
        off="Not sold on its own — only as part of a bundle or recipe."
      />
    </FieldGrid>
  );
}
