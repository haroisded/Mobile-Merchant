import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useController, useFormContext, useFormState } from 'react-hook-form';
import type { FieldPathByValue } from 'react-hook-form';
import { Platform, StyleSheet, View } from 'react-native';
import type { KeyboardTypeOptions } from 'react-native';
import {
  Button,
  Chip,
  HelperText,
  IconButton,
  SegmentedButtons,
  Switch,
  Text,
  TextInput,
  TouchableRipple,
} from 'react-native-paper';

import { AdaptiveDialog } from '../../../components/AdaptiveDialog';
import { MenuSelect } from '../../../components/MenuSelect';
import type { SelectOption } from '../../../components/MenuSelect';
import { useShellWide } from '../../../lib/columns';
import { useAppTheme } from '../../../lib/theme';
import { UNIT_META, measureUnit } from '../schema';
import type { ProductFormValues } from '../schema';

// The form's building blocks, one per pattern in docs/visual-language.md §5 "Forms". Every field
// reads the form through useFormContext, so a section passes a path and nothing else — and the path
// types below make a misspelt or wrongly typed path a compile error at the section.

type StringPath = FieldPathByValue<ProductFormValues, string>;
type BooleanPath = FieldPathByValue<ProductFormValues, boolean>;
type StringListPath = FieldPathByValue<ProductFormValues, string[]>;
type ArrayPath = 'rateTiers' | 'operatingHours' | 'variantAttributes' | 'components';

export const UNIT_OPTIONS: SelectOption[] = measureUnit.options.map((unit) => ({
  value: unit,
  label: UNIT_META[unit].label,
}));

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
          {/* The required mark is one of the accent's places (docs/visual-language.md §4). */}
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
        {/* A switch that is on is one of the accent's places (docs/visual-language.md §4). */}
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
              closeIcon="x"
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
        right={<TextInput.Icon icon="plus" onPress={add} accessibilityLabel={`Add to ${field.label}`} />}
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

/** "14 Sep 2026" for a stored date; a stored time is already readable. */
export function displayDate(value: string) {
  return toPickerDate(value, 'date').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

type PickerProps = {
  mode: PickerMode;
  value: string;
  onPick: (value: string) => void;
  onClose: () => void;
};

/**
 * The platform's own picker, mounted only while open. Android shows its Material dialog and closes it
 * itself; iOS has no dialog presentation, so the inline picker sits in the adaptive dialog with Done.
 */
function Picker({ mode, value, onPick, onClose }: PickerProps) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const [draft, setDraft] = useState(() => toPickerDate(value, mode));

  if (Platform.OS === 'android') {
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
  const [open, setOpen] = useState(false);

  return (
    <>
      <View style={styles.pickerRow}>
        <TouchableRipple
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={styles.fill}
        >
          <View pointerEvents="none">
            <TextInput
              mode="outlined"
              dense
              editable={false}
              value={value === '' ? '' : mode === 'date' ? displayDate(value) : value}
              placeholder={placeholder}
              error={error}
              right={<TextInput.Icon icon={mode === 'date' ? 'calendar' : 'clock'} />}
            />
          </View>
        </TouchableRipple>
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
              closeIcon="x"
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
      icon="plus"
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

/** A 3px left rule on surfaceMuted: accent for a note, error for a warning. */
export function NoteCallout({ tone = 'accent', children }: { tone?: 'accent' | 'error'; children: ReactNode }) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.note,
        { backgroundColor: colors.surfaceMuted, borderLeftColor: tone === 'error' ? colors.error : colors.accent },
      ]}
    >
      <Text variant="bodySmall">{children}</Text>
    </View>
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
  return <IconButton icon="trash-2" size={18} onPress={onPress} accessibilityLabel={label} style={styles.rowRemove} />;
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 14 },
  // 45% plus flexGrow rather than 50%: the column gap would otherwise push the second cell to a row
  // of its own.
  half: { flexBasis: '45%', flexGrow: 1, minWidth: 0 },
  full: { flexBasis: '100%' },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 24, marginBottom: 4 },
  labelAction: { marginVertical: -6 },
  hint: { flexShrink: 1, textAlign: 'right' },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10, rowGap: 2 },
  group: { borderTopWidth: 1, paddingTop: 14, width: '100%' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addButton: { alignSelf: 'flex-start' },
  note: { borderLeftWidth: 3, paddingVertical: 10, paddingHorizontal: 12 },
  rowRemove: { margin: 0 },
  repeatRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, borderWidth: 1, paddingVertical: 12, paddingLeft: 12, paddingRight: 4 },
});
