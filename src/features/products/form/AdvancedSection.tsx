import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { CUSTOM_FIELD_KIND_LABELS, customFieldKind } from '../schema';
import type { ProductFormValues } from '../schema';
import { AddButton, DateField, FieldGrid, RepeatRow, SegmentedField, SelectField, TextField } from './fields';

const KIND_OPTIONS = customFieldKind.options.map((kind) => ({ value: kind, label: CUSTOM_FIELD_KIND_LABELS[kind] }));
const YES_NO = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

export function AdvancedSection() {
  const { control } = useFormContext<ProductFormValues>();
  const customFields = useFieldArray({ control, name: 'customFields' });
  const rows = useWatch({ control, name: 'customFields' });

  return (
    <FieldGrid>
      <View style={styles.full}>
        <Text variant="titleMedium">Custom fields</Text>
        <View style={styles.rows}>
          {customFields.fields.map((row, index) => {
            const kind = rows[index]?.kind ?? 'text';

            return (
              <RepeatRow key={row.id} removeLabel="Remove field" onRemove={() => customFields.remove(index)}>
                <FieldGrid>
                  <TextField name={`customFields.${index}.label`} label="Label" required placeholder="e.g. Origin" />
                  <SelectField name={`customFields.${index}.kind`} label="Kind" options={KIND_OPTIONS} />
                  {kind === 'date' ? (
                    <DateField name={`customFields.${index}.value`} label="Value" mode="date" span="full" />
                  ) : kind === 'boolean' ? (
                    <SegmentedField name={`customFields.${index}.value`} label="Value" span="full" options={YES_NO} />
                  ) : (
                    <TextField
                      name={`customFields.${index}.value`}
                      label="Value"
                      span="full"
                      keyboardType={kind === 'number' ? 'decimal-pad' : 'default'}
                      placeholder={kind === 'number' ? '0' : 'e.g. Batangas'}
                    />
                  )}
                </FieldGrid>
              </RepeatRow>
            );
          })}
        </View>
        <AddButton label="Add field" onPress={() => customFields.append({ label: '', kind: 'text', value: '' })} />
      </View>

      <TextField
        name="internalNotes"
        label="Internal notes"
        hint="Staff only, never printed"
        span="full"
        multiline
        placeholder="Anything the team should know"
      />
    </FieldGrid>
  );
}

const styles = StyleSheet.create({
  full: { flexBasis: '100%', gap: 8 },
  rows: { gap: 8 },
});
