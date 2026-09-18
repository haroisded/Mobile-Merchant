import { zodResolver } from '@hookform/resolvers/zod';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Appbar } from '../../components/appbar';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { HelperText } from '../../components/helper-text';
import { Icon } from '../../components/icon';
import { Menu } from '../../components/menu';
import { Modal } from '../../components/modal';
import { Portal } from '../../components/portal';
import { Text } from '../../components/text';
import { TextInput } from '../../components/text-input';
import { useCreateSystemMutation } from '../../features/merchants/queries';
import {
  ADDRESS_MAX,
  CATEGORY_META,
  COUNTRIES,
  countryFlag,
  createSystemSchema,
  storeCategory,
} from '../../features/merchants/schema';
import type { Country, CreateSystemValues, StoreCategory } from '../../features/merchants/schema';
import { useProfileQuery } from '../../features/profiles/queries';
import type { IconName } from '../../lib/icons';
import { failureMessage } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';

type Props = {
  /**
   * True on a one-column container: three sequential steps with back navigation, on a full-screen
   * route (src/app/(app)/create-system.tsx). False: every section at once in a single scrolling card,
   * in the modal below.
   *
   * Passed in rather than measured here. The Home screen has already measured its container, and a
   * form measuring its own width to decide its own width is circular — the stepped branch is
   * full-bleed and the combined branch is 640 wide, so the measurement would depend on the answer.
   */
  stepped: boolean;
  onDismiss: () => void;
};

