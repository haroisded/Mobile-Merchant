import type { ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import type { Destination } from '../../components/destinations';
import { Icon } from '../../components/icon';
import { IconButton } from '../../components/icon-button';
import { NoteCallout } from '../../components/note-callout';
import type { IndexEntry, IndexSection } from '../../components/record-index';
import { Switch } from '../../components/switch';
import { Text } from '../../components/text';
import { hasCore, pageShown, screenShown, screenStatus, setPages, setScreen } from '../../features/feature-preferences/visibility';
import type { ScreenStatus } from '../../features/feature-preferences/visibility';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';
import { useAbout } from './about';
import { STATUS } from './screen-list';
import { useFeatures } from './use-features';

type Entry = IndexEntry<string>;

/** The pages of a screen the person may open: the core ones (Sell's session box, Stock's Items), then the sections less them. */
function pagesFor(screen: Destination, opensPage: (page: Entry) => boolean) {
  const opened = (screen.sections ?? []).map((section) => ({ ...section, entries: section.entries.filter(opensPage) }));
  const core = [...(screen.core && opensPage(screen.core) ? [screen.core] : []), ...opened.flatMap((section) => section.entries.filter((entry) => entry.core))];
  const sections = opened.map((section) => ({ ...section, entries: section.entries.filter((entry) => !entry.core) })).filter((section) => section.entries.length > 0);
  return { core, sections };
}

/**
 * One screen on the Features page: its own switch, then its core (no switch: it goes only with the screen), then its
 * pages by the sections of its index, each with Hide all / Show all. A screen that is off locks its pages.
 */
export function ScreenDetail({ screen }: { screen: Destination }) {
  const { opensPage, notify } = useFeatures();
  const { setValue } = useFormContext<{ hidden: string[] }>();
  const hidden = useWatch<{ hidden: string[] }, 'hidden'>({ name: 'hidden' });
  const about = useAbout();

  const on = screenShown(hidden, screen, opensPage);
  const cored = hasCore(screen, opensPage);
  const { core, sections } = pagesFor(screen, opensPage);
  const change = (next: string[]) => setValue('hidden', next, { shouldDirty: true });
  const flipPages = (entries: Entry[], show: boolean) => {
    const next = setPages(hidden, screen, entries, show);
    change(next);
    // A screen with no core is its pages: the last one off takes the screen with it, and says so.
    if (!show && !cored && !screenShown(next, screen, opensPage)) notify(`Every page of ${screen.label} is off, so ${screen.label} is now hidden too.`);
  };
  const aboutPage = (entry: Entry) => () => about.show({ title: entry.label, kind: `Page of ${screen.label}`, purpose: entry.purpose, useCase: entry.useCase });

  return (
    <View style={styles.detail}>
      <ScreenHead
        screen={screen}
        on={on}
        status={screenStatus(hidden, screen, opensPage)}
        standsAlone={sections.length > 0 && !cored}
        onToggle={(next) => change(setScreen(hidden, screen, next, opensPage))}
        onAbout={() => about.show({ title: screen.label, kind: 'Screen', purpose: screen.purpose, useCase: screen.useCase })}
      />
      {core.length > 0 ? (
        <PageBox title={`Core · Always on with ${screen.label}`}>
          {core.map((entry, index) => (
            <PageRow key={entry.route} entry={entry} first={index === 0} on={on} value={on} onAbout={aboutPage(entry)} />
          ))}
        </PageBox>
      ) : null}
      {sections.map((section) => (
        <SectionBox key={section.title} section={section} screen={screen.name} hidden={hidden} on={on} onFlip={flipPages} onAbout={aboutPage} />
      ))}
      {about.dialog}
    </View>
  );
}

type HeadProps = {
  screen: Destination;
  on: boolean;
  status: ScreenStatus;
  /** No core: its pages are what it is, and the head says so. */
  standsAlone: boolean;
  onToggle: (next: boolean) => void;
  onAbout: () => void;
};

/** The screen's head: its icon, name, what it shows, its About and its own switch, and the notes on what hiding does. */
function ScreenHead({ screen, on, status, standsAlone, onToggle, onAbout }: HeadProps) {
  const { colors } = useAppTheme();
  const statusColor = { shown: colors.onSurface, partial: colors.onSurfaceMuted, hidden: colors.onSurfaceFaint }[status.state];
  const single = !screen.sections && !screen.core;

  return (
    <View style={[styles.box, styles.head, { borderColor: colors.outlineVariant }]}>
      <View style={styles.headRow}>
        {/* The screen's icon in the accent (.claude/instruction-mds/frontend.md §2.3). */}
        <View style={[styles.tile, { backgroundColor: colors.surfaceMuted }]}>
          <Icon source={screen.icon} size={24} color={colors.accent} />
        </View>
        <View style={styles.text}>
          <View style={styles.titleRow}>
            <Text variant="headlineSmall">{screen.label}</Text>
            <Text variant="labelMedium" style={{ color: statusColor }}>
              {STATUS[status.state]}
            </Text>
          </View>
          <Text variant="bodyMedium">{screen.summary}</Text>
        </View>
        <AboutButton label={screen.label} onPress={onAbout} />
        {/* A switch that is on is one of the accent's places (.claude/instruction-mds/frontend.md §2.3). */}
        <Switch value={on} onValueChange={onToggle} color={colors.accent} accessibilityLabel={`Show ${screen.label}`} />
      </View>
      {single ? <NoteCallout>This screen is a single page, so this switch is all there is.</NoteCallout> : null}
      {standsAlone ? (
        <NoteCallout>{`Every page here stands on its own. Turning off every page turns ${screen.label} off; turning ${screen.label} on again shows all its pages.`}</NoteCallout>
      ) : null}
      <NoteCallout>Hiding only removes it from the menu. Nothing is deleted or disabled.</NoteCallout>
    </View>
  );
}

type SectionProps = {
  section: IndexSection<string>;
  screen: string;
  hidden: string[];
  on: boolean;
  onFlip: (entries: Entry[], show: boolean) => void;
  onAbout: (entry: Entry) => () => void;
};

/** A section of the screen's index: its pages' switches, and Hide all — Show all once one of them is hidden. */
function SectionBox({ section, screen, hidden, on, onFlip, onAbout }: SectionProps) {
  const { colors } = useAppTheme();
  const anyHidden = section.entries.some((entry) => !pageShown(hidden, screen, entry));
  const all =
    section.entries.length > 1 ? (
      // An inline text action: the accent (.claude/instruction-mds/frontend.md §2.3).
      <Button mode="text" textColor={colors.accent} disabled={!on} onPress={() => onFlip(section.entries, anyHidden)}>
        {anyHidden ? 'Show all' : 'Hide all'}
      </Button>
    ) : null;

  return (
    <PageBox title={section.title} action={all}>
      {section.entries.map((entry, index) => (
        <PageRow
          key={entry.route}
          entry={entry}
          first={index === 0}
          on={on}
          value={on && pageShown(hidden, screen, entry)}
          onChange={(next) => onFlip([entry], next)}
          onAbout={onAbout(entry)}
        />
      ))}
    </PageBox>
  );
}

/** A box of pages under a header strip: the section's name, and Hide all / Show all at its end. */
function PageBox({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.box, { borderColor: colors.outlineVariant }]}>
      {/* A toolbar's ground (.claude/instruction-mds/frontend.md §2.2). */}
      <View style={[styles.strip, { backgroundColor: colors.surfaceSubtle, borderBottomColor: colors.outlineVariant }]}>
        <Text variant="labelMedium" style={[styles.stripTitle, { color: colors.secondary }]}>
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

type PageRowProps = {
  entry: Entry;
  first: boolean;
  /** Whether the screen is on: off, the row greys out and its switch cannot move. */
  on: boolean;
  value: boolean;
  /** Absent on a core page, which shows "Always on" instead of a switch. */
  onChange?: (next: boolean) => void;
  onAbout: () => void;
};

/** A page: its name and hint, its About, and its switch — the whole row pressable (.claude/instruction-mds/frontend.md §5). */
function PageRow({ entry, first, on, value, onChange, onAbout }: PageRowProps) {
  const { colors } = useAppTheme();
  const live = on && !!onChange;
  const faint = on ? null : { color: colors.onSurfaceFaint };

  return (
    <Pressable
      onPress={live ? () => onChange(!value) : undefined}
      disabled={!live}
      // Pressable reads no theme, so the press colour is passed every time (.claude/instruction-mds/frontend.md §5).
      android_ripple={{ color: colors.ripple }}
      accessibilityRole={onChange ? 'switch' : 'text'}
      accessibilityState={onChange ? { checked: value, disabled: !live } : undefined}
      accessibilityLabel={onChange ? `Show ${entry.label}` : `${entry.label}, always on`}
      style={[styles.row, first ? null : { borderTopWidth: 1, borderTopColor: colors.surfaceVariant }]}
    >
      <View style={styles.text}>
        <Text variant="titleSmall" style={faint}>
          {entry.label}
        </Text>
        <Text variant="bodySmall" style={faint ?? { color: colors.onSurfaceMuted }}>
          {entry.hint}
        </Text>
      </View>
      <AboutButton label={entry.label} onPress={onAbout} />
      {onChange ? (
        // The row is the switch for a screen reader.
        <Switch value={value} onValueChange={onChange} disabled={!live} color={colors.accent} accessibilityElementsHidden importantForAccessibility="no" />
      ) : (
        <AlwaysOn on={on} />
      )}
    </Pressable>
  );
}

/** A core page's tag in its switch's place, in the type badge's shape (frontend.md §5): a disabled switch drawn grey reads as off. */
function AlwaysOn({ on }: { on: boolean }) {
  const { colors } = useAppTheme();
  const ink = on ? colors.onSurface : colors.onSurfaceFaint;

  return (
    <View style={[styles.tag, { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceMuted }]}>
      <Icon source="lock" size={14} color={ink} />
      <Text variant="labelMedium" style={{ color: ink }}>
        Always on
      </Text>
    </View>
  );
}

/** The (i) beside a row: what it is for, and when to use it. */
function AboutButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <IconButton icon="info" size={20} iconColor={colors.onSurfaceMuted} onPress={onPress} accessibilityLabel={`About ${label}`} style={styles.about} />;
}

const styles = StyleSheet.create({
  detail: { gap: spacing.md, padding: spacing.md },
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  head: { gap: spacing.ms, padding: spacing.md },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: spacing.sm },
  // The icon on its ground: a size, not spacing.
  tile: { width: 48, height: 48, borderRadius: radius.md, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, flexShrink: 1, gap: spacing.xs },
  strip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingLeft: spacing.md, paddingRight: spacing.xs, borderBottomWidth: 1 },
  stripTitle: { flex: 1, paddingVertical: spacing.ms },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 64, paddingHorizontal: spacing.md, paddingVertical: spacing.ms },
  tag: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  // IconButton ships a 6dp margin of its own; zeroed so the row's gap is the only spacing. No outline: the glyph is its
  // own circle (the human, 2026-11-06). Sized past the glyph, so the touch target stays 48.
  about: { margin: 0, width: 48, height: 48 },
});
