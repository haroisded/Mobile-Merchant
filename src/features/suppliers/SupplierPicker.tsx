import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';

import { AdaptiveDialog } from '../../components/AdaptiveDialog';
import { MenuSelect } from '../../components/MenuSelect';
import { useShellWide } from '../../lib/columns';
import { failureMessage } from '../../lib/errors';
import { useCreateSupplierMutation, useSuppliersQuery } from './queries';
import type { Supplier } from './queries';

type Props = {
  merchantId: string;
  value: string;
  onChange: (id: string) => void;
  accessibilityLabel: string;
};

/** Supplier select with inline create. Optional, so "None" is offered. */
export function SupplierPicker({ merchantId, value, onChange, accessibilityLabel }: Props) {
  const suppliers = useSuppliersQuery({ merchantId });
  const [creating, setCreating] = useState(false);

  return (
    <>
      <MenuSelect
        value={value}
        options={[
          { value: '', label: 'None' },
          ...(suppliers.data ?? []).map((supplier) => ({ value: supplier.id, label: supplier.name })),
        ]}
        onChange={onChange}
        placeholder={suppliers.isError ? "Couldn't load suppliers" : suppliers.isPending ? 'Loading…' : 'None'}
        accessibilityLabel={accessibilityLabel}
        createLabel="New supplier"
        onCreate={() => setCreating(true)}
      />
      {creating ? (
        <SupplierDialog
          merchantId={merchantId}
          onDismiss={() => setCreating(false)}
          onCreated={(supplier) => onChange(supplier.id)}
        />
      ) : null}
    </>
  );
}

type DialogProps = {
  merchantId: string;
  onDismiss: () => void;
  onCreated: (supplier: Supplier) => void;
};

function SupplierDialog({ merchantId, onDismiss, onCreated }: DialogProps) {
  const wide = useShellWide();
  const create = useCreateSupplierMutation({ merchantId });
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const trimmed = name.trim();
  const nameInvalid = trimmed.length === 0 || trimmed.length > 80;
  const contactInvalid = contact.trim().length > 255;
  const inFlight = create.isPending && !create.isPaused;

  const notice = create.isPaused
    ? { type: 'info' as const, text: 'Waiting for a connection. This finishes on its own when you reconnect.' }
    : create.isError
      ? { type: 'error' as const, text: failureMessage("Couldn't create this supplier. Try again.") }
      : null;

  const save = () => {
    setSubmitted(true);
    if (nameInvalid || contactInvalid) return;
    create.mutate(
      { name: trimmed, contact: contact.trim() === '' ? null : contact.trim() },
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
      kicker="Inventory"
      title="New supplier"
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
      <Text variant="labelMedium">Name</Text>
      <TextInput
        mode="outlined"
        dense
        autoFocus
        value={name}
        onChangeText={setName}
        placeholder="e.g. Metro Beverage Supply"
        accessibilityLabel="Name"
        error={submitted && nameInvalid}
        disabled={create.isPending}
      />
      {submitted && nameInvalid ? (
        <HelperText type="error" padding="none">
          Enter a name of up to 80 characters.
        </HelperText>
      ) : null}

      <Text variant="labelMedium">Contact</Text>
      <TextInput
        mode="outlined"
        dense
        value={contact}
        onChangeText={setContact}
        placeholder="Phone, email or a person's name"
        accessibilityLabel="Contact"
        error={submitted && contactInvalid}
        disabled={create.isPending}
      />

      <HelperText type={notice?.type ?? 'error'} visible={notice !== null} padding="none">
        {notice?.text}
      </HelperText>
    </AdaptiveDialog>
  );
}

const styles = StyleSheet.create({
  action: { justifyContent: 'flex-start' },
});