// One tappable category tile. Lives in this file rather than its own: it has exactly one consumer,
// and instruction_mds/structure.md §4 keeps a screen folder flat until it passes roughly eight files.
function SelectableCard({
  category,
  selected,
  onSelect,
}: {
  category: StoreCategory;
  selected: boolean;
  onSelect: () => void;
}) {
  const { colors } = useAppTheme();
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

// An icon and a title on one row. Only the combined branch has sections, so it is two elements in
// a row rather than anything more — no `variant` is passed to Text beyond titleMedium, which is the
// section-header role in instruction_mds/typography.md §2.
function SectionHeader({ icon, title }: { icon: IconName; title: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.sectionHeader}>
      <Icon source={icon} size={20} color={colors.onSurfaceVariant} />
      <Text variant="titleMedium">{title}</Text>
    </View>
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

function EmailField({ control, label }: { control: Control<CreateSystemValues>; label?: string }) {
  return (
    <Controller
      control={control}
      name="contactEmail"
      render={({ field, fieldState }) => (
        <View>
          {label ? <Text variant="labelMedium">{label}</Text> : null}
          <TextInput
            mode="outlined"
            placeholder="Enter Email Address"
            // autoCapitalize/autoCorrect are not in the analysis, but a keyboard that capitalises
            // the first letter of an address is a keyboard that fails z.email() on the first try.
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
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

// The Phone Input Group: a Menu-anchored country selector beside one editable number input.
//
// The country lives in component state, not in the form schema and not in a column. It is an
// affordance for composing the number — picking one swaps the dial prefix on the front of whatever
// is already typed — and the country is recoverable from the stored E.164 string, so persisting it
// would be storing the same fact twice.
function PhoneField({ control, label }: { control: Control<CreateSystemValues>; label?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Android's back button with the menu open used to take the whole wizard with it, losing what was
  // typed. A Paper Menu is not a route, so nothing consumed the
  // press; this does, and closes the menu instead.
  usePreventRemove(menuOpen, () => setMenuOpen(false));
  // Annotated, not inferred: `as const` on COUNTRIES makes COUNTRIES[0] the Philippines literal
  // type, so an un-annotated useState would refuse every other country.
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);

  return (
    <Controller
      control={control}
      name="phone"
      render={({ field, fieldState }) => {
        const pick = (next: Country) => {
          setCountry(next);
          setMenuOpen(false);
          // Replace the old dial code rather than appending a second one, so switching country
          // twice does not leave "+63+44…". Anything that is not a leading dial code is the
          // national number and survives untouched.
          const rest = field.value.startsWith(country.dial)
            ? field.value.slice(country.dial.length)
            : field.value.replace(/^\+\d{1,4}/, '');
          field.onChange(`${next.dial}${rest}`);
        };

        return (
          <View>
            {label ? <Text variant="labelMedium">{label}</Text> : null}
            <View style={styles.phoneRow}>
              <Menu
                visible={menuOpen}
                onDismiss={() => setMenuOpen(false)}
                anchor={
                  // A Button, not a TextInput styled to look like a trigger. It is a control that
                  // opens a menu, so it should be one — a read-only TextInput here would take
                  // focus, raise a keyboard, and read as an editable field to a screen reader.
                  <Button
                    mode="outlined"
                    icon="chevron-down"
                    contentStyle={styles.trailingIcon}
                    onPress={() => setMenuOpen(true)}
                  >
                    {countryFlag(country.iso)}
                  </Button>
                }
              >
                {COUNTRIES.map((option) => (
                  <Menu.Item
                    key={option.iso}
                    onPress={() => pick(option)}
                    title={`${countryFlag(option.iso)}  ${option.name}  ${option.dial}`}
                  />
                ))}
              </Menu>
              <TextInput
                mode="outlined"
                style={styles.phoneInput}
                keyboardType="phone-pad"
                placeholder={country.dial}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={!!fieldState.error}
              />
            </View>
            <HelperText type="error" visible={!!fieldState.error}>
              {fieldState.error?.message}
            </HelperText>
          </View>
        );
      }}
    />
  );
}

function AddressField({ control, label }: { control: Control<CreateSystemValues>; label?: string }) {
  return (
    <Controller
      control={control}
      name="address"
      render={({ field, fieldState }) => (
        <View>
          {label ? <Text variant="labelMedium">{label}</Text> : null}
          <TextInput
            mode="outlined"
            multiline
            numberOfLines={4}
            placeholder="Enter store details and address"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!fieldState.error}
          />
          {/*
            The counter and the error share a row rather than stacking, so the field does not jump
            by a line the moment the limit is passed. HelperText picks its own type size — no
            fontSize here, per instruction_mds/typography.md rule 2.
          */}
          <View style={styles.counterRow}>
            <HelperText type="error" visible={!!fieldState.error}>
              {fieldState.error?.message}
            </HelperText>
            <HelperText type="info" visible>
              {`${field.value.length}/${ADDRESS_MAX}`}
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
            phone and three or more on a tablet for free (instruction_mds/layout.md §3). The cost is a ragged
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

/**
 * The wide presentation: every section at once, in a modal capped at 640. Narrow, the stepped form is
 * a full-screen route instead — a three-step wizard with a country menu is not a confirm or a picker,
 * so it is not a formSheet (instruction_mds/visual-language.md §5), and a Paper Menu measures itself against the
 * window, which a partial-height native sheet would offset.
 */
export function CreateSystemModal({ onDismiss }: { onDismiss: () => void }) {
  const { colors } = useAppTheme();

  return (
    <Portal>
      <Modal
        visible
        onDismiss={onDismiss}
        // The wrapper is Paper's full-screen backdrop; padding keeps the card off the screen edge.
        style={styles.modalWrapper}
        contentContainerStyle={[
          // Paper's Modal styles the backdrop (Modal.js:144) and leaves its content transparent
          // (:175) — unlike Dialog, it will not give you a surface. elevation.level3 is the role
          // Dialog resolves to, so the two read as the same layer.
          { backgroundColor: colors.elevation.level3 },
          styles.sheetCentered,
        ]}
      >
        <CreateSystem stepped={false} onDismiss={onDismiss} />
      </Modal>
    </Portal>
  );
}

export function CreateSystem({ stepped, onDismiss }: Props) {
  const { data: profile } = useProfileQuery();
  const createSystem = useCreateSystemMutation();
  const [step, setStep] = useState(1);

  // One useForm for both branches. The stepped flow gates each step with `trigger` over a subset of
  // the same schema, so there are no per-step schemas to keep in agreement.
  //
  // This component is mounted only while the modal or the route is open, which is what makes the form
  // and the step counter fresh on every open with no reset logic at all. The cost is that the modal
  // has no exit animation.
  const { control, handleSubmit, trigger } = useForm<CreateSystemValues>({
    resolver: zodResolver(createSystemSchema),
    defaultValues: {
      // Seeded from the profile so a returning user is not retyping their own name. `category` is
      // deliberately absent, so the required-enum message fires rather than a category arriving
      // silently preselected.
      displayName: profile?.display_name ?? '',
      // Left empty on purpose. This is the business's contact address, so seeding it from
      // session.user.email would quietly turn it into the mirror of auth that merchants.contact_email
      // exists not to be — and a prefilled field is one nobody reads before tapping Next.
      contactEmail: '',
      name: '',
      phone: '',
      address: '',
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

  // Typed from the schema rather than by hand: a field renamed in schema.ts is a compile error at
  // the call sites below, not a step that silently stops validating.
  const goToStep = async (fields: (keyof CreateSystemValues)[]) => {
    if (await trigger(fields)) setStep((current) => current + 1);
  };

  const back = () => {
    if (stepped && step > 1) setStep((current) => current - 1);
    else onDismiss();
  };

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={back} />
        <Appbar.Content title="Merchant" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.body}>
        {stepped ? (
          <>
            {step === 1 ? (
              <>
                <Text variant="headlineSmall">Create your account</Text>
                <Text variant="bodyMedium">Add a username and an email for your account.</Text>
                <UsernameField control={control} label="Username" />
                <EmailField control={control} label="Email Address" />
                <Button mode="contained" onPress={() => goToStep(['displayName', 'contactEmail'])} contentStyle={styles.leading}>
                  Next
                </Button>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Text variant="headlineSmall">Establish your business</Text>
                <Text variant="bodyMedium">
                  Provide details that help categorize and identify your business.
                </Text>
                <StoreNameField control={control} label="Store Name" />
                <PhoneField control={control} label="Phone Number" />
                <AddressField control={control} label="Store Address" />
                {/*
                  Phone is in the gate even though the schema lets it be empty: empty passes, but
                  a half-typed number should stop the step rather than surface three screens later
                  as a check-constraint violation from the database.
                */}
                <Button mode="contained" onPress={() => goToStep(['name', 'phone', 'address'])} contentStyle={styles.leading}>
                  Next
                </Button>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <Text variant="headlineSmall">Store Category</Text>
                <Text variant="bodyMedium">What type of business are you establishing?</Text>
                <CategoryField control={control} />
                <Button
                  mode="contained"
                  // Paper's `icon` is a leading slot; row-reverse is how the same prop becomes a
                  // trailing one, which is what the analysis asks for. No second component.
                  icon="arrow-forward"
                  contentStyle={styles.trailingIcon}
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
            <Text variant="bodyMedium">
              Complete each section below to finish setting up your store.
            </Text>

            <Card mode="contained">
              <Card.Content style={styles.combined}>
                {/* Card.Content already pads 16 on every side; the gap here is spacing between
                    fields, not padding around them (instruction_mds/layout.md §6). */}
                <SectionHeader icon="account-details" title="Personal Details" />
                {/*
                  Two fields per row. The modal is capped at 640 (instruction_mds/layout.md rule 6), so a
                  half of it is ~300 — still a sane measure for a single-line input, which is why
                  this pairing is safe here and the multiline address below stays full width.
                */}
                <View style={styles.fieldRow}>
                  <View style={styles.fieldCell}>
                    <UsernameField control={control} label="Username" />
                  </View>
                  <View style={styles.fieldCell}>
                    <EmailField control={control} label="Email Address" />
                  </View>
                </View>

                <SectionHeader icon="storefront" title="Business Identity" />
                <View style={styles.fieldRow}>
                  <View style={styles.fieldCell}>
                    <StoreNameField control={control} label="Store Name" />
                  </View>
                  <View style={styles.fieldCell}>
                    <PhoneField control={control} label="Phone Number" />
                  </View>
                </View>
                <AddressField control={control} label="Store Address" />
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
            (instruction_mds/data-layer.md §5).

            The field-level HelperTexts above render `fieldState.error.message`, and that stays:
            those are Zod messages written for the user. This one is a provider string, which is
            not, so it is replaced by copy the user can act on. */}
        <HelperText type="error" visible={createSystem.isError}>
          {failureMessage("Couldn't create this system. Try again.")}
        </HelperText>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  // Full-width buttons put their label at the left edge (instruction_mds/visual-language.md §5).
  leading: { justifyContent: 'flex-start' },
  modalWrapper: { padding: spacing.lg },
  // 640 is the single-column measure from instruction_mds/layout.md rule 6. Without it the form spans a
  // 1000dp tablet and the text fields read as broken. The radius is the Dialog's, which this modal
  // stands in for.
  sheetCentered: {
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  body: { gap: spacing.ms, padding: spacing.lg },
  combined: { gap: spacing.ms },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // Two cells per row on the combined branch. flexBasis 0 with flexGrow 1 rather than plain
  // `flex: 1`, so a long placeholder cannot push its own cell wider than its neighbour.
  fieldRow: { flexDirection: 'row', gap: spacing.ms },
  fieldCell: { flexGrow: 1, flexBasis: 0 },
  phoneRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  // The number takes the rest of the row; the country trigger stays at its own content width.
  phoneInput: { flexGrow: 1, flexBasis: 0 },
  // row-reverse turns Paper's leading icon slot into a trailing one; flex-end is the LEFT edge on a
  // reversed main axis, so a full-width button's label still starts there (instruction_mds/visual-language.md §5).
  trailingIcon: { flexDirection: 'row-reverse', justifyContent: 'flex-end' },
  counterRow: { flexDirection: 'row', justifyContent: 'space-between' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.ms },
  categoryCard: { width: 150 },
  // Left-aligned like every other label (instruction_mds/visual-language.md rule 8).
  categoryBody: { alignItems: 'flex-start', gap: spacing.xs, padding: spacing.ms },
  trailingAction: { alignItems: 'flex-end' },
});
