import { router } from 'expo-router';
import { useFormContext, useWatch } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { DESTINATIONS } from '../../components/destinations';
import type { Destination } from '../../components/destinations';
import { Icon } from '../../components/icon';
import { Text } from '../../components/text';
import { changedSwitches, screenStatus } from '../../features/feature-preferences/visibility';
import type { ScreenStatus } from '../../features/feature-preferences/visibility';
import { levelHidden, levelInfo } from '../../features/merchants/levels';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';
import { useFeatures } from './use-features';

/** What the Features page calls a screen's state, in its list and its head. */
export const STATUS = { shown: 'Shown', partial: 'Some pages hidden', hidden: 'Hidden' } satisfies Record<ScreenStatus['state'], string>;

/**
 * The Features page's list: what is always in the menu, then each screen the person may open with what they chose
 * for it. A pane beside the open screen on a tablet (`selected`), its own page on a phone (`chevron`).
 */
export function ScreenList({ selected, chevron, onOpen }: { selected?: string; chevron: boolean; onOpen: (name: string) => void }) {
  const { colors } = useAppTheme();
  const { screens, saved, opensPage } = useFeatures();
  const hidden = useWatch<{ hidden: string[] }, 'hidden'>({ name: 'hidden' });

  return (
    <View style={styles.list}>
      <StoreLevel hidden={hidden} />
      <View style={styles.group}>
        <Text variant="labelMedium" style={{ color: colors.secondary }}>
          Always visible
        </Text>
        {/* Home is the way in, and Features the way back to anything hidden: neither has a switch. */}
        {DESTINATIONS.filter((entry) => entry.fixed).map(({ label }) => (
          <View key={label} style={styles.fixed}>
            <Icon source="lock" size={18} color={colors.onSurfaceMuted} />
            <Text variant="titleSmall" style={{ color: colors.onSurfaceMuted }}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.group}>
        <Text variant="labelMedium" style={{ color: colors.secondary }}>
          Screens
        </Text>
        <View style={[styles.box, { borderColor: colors.outlineVariant }]}>
          {screens.map((screen, index) => (
            <ScreenRow
              key={screen.name}
              screen={screen}
              status={screenStatus(hidden, screen, opensPage)}
              changed={changedSwitches(saved, hidden, screen, opensPage) > 0}
              first={index === 0}
              selected={screen.name === selected}
              chevron={chevron}
              onOpen={() => onOpen(screen.name)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

/** The same keys, whatever their order: what the menu shows does not depend on it. */
const sameKeys = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((key) => b.includes(key));

/**
 * The store's level (src/features/merchants/levels.ts): the menu everyone here starts from. The owner changes it
 * (forms/store-level); anyone whose choices differ from it can take its menu back — an unsaved change, as any other.
 */
function StoreLevel({ hidden }: { hidden: string[] }) {
  const { colors } = useAppTheme();
  const { merchantId, level, isOwner } = useFeatures();
  const { setValue } = useFormContext<{ hidden: string[] }>();
  const info = levelInfo(level);
  const preset = levelHidden(level);

  return (
    <View style={styles.group}>
      <Text variant="labelMedium" style={{ color: colors.secondary }}>
        Store level
      </Text>
      <View style={[styles.box, styles.level, { borderColor: colors.outlineVariant }]}>
        <Text variant="titleMedium">{`Level ${info.level} · ${info.name}`}</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {info.summary}
        </Text>
        <View style={styles.actions}>
          {isOwner ? (
            <Button mode="outlined" onPress={() => router.push({ pathname: '/forms/store-level', params: { merchantId } })}>
              Change Level
            </Button>
          ) : null}
          {/* An inline text action in the accent (.claude/instruction-mds/frontend.md §2.3). */}
          {sameKeys(hidden, preset) ? null : (
            <Button mode="text" textColor={colors.accent} onPress={() => setValue('hidden', preset, { shouldDirty: true })}>
              {`Use Level ${info.level}'s menu`}
            </Button>
          )}
        </View>
      </View>
    </View>
  );
}

type RowProps = {
  screen: Destination;
  status: ScreenStatus;
  /** Its choices differ from the saved ones: an accent dot. */
  changed: boolean;
  first: boolean;
  selected: boolean;
  chevron: boolean;
  onOpen: () => void;
};

/** A screen: its icon, name, what it shows and how many of its pages, the unsaved dot. */
function ScreenRow({ screen, status, changed, first, selected, chevron, onOpen }: RowProps) {
  const { colors } = useAppTheme();
  const off = status.state === 'hidden';
  const word = `${STATUS[status.state]}${screen.ownerOnly ? ' · Owner' : ''}`;

  return (
    <Pressable
      onPress={onOpen}
      // Pressable reads no theme, so the press colour is passed every time (.claude/instruction-mds/frontend.md §5).
      android_ripple={{ color: colors.ripple }}
      accessibilityRole="button"
      accessibilityLabel={`${screen.label}, ${word}${status.total > 0 ? `, ${status.shown} of ${status.total} pages` : ''}${changed ? ', not saved' : ''}`}
      accessibilityState={{ selected }}
      style={[
        styles.row,
        first ? null : { borderTopWidth: 1, borderTopColor: colors.surfaceVariant },
        // The open screen beside the list: the selected row's ground (.claude/instruction-mds/frontend.md §2.2).
        selected ? { backgroundColor: colors.surfaceMuted } : null,
      ]}
    >
      <View style={[styles.tile, { backgroundColor: colors.surfaceVariant }]}>
        <Icon source={screen.icon} size={22} color={off ? colors.onSurfaceFaint : colors.onSurface} />
      </View>
      <View style={styles.text}>
        <Text variant="titleMedium" style={off ? { color: colors.onSurfaceFaint } : null}>
          {screen.label}
        </Text>
        <Text variant="bodySmall" style={{ color: off ? colors.onSurfaceFaint : colors.onSurfaceMuted }}>
          {word}
        </Text>
      </View>
      {status.total > 0 ? (
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {`${status.shown}/${status.total}`}
        </Text>
      ) : null}
      {/* An unsaved change's dot: the accent, as an unread notification's (.claude/instruction-mds/frontend.md §2.3). */}
      {changed ? <Badge size={10} style={{ backgroundColor: colors.accent }} /> : null}
      {chevron ? <Icon source="chevron-right" size={20} color={colors.onSurfaceMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.lg, padding: spacing.md },
  group: { gap: spacing.sm },
  fixed: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, minHeight: 40, paddingHorizontal: spacing.sm },
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  level: { gap: spacing.xs, padding: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, minHeight: 64, paddingHorizontal: spacing.md, paddingVertical: spacing.ms },
  // The icon on a thumbnail's ground (.claude/instruction-mds/frontend.md §5, Thumbnail placeholder): a size, not spacing.
  tile: { width: 40, height: 40, borderRadius: radius.md, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: spacing.xs },
});
