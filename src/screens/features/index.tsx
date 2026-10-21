import type { ReactNode } from 'react';
import { useController, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { DESTINATIONS } from '../../components/destinations';
import type { Destination } from '../../components/destinations';
import { HelperText } from '../../components/helper-text';
import { QueryState } from '../../components/query-state';
import type { IndexEntry } from '../../components/record-index';
import { Switch } from '../../components/switch';
import { Text } from '../../components/text';
import { useFeaturePreferencesQuery, useSaveFeaturePreferencesMutation } from '../../features/feature-preferences/queries';
import { hasCore, pageShown, screenShown, setPage, setScreen } from '../../features/feature-preferences/visibility';
import { useMerchantsQuery } from '../../features/merchants/queries';
import { opens, showsDestination } from '../../features/permissions/access';
import type { IndexRule } from '../../features/permissions/access';
import { usePermissions } from '../../features/role-permissions/queries';
import { failureMessage, mutationNotice } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { useSession } from '../../Store/StoreUser';
import { radius, spacing } from '../../themes';

type Props = { merchantId: string; onDismiss: () => void };

/**
 * Features: which of a store's screens and pages this person keeps in their own menu, with what each is for — the
 * body of src/app/(app)/forms/features.tsx (a page narrow, a Dialog wide), opened from the store's header. Hiding
 * is not refusing: nothing is turned off, the person's own choice is all that changes, and nobody else's menu.
 */
export function FeaturesForm({ merchantId, onDismiss }: Props) {
  const preferences = useFeaturePreferencesQuery({ merchantId, fresh: true });
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === merchantId);
  const userId = useSession()?.user.id;
  const permissions = usePermissions({ merchantId });
  const isOwner = merchant?.owner_id === userId;
  // The switches start from what the server holds now, not the cache's copy (`fresh`); offline, from the copy —
  // the save waits for a connection either way.
  const current = preferences.isFetchedAfterMount || preferences.isPaused;
  const ready = current && preferences.data && merchant && (isOwner || permissions.data);

  if (ready) return <Form merchantId={merchantId} kicker={merchant.name} hidden={preferences.data} isOwner={isOwner} permissions={permissions.data} onDismiss={onDismiss} />;

  // Waiting for the choices or the permissions: the same Dialog, with where they are — a spinner while the cached
  // choices are asked for again.
  const query = preferences.data && current ? permissions : preferences;
  return (
    <AdaptiveDialog asPage onDismiss={onDismiss} kicker={merchant?.name} title="Features" actions={<FormActions mutation={{ isPending: false, isPaused: false }} onCancel={onDismiss} />}>
      <QueryState query={query} offline="You're offline. Your choices will load when you reconnect." failure="Couldn't load your choices. Try again.">
        <ActivityIndicator />
      </QueryState>
    </AdaptiveDialog>
  );
}

type FormProps = {
  merchantId: string;
  kicker: string;
  hidden: string[];
  isOwner: boolean;
  permissions: ReturnType<typeof usePermissions>['data'];
  onDismiss: () => void;
};

function Form({ merchantId, kicker, hidden: saved, isOwner, permissions, onDismiss }: FormProps) {
  const save = useSaveFeaturePreferencesMutation({ merchantId });
  const { control, handleSubmit } = useForm<{ hidden: string[] }>({ defaultValues: { hidden: saved } });
  const { field } = useController({ control, name: 'hidden' });
  const hidden = field.value;
  const notice = mutationNotice(save, failureMessage("Couldn't save your choices. Try again."));
  // What the person may open, as their menu and indexes decide it: the Features page lists only that.
  const opensPage = (page: IndexRule) => isOwner || opens(page, permissions);
  const screens = DESTINATIONS.filter((screen) => screen.name !== 'index' && (isOwner || showsDestination(screen, permissions)));
  const send = saveOnce(save, onDismiss);
  const submit = handleSubmit((values) => send(values.hidden));

  return (
    <AdaptiveDialog
      asPage
      onDismiss={onDismiss}
      dismissable={!(save.isPending && !save.isPaused)}
      kicker={kicker}
      title="Features"
      actions={<FormActions mutation={save} onCancel={onDismiss} onSave={submit} />}
    >
      <Text variant="bodyMedium">
        Hide the screens and pages you don&apos;t use in this store. They only leave your own menu: nothing is turned off, and
        nobody else&apos;s menu changes. Turn one back on here at any time.
      </Text>
      {/* The write's line goes at the top, not under the body as a small form's does: the list is long, and a
          line at its end is never seen next to Save. */}
      {notice ? (
        <HelperText type={notice.type} visible padding="none">
          {notice.text}
        </HelperText>
      ) : null}
      {screens.map((screen) => (
        <ScreenGroup
          key={screen.name}
          screen={screen}
          hidden={hidden}
          opensPage={opensPage}
          onChange={field.onChange}
        />
      ))}
    </AdaptiveDialog>
  );
}

