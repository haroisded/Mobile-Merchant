import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSpacer } from '../../components/bottom-spacer';
import { CellRows } from '../../components/cell-rows';
import { menuOf } from '../../components/destinations';
import type { Destination } from '../../components/destinations';
import { Icon } from '../../components/icon';
import { IconTile, TonalIcon } from '../../components/icon-tile';
import { PageHeader } from '../../components/page-header';
import { SectionHeading } from '../../components/section-heading';
import { useShellMenu } from '../../components/shell-menu';
import type { MenuName } from '../../components/shell-menu';
import { Text } from '../../components/text';
import { useHiddenFeatures } from '../../features/feature-preferences/queries';
import { useMerchant } from '../../features/merchants/queries';
import { useProfileQuery } from '../../features/profiles/queries';
import { usePermissions } from '../../features/role-permissions/queries';
import { fontScaled, READING_MEASURE, useColumns } from '../../lib/columns';
import type { IconName } from '../../lib/icons';
import { useAppTheme } from '../../lib/theme';
import { useSession } from '../../Store/StoreUser';
import { radius, spacing } from '../../themes';

// A shortcut's narrowest width, and the width from which the guide stands beside them.
const SHORTCUT_MIN = 240;
const PANE_MIN = 420;

const greeting = (hour: number) => (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');

const hasMenu = (name: string): name is MenuName => name === 'setup' || name === 'stock';

type Step = { icon: IconName; title: string; line: string; onPress?: () => void };

type Opener = (name: string) => (() => void) | undefined;

const FEATURES_STEP = { icon: 'tune', title: 'Keep your menu to what you use', line: 'Hide the screens you do not need on Features' } satisfies Step;

/** The owner's order to set a store up in. A step whose screen is not in their menu is left out. */
const ownerSteps = (opener: Opener): Step[] =>
  (
    [
      { icon: 'stock', title: 'Add what you sell', line: 'Your products, their prices and what you have on hand', onPress: opener('stock') },
      { icon: 'sell', title: 'Make your first sale', line: 'Open a session with the cash in the drawer, then ring items up', onPress: opener('sell') },
      // Employees, not the Access Codes tab: that tab is outside the store, so a tap there left it and Back did not return (tablet, 2026-11-06).
      { icon: 'key', title: 'Let your staff in', line: 'Each person joins with an access code from your stores page, then gets a role here', onPress: opener('employees') },
      { ...FEATURES_STEP, onPress: opener('features') },
    ] satisfies Step[]
  ).filter((step) => step.onPress);

const staffSteps = (opener: Opener): Step[] => [
  { icon: 'menu', title: 'Your menu is your work', line: 'It shows what the owner has given you to do here' },
  { icon: 'bell', title: 'Notifications keep you posted', line: 'The bell tells you when your access changes' },
  { ...FEATURES_STEP, onPress: opener('features') },
];

const GUIDE_STEP: Step = { icon: 'help', title: 'Store Guide', line: 'Learn each role in a practice store. Nothing is saved', onPress: () => router.push('/guide') };

const firstWord = (name?: string | null) => (name ?? '').split(/\s+/)[0];

const titleOf = (name: string, now: Date) => (name ? `${greeting(now.getHours())}, ${name}` : greeting(now.getHours()));

/**
 * The first screen inside a store (the human, 2026-11-06). Introductory only, so it is safe for anyone let in: a
 * greeting, a shortcut to each screen in the person's own menu (their permissions and Features choices already decide
 * those), and a short guide — where to start for the owner, how the app works here for staff. No figures and no store
 * records beyond its name: what a person may see lives on the screens that check it.
 */
export function SystemHome({ merchantId }: { merchantId: string }) {
  const merchant = useMerchant(merchantId)?.merchant;
  const user = useSession()?.user;
  const profile = useProfileQuery().data;
  const permissions = usePermissions({ merchantId }).data;
  const hidden = useHiddenFeatures({ merchantId, level: merchant?.level });
  const { openMenu } = useShellMenu();

  const isOwner = merchant !== undefined && merchant.owner_id === user?.id;
  const noRole = !isOwner && permissions?.permissions.length === 0;
  const ownerName = permissions?.owner_name ?? null;
  const screens = menuOf(isOwner, permissions, hidden).shown.filter((entry) => !entry.fixed);
  const firstName = firstWord(profile?.display_name ?? user?.user_metadata.full_name);
  const now = new Date();

  const open = (name: string) => {
    if (hasMenu(name)) openMenu(name);
    router.navigate(`/systems/${merchantId}/${name === 'index' ? '' : name}`);
  };
  // Features is always reachable, in or out of the menu: it is where a hidden screen comes back from.
  const opener = (name: string) => (name === 'features' || screens.some((entry) => entry.name === name) ? () => open(name) : undefined);

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker={merchant?.name ?? ''}
        title={titleOf(firstName, now)}
        meta={now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      />
      <ScrollView contentContainerStyle={styles.body}>
        {noRole ? <NoRoleNote ownerName={ownerName} /> : null}
        <Panes shortcuts={noRole ? null : <Shortcuts screens={screens} onOpen={open} />} guide={<Guide isOwner={isOwner} ownerName={ownerName} opener={opener} />} />
        <BottomSpacer />
      </ScrollView>
    </View>
  );
}

/** The guide beside the shortcuts where there is room, under them where not. */
function Panes({ shortcuts, guide }: { shortcuts: ReactNode; guide: ReactNode }) {
  const { columns, onLayout } = useColumns(PANE_MIN);
  const side = columns > 1;

  return (
    // Keyed: Fabric keeps a laid-out flex when the style switches in place, and the guide ran off the pane when the
    // rail narrowed (.claude/instruction_mds/frontend.md §7).
    <View key={side ? 'panes' : 'stack'} style={side ? styles.panes : styles.stack} onLayout={onLayout}>
      {shortcuts ? <View style={side ? styles.main : null}>{shortcuts}</View> : null}
      <View style={side ? styles.side : null}>{guide}</View>
    </View>
  );
}

function NoRoleNote({ ownerName }: { ownerName: string | null }) {
  return (
    <View style={styles.noRole}>
      <Text variant="headlineSmall">You&apos;re in. The owner hasn&apos;t given you a role yet.</Text>
      <Text variant="bodyMedium" style={styles.measure}>
        {`Once ${ownerName ?? 'they'} ${ownerName ? 'does' : 'do'}, what you may work on shows up in the menu. Notifications tells you when your access changes.`}
      </Text>
    </View>
  );
}

function Shortcuts({ screens, onOpen }: { screens: Destination[]; onOpen: (name: string) => void }) {
  const { columns, onLayout } = useColumns(fontScaled(SHORTCUT_MIN));

  return (
    <>
      <SectionHeading title="Your screens" hint="Where your work is in this store" />
      <View style={styles.grid}>
        <CellRows
          items={screens}
          columns={columns}
          onLayout={onLayout}
          keyOf={(entry) => entry.name}
          render={(entry) => <IconTile icon={entry.icon} title={entry.label} line={entry.summary} onPress={() => onOpen(entry.name)} />}
          rowGap={spacing.ms}
          columnGap={spacing.ms}
        />
      </View>
    </>
  );
}

function Guide({ isOwner, ownerName, opener }: { isOwner: boolean; ownerName: string | null; opener: Opener }) {
  return isOwner ? (
    <GuideBox title="Getting started" hint="A good order to set your store up in" steps={ownerSteps(opener)} />
  ) : (
    <GuideBox title="How it works here" hint={ownerName ? `${ownerName} runs this store` : 'A few things to know'} steps={staffSteps(opener)} />
  );
}

function GuideBox({ title, hint, steps }: { title: string; hint: string; steps: Step[] }) {
  const { colors } = useAppTheme();

  return (
    <>
      <SectionHeading title={title} hint={hint} />
      <View style={[styles.box, styles.grid, { borderColor: colors.outlineVariant, backgroundColor: colors.surface }]}>
        {[...steps, GUIDE_STEP].map((step, index) => (
          <StepRow key={step.title} step={step} first={index === 0} />
        ))}
      </View>
    </>
  );
}

/** A line of the guide: a chevron and a tap where it leads somewhere. */
function StepRow({ step, first }: { step: Step; first: boolean }) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={step.onPress}
      disabled={!step.onPress}
      android_ripple={step.onPress ? { color: colors.ripple } : undefined}
      accessibilityRole={step.onPress ? 'button' : 'text'}
      accessibilityLabel={step.title}
      style={[styles.row, first ? null : { borderTopWidth: 1, borderTopColor: colors.surfaceVariant }]}
    >
      <TonalIcon icon={step.icon} />
      <View style={styles.rowText}>
        <Text variant="titleSmall">{step.title}</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {step.line}
        </Text>
      </View>
      {step.onPress ? <Icon source="chevron-right" size={20} color={colors.onSurfaceMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { gap: spacing.lg, padding: spacing.md },
  noRole: { gap: spacing.sm },
  // Running prose at a reading measure, left-aligned (.claude/instruction_mds/frontend.md rule 18).
  measure: { maxWidth: READING_MEASURE },
  panes: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  stack: { gap: spacing.lg },
  main: { flex: 2 },
  side: { flex: 1 },
  grid: { marginTop: spacing.ms },
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.ms },
  rowText: { flex: 1, gap: spacing.xs },
});
