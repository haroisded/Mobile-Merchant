import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import WheelPicker from '@quidone/react-native-wheel-picker';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useController, useFormContext, useFormState } from 'react-hook-form';
import type { FieldPathByValue } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';
import type { KeyboardTypeOptions } from 'react-native';

import { AdaptiveDialog } from '../../components/adaptive-dialog';
import { Button } from '../../components/button';
import { Chip } from '../../components/chip';
import { HelperText } from '../../components/helper-text';
import { IconButton } from '../../components/icon-button';
import { MenuSelect } from '../../components/menu-select';
import type { SelectOption } from '../../components/menu-select';
import { SegmentedButtons } from '../../components/segmented-buttons';
import { Switch } from '../../components/switch';
import { Text } from '../../components/text';
import { TextInput } from '../../components/text-input';
import { UNIT_META, measureUnit } from '../../features/products/schema';
import type { MeasureUnit, ProductFormValues } from '../../features/products/schema';
import { useShellWide } from '../../lib/columns';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';

// The form's building blocks, one per pattern in instruction_mds/visual-language.md §5 "Forms". Every field
// reads the form through useFormContext, so a section passes a path and nothing else — and the path
// types below make a misspelt or wrongly typed path a compile error at the section.

type StringPath = FieldPathByValue<ProductFormValues, string>;
type BooleanPath = FieldPathByValue<ProductFormValues, boolean>;
type StringListPath = FieldPathByValue<ProductFormValues, string[]>;
type ArrayPath = 'rateTiers' | 'operatingHours' | 'variantAttributes' | 'components';

/** Every unit. What a bundle's component is counted in, which is the component's own business. */
export const UNIT_OPTIONS: SelectOption[] = measureUnit.options.map((unit) => ({
  value: unit,
  label: UNIT_META[unit].label,
}));

/**
 * The units one Resources screen offers (RESOURCE_META[scope].units). Inventory counts in pieces and
 * kilograms, Rentables in hours and nights; offering all fourteen everywhere is what put `kg` in a
 * room-night's unit list.
 */
export function unitOptions(units: MeasureUnit[]): SelectOption[] {
  return units.map((unit) => ({ value: unit, label: UNIT_META[unit].label }));
}

type Span = 'half' | 'full';

type FieldProps = {
  label: string;
  required?: boolean;
  hint?: string;
  /** An inline field action in the label row ("Auto-generate"). No onPress renders it inert ("Scan"). */
  action?: { label: string; onPress?: () => void };
  /** Half a row on a wide form, the whole row otherwise. */
  span?: Span;
  error?: string;
  children: ReactNode;
};

