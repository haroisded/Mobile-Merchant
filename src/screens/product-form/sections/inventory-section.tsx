import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { NoteCallout } from '../../../components/note-callout';
import { UNIT_META } from '../../../features/products/schema';
import type { MeasureUnit, ProductFormValues } from '../../../features/products/schema';
import { DateField, Field, FieldGrid, GroupHeading, SelectField, TextField, ToggleField, unitOptions } from '../fields';
import { SupplierPicker } from '../supplier-picker';

export function InventorySection({ merchantId, units }: { merchantId: string; units: MeasureUnit[] }) {
  const { control } = useFormContext<ProductFormValues>();
  const [uom, trackInventory, perishable, hasVariants, purchaseUnit, usageUnit] = useWatch({
    control,
    name: ['uom', 'trackInventory', 'perishable', 'hasVariants', 'purchaseUnit', 'usageUnit'],
  });
  const unit = uom === '' ? undefined : UNIT_META[uom].short;

  return (
    <FieldGrid>
      <SelectField name="uom" label="Unit of measure" required options={unitOptions(units)} placeholder="Select unit" />
      <ToggleField name="trackInventory" label="Track inventory" on="Stock is counted and deducted." off="Stock is not counted." />

      {trackInventory ? (
        <>
          {hasVariants ? (
            <View style={styles.full}>
              <NoteCallout>This product has variants. Each variant keeps its own quantity in the Variants section; the figure here is stock not tied to a variant.</NoteCallout>
            </View>
          ) : null}
          <TextField name="qtyOnHand" label="Quantity on hand" keyboardType="decimal-pad" suffix={unit} placeholder="0" />
          <TextField name="maxStock" label="Maximum stock" keyboardType="decimal-pad" suffix={unit} placeholder="No limit" />

          <GroupHeading title="Reorder" />
          <TextField
            name="reorderThreshold"
            label="Reorder at"
            hint="Low-stock alert"
            keyboardType="decimal-pad"
            suffix={unit}
            placeholder="0"
          />
          <TextField name="reorderQty" label="Reorder quantity" keyboardType="decimal-pad" suffix={unit} placeholder="0" />
        </>
      ) : null}

      <TextField name="storageLocation" label="Storage location" span="full" placeholder="e.g. Back room, shelf B2" />

      <GroupHeading title="Supplier" />
      <Controller
        control={control}
        name="supplierId"
        render={({ field }) => (
          <Field label="Supplier">
            <SupplierPicker merchantId={merchantId} value={field.value} onChange={field.onChange} accessibilityLabel="Supplier" />
          </Field>
        )}
      />
      <TextField name="supplierItemCode" label="Supplier item code" placeholder="Their code for it" />
      <TextField name="leadTimeDays" label="Lead time" keyboardType="number-pad" suffix="days" placeholder="0" />

      <GroupHeading title="Tracking" />
      <ToggleField name="batchTracking" label="Batch tracking" on="Stock is received and counted in batches." off="No batches." />
      <ToggleField name="perishable" label="Perishable" on="It expires." off="It does not expire." />
      {perishable ? (
        <>
          <TextField name="shelfLifeDays" label="Shelf life" keyboardType="number-pad" suffix="days" placeholder="0" />
          <DateField name="expiryDate" label="Expiry date" mode="date" />
          <TextField name="expiryAlertDays" label="Alert before expiry" keyboardType="number-pad" suffix="days" placeholder="0" />
        </>
      ) : null}

      <GroupHeading title="Units" />
      <SelectField name="purchaseUnit" label="Bought in" options={unitOptions(units)} clearable placeholder="Same as unit" />
      <SelectField name="usageUnit" label="Used in" options={unitOptions(units)} clearable placeholder="Same as unit" />
      <TextField
        name="conversionFactor"
        label="Conversion"
        hint={
          purchaseUnit !== '' && usageUnit !== ''
            ? `${UNIT_META[usageUnit].short} per ${UNIT_META[purchaseUnit].short}`
            : 'Usage units per purchase unit'
        }
        keyboardType="decimal-pad"
        placeholder="e.g. 24"
      />
    </FieldGrid>
  );
}

const styles = StyleSheet.create({
  full: { flexBasis: '100%' },
});
