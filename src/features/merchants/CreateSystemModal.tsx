import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  Card,
  HelperText,
  Icon,
  Modal,
  Portal,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { useProfileQuery } from '../profiles/queries';
import { useCreateSystemMutation } from './queries';
import {
  CATEGORY_META,
  DESCRIPTION_MAX,
  createSystemSchema,
  storeCategory,
} from './schema';
import type { CreateSystemValues, StoreCategory } from './schema';

type Props = {
  /**
   * True on a one-column container: three sequential steps with back navigation. False: every
   * section at once in a single scrolling card.
   *
   * Passed in rather than measured here. The Home screen has already measured its container, and a
   * modal measuring its own width to decide its own width is circular — the stepped branch is
   * full-bleed and the combined branch is 640 wide, so the measurement would depend on the answer.
   */
  stepped: boolean;
  onDismiss: () => void;
};

// One tappable category tile. Lives in this file rather than its own: it has exactly one consumer,
// and docs/structure.md rule 3 keeps a feature folder flat until it is genuinely large.
function SelectableCard({
  category,
  selected,
  onSelect,
}: {
  category: StoreCategory;
  selected: boolean;
  onSelect: () => void;
}) {
  const { colors } = useTheme();
  const meta = CATEGORY_META[category];
  const tint = selected ? colors.primary : colors.onSurfaceVariant;

  return (
    <Card
      mode="outlined"
      onPress={onSelect}
      style={[styles.categoryCard, selected && { borderColor: colors.primary }]}
    >
      <View style={styles.categoryBody}>
        <Icon source={meta.icon} size={28} color={tint} />
        <Text variant="labelMedium" style={{ color: tint }}>
          {meta.label}
        </Text>
      </View>
    </Card>
  );
}

function UsernameField({ control, label }: { control: Control<CreateSystemValues>; label?: string }) {
  return (
    <Controller
      control={control}
      name="displayName"
      render={({ field, fieldState }) => (
        <View>
          {label ? <Text variant="labelMedium">{label}</Text> : null}
          <TextInput
            mode="outlined"
            placeholder="Enter username"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!fieldState.error}
          />
          <HelperText type="error" visible={!!fieldState.error}>
            {fieldState.error?.message}
          </HelperText>
        </View>
      )}
    />
  );
}

function StoreNameField({ control, label }: { control: Control<CreateSystemValues>; label?: string }) {
  return (
    <Controller
      control={control}
      name="name"
      render={({ field, fieldState }) => (
        <View>
          {label ? <Text variant="labelMedium">{label}</Text> : null}
          <TextInput
            mode="outlined"
            placeholder="Enter store name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!fieldState.error}
          />
          <HelperText type="error" visible={!!fieldState.error}>
            {fieldState.error?.message}
          </HelperText>
        </View>
      )}
    />
  );
}

function DescriptionField({ control, label }: { control: Control<CreateSystemValues>; label?: string }) {
  return (
    <Controller
      control={control}
      name="description"
      render={({ field, fieldState }) => (
        <View>
          {label ? <Text variant="labelMedium">{label}</Text> : null}
          <TextInput
            mode="outlined"
            multiline
            numberOfLines={4}
            placeholder="Enter store details"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!fieldState.error}
          />
          {/*
            The counter and the error share a row rather than stacking, so the field does not jump
            by a line the moment the limit is passed. HelperText picks its own type size — no
            fontSize here, per docs/typography.md rule 2.
          */}
          <View style={styles.counterRow}>
            <HelperText type="error" visible={!!fieldState.error}>
              {fieldState.error?.message}
            </HelperText>
            <HelperText type="info" visible>
              {`${field.value.length}/${DESCRIPTION_MAX}`}
            </HelperText>
          </View>
        </View>
      )}
    />
  );
}

function CategoryField({ control, label }: { control: Control<CreateSystemValues>; label?: string }) {
  return (
    <Controller
      control={control}
      name="category"
      render={({ field, fieldState }) => (
        <View>
          {label ? <Text variant="labelMedium">{label}</Text> : null}
          {/*
            A wrapping row of fixed-width cards, not a second useColumns: it gives two per row on a
            phone and three or more on a tablet for free (docs/layout.md §3). The cost is a ragged
            right edge on ten tiles, which is the cheaper trade on an internal admin screen.
          */}
          <View style={styles.categoryGrid}>
            {storeCategory.options.map((option) => (
              <SelectableCard
                key={option}
                category={option}
                selected={field.value === option}
                onSelect={() => field.onChange(option)}
              />
            ))}
          </View>
          <HelperText type="error" visible={!!fieldState.error}>
            {fieldState.error?.message}
          </HelperText>
        </View>
      )}
    />
  );
}