/** Label row, control, error. Laid out by FieldGrid. */
export function Field({ label, required, hint, action, span = 'half', error, children }: FieldProps) {
  const { colors } = useAppTheme();
  const wide = useShellWide();

  return (
    <View style={wide && span === 'half' ? styles.half : styles.full}>
      <View style={styles.labelRow}>
        <Text variant="labelMedium">
          {label}
          {/* The required mark is one of the accent's places (instruction_mds/visual-language.md §4). */}
          {required ? <Text variant="labelMedium" style={{ color: colors.accent }}> *</Text> : null}
        </Text>
        {action ? (
          <Button
            compact
            mode="text"
            textColor={colors.accent}
            onPress={action.onPress}
            disabled={!action.onPress}
            style={styles.labelAction}
          >
            {action.label}
          </Button>
        ) : hint ? (
          <Text variant="bodySmall" style={[styles.hint, { color: colors.onSurfaceMuted }]}>
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
      {/* Rendered only with an error, so a quiet form does not carry an empty line under every field. */}
      {error ? (
        <HelperText type="error" padding="none">
          {error}
        </HelperText>
      ) : null}
    </View>
  );
}

/** The two-column field grid on a wide form; one column narrow. */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

export function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.heading}>
      <Text variant="headlineSmall">{title}</Text>
      {hint ? (
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** A labelled group inside a section ("Reorder", "Expiry"), with a 1px rule above it. */
export function GroupHeading({ title }: { title: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.group, { borderTopColor: colors.outlineVariant }]}>
      <Text variant="titleMedium">{title}</Text>
    </View>
  );
}

type TextFieldProps = Omit<FieldProps, 'children' | 'error'> & {
  name: StringPath;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  /** Left affix, e.g. the currency symbol. */
  prefix?: string;
  /** Right affix, e.g. a unit. */
  suffix?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
};

export function TextField({
  name,
  placeholder,
  keyboardType,
  multiline,
  prefix,
  suffix,
  autoCapitalize,
  ...field
}: TextFieldProps) {
  const { control } = useFormContext<ProductFormValues>();
  const { field: input, fieldState } = useController({ control, name });

  return (
    <Field {...field} error={fieldState.error?.message}>
      <TextInput
        mode="outlined"
        dense
        value={input.value}
        onChangeText={input.onChange}
        onBlur={input.onBlur}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        numberOfLines={multiline ? 4 : undefined}
        error={!!fieldState.error}
        accessibilityLabel={field.label}
        left={prefix ? <TextInput.Affix text={prefix} /> : undefined}
        right={suffix ? <TextInput.Affix text={suffix} /> : undefined}
      />
    </Field>
  );
}

type SelectFieldProps = Omit<FieldProps, 'children' | 'error'> & {
  name: StringPath;
  options: SelectOption[];
  placeholder?: string;
  /** Offer "no value" as the first option, for a select that is optional. */
  clearable?: boolean;
};

export function SelectField({ name, options, placeholder = 'Select', clearable, ...field }: SelectFieldProps) {
  const { control } = useFormContext<ProductFormValues>();
  const { field: input, fieldState } = useController({ control, name });

  return (
    <Field {...field} error={fieldState.error?.message}>
      <MenuSelect
        value={input.value}
        options={clearable ? [{ value: '', label: 'None' }, ...options] : options}
        onChange={(value) => {
          input.onChange(value);
          input.onBlur();
        }}
        placeholder={placeholder}
        accessibilityLabel={field.label}
        error={!!fieldState.error}
      />
    </Field>
  );
}

type ToggleFieldProps = Omit<FieldProps, 'children' | 'error' | 'action' | 'hint'> & {
  name: BooleanPath;
  /** The sentence beside the switch while on, and while off. */
  on: string;
  off: string;
};

export function ToggleField({ name, on, off, ...field }: ToggleFieldProps) {
  const { colors } = useAppTheme();
  const { control } = useFormContext<ProductFormValues>();
  const { field: input } = useController({ control, name });

  return (
    <Field {...field}>
      <View style={styles.toggleRow}>
        {/* A switch that is on is one of the accent's places (instruction_mds/visual-language.md §4). */}
        <Switch value={input.value} onValueChange={input.onChange} color={colors.accent} accessibilityLabel={field.label} />
        <Text variant="bodyMedium" style={styles.fill}>
          {input.value ? on : off}
        </Text>
      </View>
    </Field>
  );
}

type SegmentedFieldProps = Omit<FieldProps, 'children' | 'error' | 'action'> & {
  name: StringPath;
  options: SelectOption[];
};

export function SegmentedField({ name, options, ...field }: SegmentedFieldProps) {
  const { control } = useFormContext<ProductFormValues>();
  const { field: input, fieldState } = useController({ control, name });

  return (
    <Field {...field} error={fieldState.error?.message}>
      <SegmentedButtons
        density="small"
        value={input.value}
        onValueChange={input.onChange}
        buttons={options.map((option) => ({ value: option.value, label: option.label }))}
      />
    </Field>
  );
}

type TagsFieldProps = Omit<FieldProps, 'children' | 'error' | 'action'> & {
  name: StringListPath;
  placeholder: string;
};

/** Chips in a wrapping row over an input that adds one on submit or on the plus. */
export function TagsField({ name, placeholder, ...field }: TagsFieldProps) {
  const { control } = useFormContext<ProductFormValues>();
  const { field: input, fieldState } = useController({ control, name });
  const [draft, setDraft] = useState('');

  const add = () => {
    const tag = draft.trim();
    if (tag !== '' && !input.value.includes(tag)) input.onChange([...input.value, tag]);
    setDraft('');
  };

  return (
    <Field {...field} error={fieldState.error?.message}>
      {input.value.length > 0 ? (
        <View style={styles.chips}>
          {input.value.map((tag) => (
            <Chip
              key={tag}
              compact
              closeIcon="close"
              onClose={() => input.onChange(input.value.filter((other) => other !== tag))}
              // On the close icon, the control that removes it. On the chip itself it would name a
              // body that does nothing, and the real control would be announced as "Close".
              closeIconAccessibilityLabel={`Remove ${tag}`}
            >
              {tag}
            </Chip>
          ))}
        </View>
      ) : null}
      <TextInput
        mode="outlined"
        dense
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={add}
        submitBehavior="submit"
        placeholder={placeholder}
        accessibilityLabel={field.label}
        right={<TextInput.Icon icon="add" onPress={add} accessibilityLabel={`Add to ${field.label}`} />}
      />
    </Field>
  );
}

// ---------------------------------------------------------------------------------------------------
// Dates and times. Held in the form as "YYYY-MM-DD" and "HH:MM" — the shapes Postgres `date` and
// `time` accept — and converted to a local Date only for the picker.
// ---------------------------------------------------------------------------------------------------

type PickerMode = 'date' | 'time';

const pad = (value: number) => String(value).padStart(2, '0');

function formatPicked(date: Date, mode: PickerMode) {
  return mode === 'date'
    ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toPickerDate(value: string, mode: PickerMode) {
  const now = new Date();
  if (value === '') return now;
  // Built from local parts: new Date("2026-09-14") parses as UTC midnight and shows the day before
  // anywhere west of Greenwich.
  return mode === 'date'
    ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
    : new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(value.slice(0, 2)), Number(value.slice(3, 5)));
}

/** "14 Sep 2026" for a stored date. */
export function displayDate(value: string) {
  return toPickerDate(value, 'date').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * "2:30 PM" for a stored "14:30". Times are held 24-hour because that is what Postgres `time` takes;
 * nobody running a till reads 14:30, so every time a merchant sees is 12-hour.
 */
export function displayTime(value: string) {
  if (value === '') return '';
  const hour24 = Number(value.slice(0, 2));
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour}:${value.slice(3, 5)} ${hour24 < 12 ? 'AM' : 'PM'}`;
}

// ---------------------------------------------------------------------------------------------------
// The time wheel
// ---------------------------------------------------------------------------------------------------

const HOUR_ITEMS = Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: String(index + 1) }));
const MINUTE_ITEMS = Array.from({ length: 60 }, (_, index) => ({ value: index, label: pad(index) }));
const MERIDIEM_ITEMS = [
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
];

type Meridiem = 'AM' | 'PM';

function splitTime(value: string) {
  const hour24 = value === '' ? new Date().getHours() : Number(value.slice(0, 2));
  const minute = value === '' ? 0 : Number(value.slice(3, 5));
  const meridiem: Meridiem = hour24 < 12 ? 'AM' : 'PM';
  return { hour: hour24 % 12 === 0 ? 12 : hour24 % 12, minute, meridiem };
}

function joinTime(hour: number, minute: number, meridiem: Meridiem) {
  const hour24 = meridiem === 'AM' ? (hour === 12 ? 0 : hour) : hour === 12 ? 12 : hour + 12;
  return `${pad(hour24)}:${pad(minute)}`;
}

/**
 * Hour, minute and AM/PM as three wheels, the same control on both platforms.
 *
 * Neither native picker can do this: iOS has the wheel but no 12-hour mode without the OS locale
 * saying so, and Android's Material 3 clock dial has no wheel at all (@expo/ui's own note on
 * `display: 'spinner'` — on Android it is a text input). `@quidone/react-native-wheel-picker` is
 * plain JavaScript on Reanimated, both already here, so this needed no native rebuild.
 *
 * `itemTextStyle` carries colour only — the wheel sizes its own rows, like every other native-ish
 * control whose colours are props (instruction_mds/visual-language.md §5).
 */
function TimeWheel({ value, onPick, onClose }: Omit<PickerProps, 'mode'>) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const start = splitTime(value);
  const [hour, setHour] = useState(start.hour);
  const [minute, setMinute] = useState(start.minute);
  const [meridiem, setMeridiem] = useState<Meridiem>(start.meridiem);

  return (
    <AdaptiveDialog
      wide={wide}
      onDismiss={onClose}
      title="Pick a time"
      actions={
        <>
          <Button onPress={onClose}>Cancel</Button>
          <Button
            mode="contained"
            onPress={() => {
              onPick(joinTime(hour, minute, meridiem));
              onClose();
            }}
          >
            Done
          </Button>
        </>
      }
    >
      <View style={styles.wheels}>
        <WheelPicker
          data={HOUR_ITEMS}
          value={hour}
          onValueChanged={({ item }) => setHour(item.value)}
          itemTextStyle={{ color: colors.onSurface }}
          overlayItemStyle={{ backgroundColor: colors.surfaceMuted }}
          width={72}
          testID="time-hour"
        />
        <WheelPicker
          data={MINUTE_ITEMS}
          value={minute}
          onValueChanged={({ item }) => setMinute(item.value)}
          itemTextStyle={{ color: colors.onSurface }}
          overlayItemStyle={{ backgroundColor: colors.surfaceMuted }}
          width={72}
          testID="time-minute"
        />
        <WheelPicker
          data={MERIDIEM_ITEMS}
          value={meridiem}
          // The wheel's value type is the item's, so this is already 'AM' | 'PM'.
          onValueChanged={({ item }) => setMeridiem(item.value === 'PM' ? 'PM' : 'AM')}
          itemTextStyle={{ color: colors.onSurface }}
          overlayItemStyle={{ backgroundColor: colors.surfaceMuted }}
          width={80}
          testID="time-meridiem"
        />
      </View>
    </AdaptiveDialog>
  );
}

type PickerProps = {
  mode: PickerMode;
  value: string;
  onPick: (value: string) => void;
  onClose: () => void;
};

/**
 * A date or a time, mounted only while open. A time is the wheel above, the same on both platforms; a
 * date is the platform's own picker — Android shows its Material dialog and closes it itself, and iOS
 * has no dialog presentation, so the inline picker sits in the adaptive dialog with Done.
 */
function Picker({ mode, value, onPick, onClose }: PickerProps) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const [draft, setDraft] = useState(() => toPickerDate(value, mode));

  if (mode === 'time') {
    return <TimeWheel value={value} onPick={onPick} onClose={onClose} />;
  }

  if (process.env.EXPO_OS === 'android') {
    return (
      <DateTimePicker
        value={draft}
        mode={mode}
        presentation="dialog"
        is24Hour
        accentColor={colors.accent}
        onValueChange={(_event, date) => {
          onPick(formatPicked(date, mode));
          onClose();
        }}
        onDismiss={onClose}
      />
    );
  }

  return (
    <AdaptiveDialog
      wide={wide}
      onDismiss={onClose}
      title={mode === 'date' ? 'Pick a date' : 'Pick a time'}
      actions={
        <>
          <Button onPress={onClose}>Cancel</Button>
          <Button
            mode="contained"
            onPress={() => {
              onPick(formatPicked(draft, mode));
              onClose();
            }}
          >
            Done
          </Button>
        </>
      }
    >
      <DateTimePicker value={draft} mode={mode} accentColor={colors.accent} onValueChange={(_event, date) => setDraft(date)} />
    </AdaptiveDialog>
  );
}

type DateTimeInputProps = {
  mode: PickerMode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  error?: boolean;
  /** Offer a clear icon, for an optional date. */
  clearable?: boolean;
};

/** A read-only outlined input that opens the picker. Plain value/onChange, for the hours editor. */
export function DateTimeInput({ mode, value, onChange, placeholder, accessibilityLabel, error, clearable }: DateTimeInputProps) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <View style={styles.pickerRow}>
        <Pressable
          onPress={() => setOpen(true)}
          // Pressable reads no theme, so the press colour is passed every time (instruction_mds/visual-language.md §5).
          android_ripple={{ color: colors.ripple }}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={styles.fill}
        >
          <View pointerEvents="none">
            <TextInput
              mode="outlined"
              dense
              editable={false}
              value={mode === 'date' ? displayDate(value) : displayTime(value)}
              placeholder={placeholder}
              error={error}
              right={<TextInput.Icon icon={mode === 'date' ? 'calendar' : 'clock'} />}
            />
          </View>
        </Pressable>
        {clearable && value !== '' ? (
          <Button compact onPress={() => onChange('')} accessibilityLabel={`Clear ${accessibilityLabel}`}>
            Clear
          </Button>
        ) : null}
      </View>
      {open ? <Picker mode={mode} value={value} onPick={onChange} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

type DateFieldProps = Omit<FieldProps, 'children' | 'error'> & {
  name: StringPath;
  mode: PickerMode;
  placeholder?: string;
};

export function DateField({ name, mode, placeholder, ...field }: DateFieldProps) {
  const { control } = useFormContext<ProductFormValues>();
  const { field: input, fieldState } = useController({ control, name });

  return (
    <Field {...field} error={fieldState.error?.message}>
      <DateTimeInput
        mode={mode}
        value={input.value}
        onChange={(value) => {
          input.onChange(value);
          input.onBlur();
        }}
        placeholder={placeholder ?? (mode === 'date' ? 'Pick a date' : 'Pick a time')}
        accessibilityLabel={field.label}
        error={!!fieldState.error}
        clearable={!field.required}
      />
    </Field>
  );
}

type DateListFieldProps = Omit<FieldProps, 'children' | 'error' | 'action'> & {
  name: StringListPath;
  addLabel: string;
};

/** A list of dates as chips, kept sorted, with an accent "+ Add date". Blackout dates. */
export function DateListField({ name, addLabel, ...field }: DateListFieldProps) {
  const { control } = useFormContext<ProductFormValues>();
  const { field: input } = useController({ control, name });
  const [open, setOpen] = useState(false);

  return (
    <Field {...field}>
      {input.value.length > 0 ? (
        <View style={styles.chips}>
          {input.value.map((date) => (
            <Chip
              key={date}
              compact
              closeIcon="close"
              onClose={() => input.onChange(input.value.filter((other) => other !== date))}
              // On the close icon, the control that removes it — see TagsField.
              closeIconAccessibilityLabel={`Remove ${displayDate(date)}`}
            >
              {displayDate(date)}
            </Chip>
          ))}
        </View>
      ) : null}
      <AddButton label={addLabel} onPress={() => setOpen(true)} />
      {open ? (
        <Picker
          mode="date"
          value=""
          // ISO dates sort correctly as strings.
          onPick={(date) => {
            if (!input.value.includes(date)) input.onChange([...input.value, date].sort());
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </Field>
  );
}

// ---------------------------------------------------------------------------------------------------
// Pieces without a form path
// ---------------------------------------------------------------------------------------------------

/** "+ Add rate", "+ Add component": an accent text button under a repeatable list. */
export function AddButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useAppTheme();

  return (
    <Button
      mode="text"
      icon="add"
      compact
      textColor={colors.accent}
      onPress={onPress}
      disabled={disabled}
      style={styles.addButton}
    >
      {label}
    </Button>
  );
}

/** The error a cross-field rule put on a whole list ("Add at least one component"). */
export function ArrayError({ name }: { name: ArrayPath }) {
  const { errors } = useFormState<ProductFormValues>({ name });
  const error = errors[name];
  const message = error?.message ?? error?.root?.message;

  return message ? (
    <HelperText type="error" padding="none">
      {message}
    </HelperText>
  ) : null;
}

/** A remove control at the end of a repeatable row. */
export function RowRemove({ label, onPress }: { label: string; onPress: () => void }) {
  return <IconButton icon="delete" size={18} onPress={onPress} accessibilityLabel={label} style={styles.rowRemove} />;
}

/** A repeatable row: its fields in a grid, the remove control at the end, a 1px outlineVariant box. */
export function RepeatRow({ removeLabel, onRemove, children }: { removeLabel: string; onRemove: () => void; children: ReactNode }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.repeatRow, { borderColor: colors.outlineVariant }]}>
      <View style={styles.fill}>{children}</View>
      <RowRemove label={removeLabel} onPress={onRemove} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.md },
  // 45% plus flexGrow rather than 50%: the column gap would otherwise push the second cell to a row
  // of its own. The gap spaces label row, control and error, so none of them carries a margin.
  half: { flexBasis: '45%', flexGrow: 1, minWidth: 0, gap: spacing.xs },
  full: { flexBasis: '100%', gap: spacing.xs },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 24 },
  // A compact text Button is 40dp tall and would stretch the 24dp label row. The negative margin cancels
  // Paper's own touch padding, not rhythm between siblings.
  labelAction: { marginVertical: -6 },
  hint: { flexShrink: 1, textAlign: 'right' },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: spacing.ms, rowGap: spacing.xs },
  group: { borderTopWidth: 1, paddingTop: spacing.ms, width: '100%' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, minHeight: 40 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  wheels: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  addButton: { alignSelf: 'flex-start' },
  // IconButton ships a 6dp margin of its own; zeroed so the row's gap is the only spacing.
  rowRemove: { margin: 0 },
  repeatRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    paddingVertical: spacing.ms,
    paddingLeft: spacing.ms,
    paddingRight: spacing.xs,
  },
});
