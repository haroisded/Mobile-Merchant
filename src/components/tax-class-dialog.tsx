import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TAX_CLASS_PRESETS, useCreateTaxClassMutation } from '../features/tax-classes/queries';
import type { TaxClass } from '../features/tax-classes/queries';
import { useShellWide } from '../lib/columns';
import { failureMessage, postgrestError } from '../lib/errors';
import { spacing } from '../themes';
import { AdaptiveDialog } from './adaptive-dialog';
import { Button } from './button';
import { Chip } from './chip';
import { HelperText } from './helper-text';
import { Text } from './text';
import { TextInput } from './text-input';

type Props = {
  merchantId: string;
  /** Rendered as the body of the narrow formSheet route (src/app/(app)/sheets/tax-class.tsx). */
  inSheet?: boolean;
  onDismiss: () => void;
  onCreated: (taxClass: TaxClass) => void;
};

/**
 * Create a tax class. Two fields and presets that fill both — still small enough for plain state.
 * In src/components/ because two hosts render it: the product form's picker on a wide shell and the
 * sheet route on a narrow one.
 */
export function TaxClassDialog({ merchantId, inSheet, onDismiss, onCreated }: Props) {
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
      inSheet={inSheet}
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
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { justifyContent: 'flex-start' },
});
