import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useController, useForm, useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { Share, StyleSheet, View } from 'react-native';

import { AdaptiveDialog, FormActions, sendOnce } from '../../components/adaptive-dialog';
import { Button } from '../../components/button';
import { PickChip } from '../../components/filter-chips';
import { ControlledDate, ControlledText, Field, FieldGrid } from '../../components/form-fields';
import { IconButton } from '../../components/icon-button';
import { SegmentedButtons } from '../../components/segmented-buttons';
import { Text } from '../../components/text';
import { EXPIRY_CHOICES, formatCode } from '../../features/access-codes/code';
import { useCreateAccessCodesMutation } from '../../features/access-codes/queries';
import { newAccessCodeSchema } from '../../features/access-codes/schema';
import type { NewAccessCodeValues } from '../../features/access-codes/schema';
import { useMerchantsQuery } from '../../features/merchants/queries';
import type { Merchant } from '../../features/merchants/queries';
import { displayDateTime } from '../../lib/dates';
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { useSession } from '../../Store/StoreUser';
import { radius, spacing } from '../../themes';

type Created = { code: string; expires_at: string | null };

const USES = [
  { value: 'one' as const, label: '1 person' },
  { value: 'many' as const, label: 'Many people' },
];

/** The system's share sheet, with what a person needs to use the codes — ready to send in any app. */
export function share(codes: Created[], system: string) {
  const expiry = codes[0]?.expires_at ? ` It works until ${displayDateTime(codes[0].expires_at)}.` : '';
  const list = codes.map((created) => formatCode(created.code)).join(', ');
  const message = `${codes.length === 1 ? 'Your access code' : 'Access codes'} for ${system} in Merchant: ${list}. Open Merchant, tap Enter Access Code on Home and type it in.${expiry}`;
  return Share.share({ message });
}

/** Make codes for one of the owner's systems — the body of src/app/(app)/forms/new-access-code.tsx (page narrow, Dialog wide). */
export function NewAccessCodeForm({ onDismiss }: { onDismiss: () => void }) {
  const userId = useSession()?.user.id;
  const owned = useMerchantsQuery().data?.filter((merchant) => merchant.owner_id === userId);
  if (!owned) return null;

  return <Form owned={owned} onDismiss={onDismiss} />;
}

function Form({ owned, onDismiss }: { owned: Merchant[]; onDismiss: () => void }) {
  const create = useCreateAccessCodesMutation();
  const [created, setCreated] = useState<{ codes: Created[]; system: string } | null>(null);
  const failure = postgrestError(create.error)?.message === 'expiry_in_past' ? 'Pick today or a later day.' : failureMessage("Couldn't create the codes. Try again.");
  const notice = mutationNotice(create, failure);

  const { control, handleSubmit } = useForm<NewAccessCodeValues>({
    resolver: zodResolver(newAccessCodeSchema),
    defaultValues: { merchant_id: owned.length === 1 ? owned[0].id : '', label: '', quantity: 1, expiry: '60', expires_on: '', uses: 'one' },
    mode: 'onTouched',
  });
  const expiry = useWatch({ control, name: 'expiry' });
  const merchantId = useWatch({ control, name: 'merchant_id' });
  const system = owned.find((merchant) => merchant.id === merchantId)?.name ?? '';

  const submit = handleSubmit(sendOnce(create, (rows) => setCreated({ codes: rows, system })));

  if (created) return <CreatedCodes codes={created.codes} system={created.system} onDone={onDismiss} />;

  return (
    <AdaptiveDialog
      asPage
      onDismiss={onDismiss}
      dismissable={!(create.isPending && !create.isPaused)}
      kicker="Access Codes"
      title="Generate Staff Access Code"
      notice={notice}
      actions={<FormActions mutation={create} onCancel={onDismiss} onSave={submit} saveLabel="Create Code" />}
    >
      <FieldGrid>
        <ControlledText control={control} name="label" label="Label" hint="Who it's for" span="full" placeholder="Front desk" maxLength={40} />
        <ChoiceChips control={control} name="merchant_id" label="System" options={owned.map((merchant) => ({ value: merchant.id, label: merchant.name }))} />
        <Quantity control={control} />
        <ChoiceChips control={control} name="expiry" label="Expires" options={EXPIRY_CHOICES} />
        {expiry === 'custom' ? <ControlledDate control={control} name="expires_on" label="Last Day It Works" required span="full" /> : null}
        <Uses control={control} />
      </FieldGrid>
    </AdaptiveDialog>
  );
}