type GroupProps = {
  screen: Destination;
  hidden: string[];
  opensPage: (page: IndexRule) => boolean;
  onChange: (next: string[]) => void;
};

/** One screen's switch, then its pages' — grouped as its index groups them. */
function ScreenGroup({ screen, hidden, opensPage, onChange }: GroupProps) {
  const { colors } = useAppTheme();
  const on = screenShown(hidden, screen, opensPage);
  const cored = hasCore(screen, opensPage);
  const sections = (screen.sections ?? [])
    .map((section) => ({ ...section, entries: section.entries.filter(opensPage) }))
    .filter((section) => section.entries.length > 0);
  const core = screen.core && opensPage(screen.core) ? screen.core : null;
  const flipPage = (page: IndexEntry<string>, next: boolean) => onChange(setPage(hidden, screen, page, next, opensPage));

  return (
    <View style={styles.group}>
      <View style={[styles.box, { borderColor: colors.outlineVariant }]}>
        <SwitchRow
          title={screen.label}
          titleVariant="titleMedium"
          details={screen.details}
          note={sections.length > 0 && !cored ? `Turning off every page below turns ${screen.label} off.` : null}
          value={on}
          onChange={(next) => onChange(setScreen(hidden, screen, next, opensPage))}
        />
      </View>
      {core ? (
        <PageBox title={`Always on with ${screen.label}`}>
          <SwitchRow title={core.label} details={core.details} note={`Part of ${screen.label}: it goes only when ${screen.label} does.`} value={on} core />
        </PageBox>
      ) : null}
      {sections.map((section) => (
        <PageBox key={section.title} title={section.title}>
          {section.entries.map((page, index) => (
            <SwitchRow
              key={page.route}
              first={index === 0}
              title={page.label}
              details={page.details}
              note={page.core ? `Part of ${screen.label}: it goes only when ${screen.label} does.` : null}
              value={on && pageShown(hidden, screen.name, page)}
              core={page.core}
              // A core page has no switch of its own; the pages of a screen that is off wait for it, unless the screen
              // is its pages (no core), where a page turned on brings the screen back.
              onChange={page.core || (!on && cored) ? undefined : (next) => flipPage(page, next)}
            />
          ))}
        </PageBox>
      ))}
    </View>
  );
}

/** A section of a screen's pages: its heading, then a box of rows, set in under the screen's own row. */
function PageBox({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.pages}>
      <Text variant="labelMedium" style={{ color: colors.secondary }}>
        {title}
      </Text>
      <View style={[styles.box, { borderColor: colors.outlineVariant }]}>{children}</View>
    </View>
  );
}

type RowProps = {
  title: string;
  titleVariant?: 'titleMedium' | 'titleSmall';
  details: string;
  /** A muted line under the details: why the switch cannot move, or what it does to the screen. */
  note?: string | null;
  value: boolean;
  /** Absent: the switch shows the state and cannot move. */
  onChange?: (next: boolean) => void;
  /** No hairline above the first row of a box. */
  first?: boolean;
  /** A core page: a tag saying so in the switch's place, which a disabled switch drawn grey would read as off. */
  core?: boolean;
};

/** A name, what it is for, and its switch — the whole row pressable (.claude/instruction-mds/frontend.md §5). */
function SwitchRow({ title, titleVariant = 'titleSmall', details, note, value, onChange, first = true, core = false }: RowProps) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={onChange ? () => onChange(!value) : undefined}
      disabled={!onChange}
      // Pressable reads no theme, so the press colour is passed every time (.claude/instruction-mds/frontend.md §5).
      android_ripple={{ color: colors.ripple }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !onChange }}
      accessibilityLabel={title}
      style={[styles.row, first ? null : { borderTopWidth: 1, borderTopColor: colors.surfaceVariant }]}
    >
      <View style={styles.text}>
        <Text variant={titleVariant}>{title}</Text>
        <Text variant="bodyMedium">{details}</Text>
        {note ? (
          <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
            {note}
          </Text>
        ) : null}
      </View>
      {core ? (
        <View style={[styles.tag, { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceMuted }]}>
          <Text variant="labelMedium">{value ? 'Always on' : 'Off with it'}</Text>
        </View>
      ) : (
        // A switch that is on is one of the accent's places (.claude/instruction-mds/frontend.md §2.3).
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={!onChange}
          color={colors.accent}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  // Set in one step under the screen's row, so a page reads as part of its screen.
  pages: { gap: spacing.xs, paddingLeft: spacing.md },
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.ms },
  text: { flex: 1, gap: spacing.xs },
  // The type badge's shape (.claude/instruction-mds/frontend.md §5): a 1px box on surfaceMuted.
  tag: { borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
});
