import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Chip, HelperText, Text, TextInput } from 'react-native-paper';

import { AdaptiveDialog } from '../../components/AdaptiveDialog';
import { MenuSelect } from '../../components/MenuSelect';
import { useShellWide } from '../../lib/columns';
import { failureMessage, postgrestError } from '../../lib/errors';
import { TAX_CLASS_PRESETS, taxClassLabel, useCreateTaxClassMutation, useTaxClassesQuery } from './queries';
import type { TaxClass } from './queries';

type Props = {
  merchantId: string;
  value: string;
  onChange: (id: string) => void;
  accessibilityLabel: string;
  error?: boolean;
};

/** Tax class select with inline create. "None" is offered: a product with no class is untaxed. */
export function TaxClassPicker({ merchantId, value, onChange, accessibilityLabel, error }: Props) {
  const taxClasses = useTaxClassesQuery({ merchantId });
  const [creating, setCreating] = useState(false);

  return (
    <>
      <MenuSelect
        value={value}
        options={[
          { value: '', label: 'None' },
          ...(taxClasses.data ?? []).map((taxClass) => ({ value: taxClass.id, label: taxClassLabel(taxClass) })),
        ]}
        onChange={onChange}
        placeholder={taxClasses.isError ? "Couldn't load tax classes" : taxClasses.isPending ? 'Loading…' : 'None'}
        accessibilityLabel={accessibilityLabel}
        error={error}
        createLabel="New tax class"
        onCreate={() => setCreating(true)}
      />
      {creating ? (
        <TaxClassDialog
          merchantId={merchantId}
          onDismiss={() => setCreating(false)}
          onCreated={(taxClass) => onChange(taxClass.id)}
        />
      ) : null}
    </>
  );
}

type DialogProps = {
  merchantId: string;
  onDismiss: () => void;
  onCreated: (taxClass: TaxClass) => void;
};

// Two fields and presets that fill both — still small enough for plain state. Lives beside its one
// consumer (docs/structure.md rule 3).
function TaxClassDialog({ merchantId, onDismiss, onCreated }: DialogProps) {
  const wide = useShellWide();
  const create = useCreateTaxClassMutation({ merchantId });
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const trimmed = name.trim();
  const rateNumber = Number(rate);
  const nameInvalid = trimmed.length === 0 || trimmed.length > 60;
  const rateInvalid = rate.trim() === '' || !Number.isFinite(rateNumber) || rateNumber < 0 || rateNumber > 100;
  const inFlight = create.isPending && !create.isPaused;

  const notice = create.isPaused
    ? { type: 'info' as const, text: 'Waiting for a connection. This finishes on its own when you reconnect.' }
    : create.isError
      ? {
          type: 'error' as const,
          text:
            postgrestError(create.error)?.code === '23505'
              ? 'There is already a tax class with this name.'
              : failureMessage("Couldn't create this tax class. Try again."),
        }
      : null;

  const save = () => {
    setSubmitted(true);
    if (nameInvalid || rateInvalid) return;
    create.mutate(
      { name: trimmed, rate: rateNumber },
      {
        onSuccess: (row) => {
          onCreated(row);
          onDismiss();
        },
      }
    );
  };

  return (
    <AdaptiveDialog
      wide={wide}
      onDismiss={onDismiss}
      dismissable={!inFlight}
      kicker="Pricing"
      title="New tax class"
      actions={
        <>
          <Button mode="outlined" onPress={onDismiss} disabled={inFlight} contentStyle={styles.action}>
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={save}
            loading={create.isPending}
            disabled={create.isPending}
            contentStyle={styles.action}
          >
            Create
          </Button>
        </>
      }
    >
      <Text variant="labelMedium">Start from</Text>
      <View style={styles.presets}>
        {TAX_CLASS_PRESETS.map((preset) => (
          <Chip
            key={preset.name}
            compact
            selected={trimmed === preset.name}
            onPress={() => {
              setName(preset.name);
              setRate(preset.rate);
            }}
          >
            {`${preset.name} · ${preset.rate}%`}
          </Chip>
        ))}
      </View>

      <Text variant="labelMedium">Name</Text>
      <TextInput
        mode="outlined"
        dense
        value={name}
        onChangeText={setName}
        placeholder="e.g. Standard VAT 12%"
        accessibilityLabel="Name"
        error={submitted && nameInvalid}
        disabled={create.isPending}
      />
      {submitted && nameInvalid ? (
        <HelperText type="error" padding="none">
          Enter a name of up to 60 characters.
        </HelperText>
      ) : null}

      <Text variant="labelMedium">Rate</Text>
      <TextInput
        mode="outlined"
        dense
        value={rate}
        onChangeText={setRate}
        keyboardType="decimal-pad"
        placeholder="0"
        accessibilityLabel="Rate in percent"
        error={submitted && rateInvalid}
        disabled={create.isPending}
        right={<TextInput.Affix text="%" />}
      />
      {submitted && rateInvalid ? (
        <HelperText type="error" padding="none">
          Enter a rate from 0 to 100.
        </HelperText>
      ) : null}

      <HelperText type={notice?.type ?? 'error'} visible={notice !== null} padding="none">
        {notice?.text}
      </HelperText>
    </AdaptiveDialog>
  );
}

const styles = StyleSheet.create({
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  action: { justifyContent: 'flex-start' },
});
