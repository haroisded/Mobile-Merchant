import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { saveOnce } from '../../components/adaptive-dialog';
import { Button } from '../../components/button';
import { DESTINATIONS } from '../../components/destinations';
import type { Destination } from '../../components/destinations';
import { FormFooter } from '../../components/form-footer';
import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { Snackbar } from '../../components/snackbar';
import { Text } from '../../components/text';
import { useDiscard } from '../../components/use-discard';
import { hiddenOf, useFeaturePreferencesQuery, useSaveFeaturePreferencesMutation } from '../../features/feature-preferences/queries';
import { changedSwitches } from '../../features/feature-preferences/visibility';
import { useMerchantsQuery } from '../../features/merchants/queries';
import { opens, showsDestination } from '../../features/permissions/access';
import type { IndexRule } from '../../features/permissions/access';
import { usePermissions } from '../../features/role-permissions/queries';
import { FORM_MEASURE, useBottomInset, useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { useSession } from '../../Store/StoreUser';
import { spacing } from '../../themes';
import { ScreenDetail } from './screen-detail';
import { ScreenList } from './screen-list';
import { FeaturesContext, useFeatures } from './use-features';
import type { FeaturesValue } from './use-features';

const INTRO = "Hide the screens and pages you don't use in this store. Only your own menu changes.";

/**
 * Features: which of a store's screens and pages this person keeps in their own menu, with what each is for — the
 * layout of src/app/(app)/systems/[id]/features/, the shell's last destination. It holds the unsaved choices for
 * both of its routes, the unsaved bar under them, and the messages. Hiding is not refusing: nothing is turned off, and nobody
 * else's menu changes.
 */
export function FeaturesProvider({ merchantId, children }: { merchantId: string; children: ReactNode }) {
  const preferences = useFeaturePreferencesQuery({ merchantId, fresh: true });
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === merchantId);
  const userId = useSession()?.user.id;
  const permissions = usePermissions({ merchantId });
  const isOwner = merchant?.owner_id === userId;
  // The switches start from what the server holds now, not the cache's copy (`fresh`): the save writes the whole
  // set. Offline, from the copy — the save waits for a connection either way.
  const current = preferences.isFetchedAfterMount || preferences.isPaused;

  if (current && preferences.data !== undefined && merchant && (isOwner || permissions.data)) {
    const opensPage = (page: IndexRule) => isOwner || opens(page, permissions.data);
    const screens = DESTINATIONS.filter((screen) => !screen.fixed && (isOwner || showsDestination(screen, permissions.data)));
    // Never saved: the store level's menu is what is saved (src/features/merchants/levels.ts). Keyed by the level, so the
    // owner's change of it starts the choices again from the new level's menu (the change deleted everyone's).
    return (
      <Draft
        key={merchant.level}
        merchantId={merchantId}
        storeName={merchant.name}
        level={merchant.level}
        isOwner={isOwner}
        saved={hiddenOf(preferences.data, merchant.level)}
        screens={screens}
        opensPage={opensPage}
      >
        {children}
      </Draft>
    );
  }

  // Waiting for the choices or the permissions: where they are — a spinner while the cached choices are asked again.
  const query = preferences.data !== undefined && current ? permissions : preferences;
  return (
    <View style={styles.fill}>
      <PageHeader kicker={merchant?.name ?? ''} title="Features" meta={INTRO} />
      <View style={styles.state}>
        <QueryState query={query} offline="You're offline. Your choices will load when you reconnect." failure="Couldn't load your choices. Try again.">
          <ActivityIndicator />
        </QueryState>
      </View>
    </View>
  );
}

type DraftProps = Omit<FeaturesValue, 'notify' | 'leave'> & { children: ReactNode };

/** The unsaved choices, the bar that saves or resets them, and the guard on leaving with them. */
function Draft({ merchantId, storeName, level, isOwner, saved: loaded, screens, opensPage, children }: DraftProps) {
  const { colors } = useAppTheme();
  const navigation = useNavigation();
  // What was last saved: the server's answer when the page opened, then each save's own values.
  const [saved, setSaved] = useState(loaded);
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<{ hidden: string[] }>({ defaultValues: { hidden: loaded } });
  const hidden = useWatch({ control: form.control, name: 'hidden' });
  const save = useSaveFeaturePreferencesMutation({ merchantId });
  const discard = useDiscard();
  const changes = screens.reduce((sum, screen) => sum + changedSwitches(saved, hidden, screen, opensPage), 0);
  const notice = mutationNotice(save, failureMessage("Couldn't save your choices. Try again."));

  // Android's back on the list goes Home, as on every destination (the drawer's first route); with choices unsaved it
  // asks first, and Discard drops them, since the drawer keeps this screen. Another rail item keeps them instead,
  // for when the person comes back.
  const leave = () => {
    if (changes === 0) return false;
    discard.ask(true, () => {
      form.reset({ hidden: saved });
      // The drawer's own NAVIGATE (as the shell's TOGGLE_DRAWER): this navigation is the Features route's, in the drawer.
      // It also brings the store back to the top of the app's stack, which closes the narrow ask's sheet — a
      // router.back() here as well took the person out of the store (phone width, 2026-10-21).
      navigation.dispatch({ type: 'NAVIGATE', payload: { name: 'index', params: { id: merchantId } } });
    });
    return true;
  };
  const send = saveOnce(save, (values: string[]) => {
    setSaved(values);
    form.reset({ hidden: values });
    setMessage('Saved. Your menu now shows only what you chose.');
  });
  const submit = form.handleSubmit((values) => send(values.hidden));

  return (
    <FeaturesContext value={{ merchantId, storeName, level, isOwner, screens, saved, opensPage, notify: setMessage, leave }}>
      <FormProvider {...form}>
        <View style={[styles.fill, { backgroundColor: colors.background }]}>
          <View style={styles.fill}>
            {children}
            <Snackbar visible={message !== null} onDismiss={() => setMessage(null)} duration={4000}>
              {message ?? ''}
            </Snackbar>
          </View>
          {changes > 0 ? <UnsavedBar changes={changes} notice={notice} mutation={save} onReset={() => form.reset({ hidden: saved })} onSave={submit} /> : null}
        </View>
      </FormProvider>
      {discard.dialog}
    </FeaturesContext>
  );
}