export function CreateSystemModal({ stepped, onDismiss }: Props) {
  const { colors } = useTheme();
  const { data: profile } = useProfileQuery();
  const createSystem = useCreateSystemMutation();
  const [step, setStep] = useState(1);

  // One useForm for both branches. The stepped flow gates each step with `trigger` over a subset of
  // the same schema, so there are no per-step schemas to keep in agreement.
  //
  // This component is mounted only while the modal is open, which is what makes the form and the
  // step counter fresh on every open with no reset logic at all. The cost is that there is no exit
  // animation.
  const { control, handleSubmit, trigger } = useForm<CreateSystemValues>({
    resolver: zodResolver(createSystemSchema),
    defaultValues: {
      // Seeded from the profile so a returning user is not retyping their own name. `category` is
      // deliberately absent, so the required-enum message fires rather than a category arriving
      // silently preselected.
      displayName: profile?.display_name ?? '',
      name: '',
      description: '',
    },
    // onSubmit is the RHF default; on mobile, validating every keystroke while someone thumbs in a
    // store name is noise. onTouched waits until they leave the field.
    mode: 'onTouched',
  });

  const submit = handleSubmit((values) => {
    // mutate, not mutateAsync: it does not throw, so there is no catch block whose only job is to
    // swallow an error that is already being rendered from createSystem.error below.
    createSystem.mutate(values, { onSuccess: onDismiss });
  });

  const goToStep = async (fields: ('displayName' | 'name' | 'description')[]) => {
    if (await trigger(fields)) setStep((current) => current + 1);
  };

  const back = () => {
    if (stepped && step > 1) setStep((current) => current - 1);
    else onDismiss();
  };

  return (
    <Portal>
      <Modal
        visible
        onDismiss={onDismiss}
        contentContainerStyle={[
          // Paper's Modal styles the backdrop (Modal.js:144) and leaves its content transparent
          // (:175) — unlike Dialog, it will not give you a surface. elevation.level3 is the role
          // Dialog resolves to, so the two read as the same layer.
          { backgroundColor: colors.elevation.level3 },
          stepped ? styles.sheetFull : styles.sheetCentered,
        ]}
      >
        <Appbar.Header>
          <Appbar.BackAction onPress={back} />
          <Appbar.Content title="Merchant" />
        </Appbar.Header>

        <ScrollView contentContainerStyle={styles.body}>
          {stepped ? (
            <>
              {step === 1 ? (
                <>
                  <Text variant="headlineSmall">Create your username</Text>
                  <Text variant="bodyMedium">Enter your preferred owner name.</Text>
                  <UsernameField control={control} />
                  <Button mode="contained" onPress={() => goToStep(['displayName'])}>
                    Next
                  </Button>
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <Text variant="headlineSmall">Establish your business</Text>
                  <Text variant="bodyMedium">Provide details that help customers find you.</Text>
                  <StoreNameField control={control} label="Store Name" />
                  <DescriptionField control={control} label="Store Description" />
                  <Button mode="contained" onPress={() => goToStep(['name', 'description'])}>
                    Next
                  </Button>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <Text variant="headlineSmall">Store Category</Text>
                  <Text variant="bodyMedium">Pick the one that best describes your business.</Text>
                  <CategoryField control={control} />
                  <Button
                    mode="contained"
                    onPress={submit}
                    loading={createSystem.isPending}
                    disabled={createSystem.isPending}
                  >
                    Continue
                  </Button>
                </>
              ) : null}
            </>
          ) : (
            <>
              <Text variant="headlineSmall">Set up your business</Text>
              <Text variant="bodyMedium">Complete each section below.</Text>

              <Card mode="contained">
                <Card.Content style={styles.combined}>
                  {/* Card.Content already pads 16 on every side; the gap here is spacing between
                      fields, not padding around them (docs/layout.md §6). */}
                  <Text variant="titleMedium">Business Identity</Text>
                  <UsernameField control={control} label="Username" />
                  <StoreNameField control={control} label="Store Name" />
                  <DescriptionField control={control} label="Store Details" />
                  <CategoryField control={control} label="Store Category" />
                </Card.Content>
              </Card>

              <View style={styles.trailingAction}>
                <Button
                  mode="contained"
                  onPress={submit}
                  loading={createSystem.isPending}
                  disabled={createSystem.isPending}
                >
                  Next
                </Button>
              </View>
            </>
          )}

          {/* The mutation's own failure, distinct from a field being invalid. Not logged — the user
              is already being told, and a network error is not the unexpected kind worth a logger
              (docs/data-layer.md §5). */}
          <HelperText type="error" visible={createSystem.isError}>
            {createSystem.error?.message}
          </HelperText>
        </ScrollView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  sheetFull: { flex: 1 },
  // 640 is the single-column measure from docs/layout.md rule 6. Without it the form spans a
  // 1000dp tablet and the text fields read as broken.
  sheetCentered: { maxWidth: 640, width: '100%', alignSelf: 'center', margin: 24, borderRadius: 16 },
  body: { gap: 12, padding: 24 },
  combined: { gap: 12 },
  counterRow: { flexDirection: 'row', justifyContent: 'space-between' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  categoryCard: { width: 150 },
  categoryBody: { alignItems: 'center', gap: 4, padding: 12 },
  trailingAction: { alignItems: 'flex-end' },
});
