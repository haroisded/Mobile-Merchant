import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';

import { AdaptiveDialog } from '../../components/adaptive-dialog';
import { Appbar } from '../../components/appbar';
import { Button } from '../../components/button';
import { CountryCurrencyFields } from '../../components/country-currency-fields';
import { Field, FieldGrid } from '../../components/form-fields';
import { HelperText } from '../../components/helper-text';
import { LevelPicker } from '../../components/level-picker';
import { QueryState } from '../../components/query-state';
import { StepHeader } from '../../components/step-header';
import { Surface } from '../../components/surface';
import { Text } from '../../components/text';
import { TextInput } from '../../components/text-input';
import { countryForTimeZone, useCountriesQuery } from '../../features/countries/queries';
import type { Country } from '../../features/countries/queries';
import { useCurrencyPresetsQuery } from '../../features/currency-presets/queries';
import type { CurrencyPreset } from '../../features/currency-presets/queries';
import { useCreateSystemMutation } from '../../features/merchants/queries';
import { createStoreSchema } from '../../features/merchants/schema';
import type { CreateStoreValues } from '../../features/merchants/schema';
import { FORM_MEASURE, useBottomInset, useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice } from '../../lib/errors';
import { spacing } from '../../themes';

/**
 * Create Store, in two steps: a full-screen route on a phone, a floating Dialog over the stores on a tablet (the
 * route a transparentModal there, src/app/(app)/_layout.tsx; the human, 2026-10-23). The long Country list opens as a
 * second Dialog over it, its search box over a list that scrolls inside (SearchSelect). A store is
 * ERPNext's Company with no branches, so step 1 is its setup wizard cut to three fields: name, country and currency —
 * no abbreviation, which only tells several companies apart. Step 2 is its level (src/features/merchants/levels.ts):
 * how much of the system it uses. Creating it sets up the rest (the store's first fiscal year, its chart of accounts,
 * what its level adds …) in the database.
 */
type Props = { onDismiss: () => void };

export function CreateSystem({ onDismiss }: Props) {
  const countries = useCountriesQuery();
  const currencies = useCurrencyPresetsQuery();
  const wide = useShellWide();

  if (countries.data && currencies.data) return <CreateForm countries={countries.data} currencies={currencies.data} onDismiss={onDismiss} />;

  return (
    <Frame onDismiss={onDismiss}>
      <View style={wide ? undefined : styles.state}>
        <QueryState
          query={countries.data ? currencies : countries}
          offline="You're offline. Creating a store needs a connection."
          failure="Couldn't load the list of countries. Try again."
        />
      </View>
    </Frame>
  );
}

/**
 * Wide, the Dialog over the stores, with the step's button (Next, Create Store) pinned in its footer: in the body it
 * sat under the five levels, out of sight until the Dialog was scrolled (tablet, 2026-10-28). Narrow, the full page.
 */
function Frame({ onDismiss, action, children }: Props & { action?: ReactNode; children: ReactNode }) {
  if (useShellWide()) {
    return (
      <AdaptiveDialog asPage title="Create Store" onDismiss={onDismiss} onClose={onDismiss} actions={action}>
        {children}
      </AdaptiveDialog>
    );
  }

  return (
    <Surface style={styles.fill}>
      <Appbar.Header>
        <Appbar.BackAction onPress={onDismiss} />
        <Appbar.Content title="Merchant" />
      </Appbar.Header>
      {children}
    </Surface>
  );
}

type StepBodyProps = { action: ReactNode; notice?: ReactNode; children: ReactNode };