type ChipsProps = {
  control: Control<NewAccessCodeValues>;
  name: 'merchant_id' | 'expiry';
  label: string;
  options: readonly { value: string; label: string }[];
};

/** One choice of a few, as chips in a wrapping row (frontend.md §5, Tags): a system, an expiry. */
function ChoiceChips({ control, name, label, options }: ChipsProps) {
  const { field, fieldState } = useController({ control, name });

  return (
    <Field label={label} required span="full" error={fieldState.error?.message}>
      <View style={styles.chips}>
        {options.map((option) => (
          <PickChip
            key={option.value}
            picked={field.value === option.value}
            onPress={() => {
              field.onChange(option.value);
              field.onBlur();
            }}
          >
            {option.label}
          </PickChip>
        ))}
      </View>
    </Field>
  );
}

/** How many codes, one to twenty: a stepper. */
function Quantity({ control }: { control: Control<NewAccessCodeValues> }) {
  const { field, fieldState } = useController({ control, name: 'quantity' });

  return (
    <Field label="Quantity" hint="1 to 20" span="full" error={fieldState.error?.message}>
      <View style={styles.stepper}>
        <IconButton mode="outlined" icon="minus" onPress={() => field.onChange(field.value - 1)} disabled={field.value <= 1} accessibilityLabel="One fewer" />
        <Text variant="titleMedium" accessibilityLabel={`${field.value} codes`}>
          {field.value}
        </Text>
        <IconButton mode="outlined" icon="add" onPress={() => field.onChange(field.value + 1)} disabled={field.value >= 20} accessibilityLabel="One more" />
      </View>
    </Field>
  );
}

/** One person per code, or any number. */
function Uses({ control }: { control: Control<NewAccessCodeValues> }) {
  const { field } = useController({ control, name: 'uses' });

  return (
    <Field label="Uses per Code" span="full">
      <SegmentedButtons value={field.value} onValueChange={field.onChange} buttons={USES} />
    </Field>
  );
}

/** The codes just made, each to share — they are sent outside the app. */
function CreatedCodes({ codes, system, onDone }: { codes: Created[]; system: string; onDone: () => void }) {
  const { colors } = useAppTheme();

  return (
    <AdaptiveDialog
      asPage
      onDismiss={onDone}
      kicker={system}
      title={codes.length === 1 ? 'Code created' : `${codes.length} codes created`}
      actions={
        <>
          {codes.length > 1 ? (
            <Button mode="outlined" icon="share" onPress={() => share(codes, system)} contentStyle={styles.action}>
              Share All
            </Button>
          ) : null}
          <Button mode="contained" onPress={onDone} contentStyle={styles.action}>
            Done
          </Button>
        </>
      }
    >
      <Text variant="bodyMedium">
        Send {codes.length === 1 ? 'it' : 'each one'} to the person you want to let in. You approve them once they use it.
      </Text>
      <View style={[styles.box, { borderColor: colors.outlineVariant }]}>
        {codes.map((created, index) => (
          <View key={created.code} style={[styles.codeRow, index === 0 ? null : { borderTopWidth: 1, borderTopColor: colors.surfaceVariant }]}>
            <Text variant="amount" style={styles.grow}>
              {formatCode(created.code)}
            </Text>
            <IconButton icon="share" onPress={() => share([created], system)} accessibilityLabel={`Share ${formatCode(created.code)}`} />
          </View>
        ))}
      </View>
    </AdaptiveDialog>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms },
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  action: { justifyContent: 'flex-start' },
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous' },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.md },
  grow: { flex: 1 },
});