type BarProps = {
  changes: number;
  notice: ReturnType<typeof mutationNotice>;
  mutation: { isPending: boolean; isPaused: boolean };
  onReset: () => void;
  onSave: () => void;
};

/**
 * The unsaved bar, pinned under the page while a choice differs from the saved ones (frontend.md §5, Full-page
 * form): how many, Reset and Save. A failed or paused save keeps the choices unsaved, so its notice shows here
 * too. Save stays disabled while the write is pending, paused included (data-layer.md §5).
 */
function UnsavedBar({ changes, notice, mutation, onReset, onSave }: BarProps) {
  const wide = useShellWide();
  const inFlight = mutation.isPending && !mutation.isPaused;

  return (
    <FormFooter notice={notice}>
      <View style={wide ? styles.barRow : styles.barStack}>
        <Text variant="bodyMedium" style={wide ? styles.grow : null}>
          {changes === 1 ? '1 unsaved change' : `${changes} unsaved changes`}
        </Text>
        <Button mode="outlined" onPress={onReset} disabled={inFlight} contentStyle={styles.leading}>
          Reset
        </Button>
        <Button mode="contained" onPress={onSave} loading={inFlight} disabled={mutation.isPending} contentStyle={styles.leading}>
          Save
        </Button>
      </View>
    </FormFooter>
  );
}

/**
 * The Features page itself: wide, the screens list beside the open screen (two parts in five, as Roles' panes);
 * narrow, the list (`selected` absent) or one screen's page (`selected`, the route features/[name]).
 */
export function FeaturesScreen({ selected }: { selected?: string }) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const { merchantId, storeName, screens, leave } = useFeatures();
  const [open, setOpen] = useState(selected ?? screens[0]?.name);
  // The end of each list keeps clear of the navigation bar (with the unsaved bar up, a little more room than needed).
  const bottom = { paddingBottom: useBottomInset() };
  const onList = wide || !selected;

  // Android's back on the list: the provider's leave. On a screen's page it returns to the list, which keeps the choices.
  useFocusEffect(
    useCallback(() => {
      if (!onList) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', leave);
      return () => subscription.remove();
    }, [onList, leave])
  );

  const shown = screens.find((screen) => screen.name === (wide ? open : selected));
  // The list is a destination's root, so no back arrow; a screen's page on a phone returns to it.
  const header = <PageHeader kicker={storeName} title="Features" meta={INTRO} onBack={onList ? undefined : () => router.back()} />;

  if (wide) {
    return (
      <View style={styles.fill}>
        {header}
        <View style={styles.panes}>
          <ScrollView style={styles.listPane} contentContainerStyle={bottom}>
            <ScreenList selected={shown?.name} chevron={false} onOpen={setOpen} />
          </ScrollView>
          <View style={[styles.rule, { backgroundColor: colors.outlineVariant }]} />
          {/* Keyed by the screen, so another one opens at its top rather than at the last one's scroll. */}
          <ScrollView key={shown?.name} style={styles.detailPane} contentContainerStyle={[styles.measure, bottom]}>
            {shown ? <ScreenDetail screen={shown} /> : null}
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      {header}
      <ScrollView contentContainerStyle={bottom}>
        {selected ? (
          <ScreenPage screen={shown} />
        ) : (
          <ScreenList chevron onOpen={(name) => router.push({ pathname: '/systems/[id]/features/[name]', params: { id: merchantId, name } })} />
        )}
      </ScrollView>
    </View>
  );
}

/** One screen's page on a phone: its choices, or why there are none to make. */
function ScreenPage({ screen }: { screen: Destination | undefined }) {
  if (screen) return <ScreenDetail screen={screen} />;

  return (
    <Text variant="bodyMedium" style={styles.state}>
      This screen isn&apos;t yours to show or hide in this store.
    </Text>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  // The list two parts in five, the open screen three, a 1px rule between (frontend.md §5, Two panes on a tablet).
  panes: { flex: 1, flexDirection: 'row' },
  listPane: { flex: 2 },
  detailPane: { flex: 3 },
  rule: { width: 1 },
  measure: { width: '100%', maxWidth: FORM_MEASURE },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barStack: { gap: spacing.sm },
  grow: { flex: 1 },
  // Full-width buttons put their label at the left edge (.claude/instruction-mds/frontend.md §5).
  leading: { justifyContent: 'flex-start' },
});