/** A step's fields: a page's scroll on a phone, its button at the end; on a tablet the Dialog's own scrolling body. */
function StepBody({ action, notice, children }: StepBodyProps) {
  const wide = useShellWide();
  const bottom = useBottomInset();
  if (wide) {
    return (
      <View style={styles.dialogBody}>
        {children}
        {notice}
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={[styles.body, { paddingBottom: spacing.md + bottom }]} keyboardShouldPersistTaps="handled">
      {children}
      {action}
      {notice}
    </ScrollView>
  );
}

type FormProps = Props & { countries: Country[]; currencies: CurrencyPreset[] };

function CreateForm({ countries, currencies, onDismiss }: FormProps) {
  const createSystem = useCreateSystemMutation();
  const wide = useShellWide();
  // Wide, the button hugs its label: a 640dp primary button reads as a banner.
  const buttonStyle = wide ? styles.hug : undefined;
  // A paused write is queued, not in flight: it must not hold the button in its spinner while the
  // device is offline (.claude/instruction_mds/data-layer.md §5). The button still stays disabled (below).
  const inFlight = createSystem.isPending && !createSystem.isPaused;
  const notice = mutationNotice(createSystem, failureMessage("Couldn't create this store. Try again."));

  // The device's own time zone picks the starting country, and the country its currency: a shop in
  // Manila starts on the Philippines and the peso. Both stay a choice.
  const home = countryForTimeZone(countries, Intl.DateTimeFormat().resolvedOptions().timeZone);

  // The component mounts only while its route is open, which is what makes the form fresh on every
  // open with no reset logic. onTouched: validating every keystroke while someone thumbs in a name
  // is noise.
  const { control, handleSubmit, setValue, trigger } = useForm<CreateStoreValues>({
    resolver: zodResolver(createStoreSchema),
    // Level 1, the easiest: most shops start by selling. The owner changes it later on Features.
    defaultValues: { name: '', country_code: home?.code ?? '', default_currency: home?.currency_code ?? '', level: 1 },
    mode: 'onTouched',
  });

  // The step: 0 the store, 1 its level. Step 2 needs step 1 right first, so Next checks those three fields.
  const [step, setStep] = useState(0);
  const next = async () => {
    if (await trigger(['name', 'country_code', 'default_currency'])) setStep(1);
  };
  // Android's back on the level returns to the store's fields, as the step's own back does; on the fields it leaves.
  useEffect(() => {
    if (step === 0) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep(0);
      return true;
    });
    return () => subscription.remove();
  }, [step]);

  // mutate, not mutateAsync: it does not throw, so there is no catch block whose only job is to
  // swallow an error that is already being rendered from the notice below. Refused while a create is
  // pending, paused included: a second tap offline would queue a second insert, and reconnecting
  // would make two stores. Guarded here, not only on the button, because the keyboard's Done
  // submits too.
  const submit = handleSubmit((values) => {
    if (!createSystem.isPending) createSystem.mutate(values, { onSuccess: onDismiss });
  });

  if (step === 1) {
    const create = (
      <Button mode="contained" style={buttonStyle} contentStyle={styles.leading} onPress={submit} loading={inFlight} disabled={createSystem.isPending}>
        Create Store
      </Button>
    );
    return (
      <Frame onDismiss={onDismiss} action={create}>
        <StepHeader index={1} count={2} title="Its level" backLabel="Back to the store" onBack={() => setStep(0)} flush={wide} />
        <StepBody
          action={create}
          // The write's own state, distinct from a field being invalid: a provider string is replaced by copy the user
          // can act on, and an offline wait says so.
          notice={
            <HelperText type={notice?.type ?? 'error'} visible={notice !== null}>
              {notice?.text}
            </HelperText>
          }
        >
          <Text variant="headlineSmall">How much do you want to manage?</Text>
          <Text variant="bodyMedium">
            Pick how much of the system this store uses. A lower level sets more up for you and shows fewer screens. You can change it
            later on Features.
          </Text>
          <Controller
            control={control}
            name="level"
            render={({ field }) => <LevelPicker value={field.value} onChange={field.onChange} disabled={createSystem.isPending} />}
          />
        </StepBody>
      </Frame>
    );
  }

  const nextButton = (
    <Button mode="contained" style={buttonStyle} contentStyle={styles.leading} onPress={next}>
      Next
    </Button>
  );
  return (
    <Frame onDismiss={onDismiss} action={nextButton}>
      {/* The first step has nothing before it: its back is greyed out, and the app bar's leaves. */}
      <StepHeader index={0} count={2} title="Your store" backLabel="Back" onBack={() => undefined} flush={wide} />
      <StepBody action={nextButton}>
        <Text variant="headlineSmall">Name your store</Text>
        <Text variant="bodyMedium">One store: its name, and the country and currency its books are kept in.</Text>
        <FieldGrid>
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState }) => (
              <Field label="Store Name" required span="full" error={fieldState.error?.message}>
                <TextInput
                  mode="outlined"
                  dense
                  placeholder="Enter store name"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  onSubmitEditing={next}
                  returnKeyType="done"
                  autoFocus
                  maxLength={80}
                  error={!!fieldState.error}
                  accessibilityLabel="Store Name"
                />
              </Field>
            )}
          />
          <CountryCurrencyFields
            control={control}
            countries={countries}
            currencies={currencies}
            // The country's own currency, as ERPNext's setup wizard proposes it.
            onCountryPicked={(country) => {
              if (country.currency_code) setValue('default_currency', country.currency_code, { shouldValidate: true });
            }}
          />
        </FieldGrid>
      </StepBody>
    </Frame>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  dialogBody: { gap: spacing.ms },
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  leading: { justifyContent: 'flex-start' },
  // Capped at the single-column measure and left-aligned (.claude/instruction_mds/frontend.md rule 18, §9), so a
  // tablet's fields do not span 1000dp.
  body: { gap: spacing.ms, padding: spacing.md, width: '100%', maxWidth: FORM_MEASURE },
  hug: { alignSelf: 'flex-start' },
});
