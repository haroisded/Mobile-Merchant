import { useController, useFormContext, useFormState, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { HelperText } from '../../../components/helper-text';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { DURATION_MODE_LABELS, UNIT_META, WEEKDAYS, durationMode } from '../../../features/products/schema';
import type { MeasureUnit, ProductFormValues } from '../../../features/products/schema';
import { useShellWide } from '../../../lib/columns';
import { useAppTheme } from '../../../lib/theme';
import { spacing } from '../../../themes';
import {
  DateField,
  DateListField,
  DateTimeInput,
  Field,
  FieldGrid,
  GroupHeading,
  SegmentedField,
  SelectField,
  TextField,
  ToggleField,
} from '../fields';

const DURATION_OPTIONS = durationMode.options.map((mode) => ({ value: mode, label: DURATION_MODE_LABELS[mode] }));

// Durations are measured in time, so the stock units (kg, box…) are not offered.
const TIME_UNITS: MeasureUnit[] = ['minute', 'hour', 'day', 'week', 'month', 'night', 'session'];
const TIME_UNIT_OPTIONS = TIME_UNITS.map((unit) => ({ value: unit, label: UNIT_META[unit].label }));

export function AvailabilitySection() {
  const { control } = useFormContext<ProductFormValues>();
  const type = useWatch({ control, name: 'type' });
  const bookable = type === 'bookable';

  return (
    <FieldGrid>
      <TextField
        name="totalUnits"
        label={bookable ? 'Units' : 'Units owned'}
        hint={bookable ? 'Rooms, seats or slots' : 'How many can be out at once'}
        required
        keyboardType="number-pad"
        placeholder="0"
      />
      {bookable ? (
        <TextField name="capacityPerUnit" label="Capacity per unit" hint="People per room or slot" keyboardType="number-pad" placeholder="1" />
      ) : null}

      <SegmentedField name="durationMode" label="Duration" span="full" options={DURATION_OPTIONS} />
      <DateField name="defaultStartTime" label="Default start" mode="time" />
      <DateField name="defaultEndTime" label="Default end" mode="time" />

      <TextField name="minDuration" label="Minimum duration" keyboardType="decimal-pad" placeholder="None" />
      <SelectField name="minDurationUnit" label="Minimum in" options={TIME_UNIT_OPTIONS} clearable placeholder="Unit" />
      <TextField name="maxDuration" label="Maximum duration" keyboardType="decimal-pad" placeholder="None" />
      <SelectField name="maxDurationUnit" label="Maximum in" options={TIME_UNIT_OPTIONS} clearable placeholder="Unit" />

      <TextField name="bufferMinutes" label="Buffer between bookings" keyboardType="number-pad" suffix="min" placeholder="0" />
      <TextField name="advanceWindowDays" label="Bookable ahead" keyboardType="number-pad" suffix="days" placeholder="No limit" />

      <GroupHeading title="Operating hours" />
      <WeeklyHours />

      <GroupHeading title="Blackout dates" />
      <DateListField name="blackoutDates" label="Closed on" span="full" addLabel="Add date" />

      {bookable ? (
        <ToggleField
          name="overbookingAllowed"
          label="Overbooking"
          span="full"
          on="Bookings may exceed the units available."
          off="Bookings stop when every unit is taken."
        />
      ) : null}
    </FieldGrid>
  );
}

/**
 * The weekly hours editor (instruction_mds/visual-language.md §5): one row per weekday, a switch for open, and
 * opening and closing times while open. The form holds only the open days — the same rows
 * product_operating_hours stores — so a closed day is the absence of a row.
 */
function WeeklyHours() {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const { control } = useFormContext<ProductFormValues>();
  const { field } = useController({ control, name: 'operatingHours' });
  const { errors } = useFormState({ control, name: 'operatingHours' });
  const hours = field.value;

  return (
    <Field label="Open" span="full" hint="No open days means any time">
      <View style={styles.week}>
        {WEEKDAYS.map((day, weekday) => {
          const index = hours.findIndex((entry) => entry.weekday === weekday);
          const entry = index >= 0 ? hours[index] : undefined;
          const error = index >= 0 ? errors.operatingHours?.[index]?.closes?.message : undefined;

          const setOpen = (open: boolean) =>
            field.onChange(
              open
                ? [...hours, { weekday, opens: '09:00', closes: '17:00' }].sort((a, b) => a.weekday - b.weekday)
                : hours.filter((other) => other.weekday !== weekday)
            );
          const update = (patch: { opens?: string; closes?: string }) =>
            field.onChange(hours.map((other) => (other.weekday === weekday ? { ...other, ...patch } : other)));

          return (
            <View key={day} style={[styles.day, { borderBottomColor: colors.surfaceVariant }]}>
              <View style={[styles.dayHead, wide && styles.dayHeadWide]}>
                <Switch value={!!entry} onValueChange={setOpen} color={colors.accent} accessibilityLabel={`Open on ${day}`} />
                <Text variant="titleMedium" style={styles.dayName}>
                  {day}
                </Text>
                {entry ? null : (
                  <Text variant="bodySmall" style={{ color: colors.onSurfaceFaint }}>
                    Closed
                  </Text>
                )}
              </View>
              {entry ? (
                <View style={[styles.times, wide && styles.timesWide]}>
                  <View style={styles.time}>
                    <DateTimeInput
                      mode="time"
                      value={entry.opens}
                      onChange={(opens) => update({ opens })}
                      placeholder="Opens"
                      accessibilityLabel={`${day} opens`}
                    />
                  </View>
                  <Text variant="bodySmall">to</Text>
                  <View style={styles.time}>
                    <DateTimeInput
                      mode="time"
                      value={entry.closes}
                      onChange={(closes) => update({ closes })}
                      placeholder="Closes"
                      accessibilityLabel={`${day} closes`}
                      error={!!error}
                    />
                  </View>
                </View>
              ) : null}
              {error ? (
                <HelperText type="error" padding="none">
                  {error}
                </HelperText>
              ) : null}
            </View>
          );
        })}
      </View>
    </Field>
  );
}

const styles = StyleSheet.create({
  week: { gap: 0 },
  day: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.ms,
    rowGap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, flexBasis: '100%' },
  dayHeadWide: { flexBasis: 'auto', width: 160 },
  dayName: { minWidth: 36 },
  times: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexBasis: '100%' },
  timesWide: { flexBasis: 'auto', flexGrow: 1 },
  time: { flex: 1, maxWidth: 160 },
});
