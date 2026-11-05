import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useHiddenFeatures } from '../features/feature-preferences/queries';
import { useMerchant } from '../features/merchants/queries';
import { usePermissions } from '../features/role-permissions/queries';
import { fontScaled, useColumns, useShellWide } from '../lib/columns';
import { markParts, searchEntries } from '../lib/section-search';
import { useAppTheme } from '../lib/theme';
import { radius, spacing } from '../themes';
import { BottomSpacer } from './bottom-spacer';
import { CellRows } from './cell-rows';
import { Icon } from './icon';
import { IconTile, TonalIcon } from './icon-tile';
import { QueryState } from './query-state';
import { listedSections, nothingListed } from './record-index';
import type { IndexEntry, IndexSection } from './record-index';
import { useShellMenu } from './shell-menu';
import type { MenuName } from './shell-menu';
import { Text } from './text';
import { TextInput } from './text-input';

// A tile's narrowest width; the column count falls out of it (.claude/instruction_mds/frontend.md §4.2).
const TILE_MIN = 240;
// The search box beside the section's name, wide.
const SEARCH_WIDTH = 320;

type Props<R extends string> = {
  merchantId: string;
  /** The destination this is: its dropdown in the sidebar names the section, and the Features page hides its pages. */
  screen: MenuName;
  isOwner: boolean;
  sections: IndexSection<R>[];
  onOpen: (route: R) => void;
  offline: string;
  failure: string;
  empty: string;
  /** The search box's words: "Search settings". */
  placeholder: string;
  /** What is searched, in "No settings match …". */
  noun: string;
  /** Under that line: "Try a word like tax, stock or print." */
  tryWords: string;
};

/**
 * Setup and Stock (.claude/full-system-context/Updates/setup-and-stock, the human, 2026-11-06): the section the sidebar's
 * dropdown picked — its icon, name and description, the search at their far right — over a grid of its pages. A search
 * covers every section the person may open. The same rule as any index decides what is listed (listedSections).
 */
export function SectionBrowser<R extends string>({ merchantId, screen, isOwner, sections, onOpen, offline, failure, empty, placeholder, noun, tryWords }: Props<R>) {
  const { picked } = useShellMenu();
  const permissions = usePermissions({ merchantId });
  const level = useMerchant(merchantId)?.merchant.level;
  const hidden = useHiddenFeatures({ merchantId, level });

  const by = { screen, hidden, isOwner, permissions: permissions.data };
  const shown = listedSections(sections, by);
  const section = shown.find((candidate) => candidate.title === picked[screen]) ?? shown[0];

  if (section) return <SectionPane section={section} shown={shown} onOpen={onOpen} placeholder={placeholder} noun={noun} tryWords={tryWords} />;

  return (
    <View style={styles.state}>
      {isOwner ? null : <PermissionsState permissions={permissions} offline={offline} failure={failure} />}
      {nothingListed(by, shown.length) ? <Text variant="bodyMedium">{empty}</Text> : null}
    </View>
  );
}

type PaneProps<R extends string> = Pick<Props<R>, 'onOpen' | 'placeholder' | 'noun' | 'tryWords'> & { section: IndexSection<R>; shown: IndexSection<R>[] };

function SectionPane<R extends string>({ section, shown, onOpen, placeholder, noun, tryWords }: PaneProps<R>) {
  const wide = useShellWide();
  const [term, setTerm] = useState('');
  const search = <SearchField term={term} onChange={setTerm} placeholder={placeholder} />;

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {/* The search: the far right of the section's name. A phone has no room beside it: its own row, under it. */}
      <SectionHead section={section}>{wide ? search : null}</SectionHead>
      {wide ? null : search}
      {term.trim() ? (
        <Results sections={shown} term={term} onOpen={onOpen} noun={noun} tryWords={tryWords} />
      ) : (
        <Tiles entries={section.entries} onOpen={onOpen} />
      )}
      <BottomSpacer />
    </ScrollView>
  );
}

function PermissionsState({ permissions, offline, failure }: { permissions: ReturnType<typeof usePermissions>; offline: string; failure: string }) {
  return permissions.data ? null : <QueryState query={permissions} offline={offline} failure={failure} />;
}

function SearchField({ term, onChange, placeholder }: { term: string; onChange: (term: string) => void; placeholder: string }) {
  return (
    <TextInput
      mode="outlined"
      dense
      value={term}
      onChangeText={onChange}
      placeholder={placeholder}
      accessibilityLabel={placeholder}
      autoCorrect={false}
      outlineStyle={styles.searchOutline}
      left={<TextInput.Icon icon="search" />}
    />
  );
}

function Tiles<R extends string>({ entries, onOpen }: { entries: IndexEntry<R>[]; onOpen: (route: R) => void }) {
  const { columns, onLayout } = useColumns(fontScaled(TILE_MIN));

  return (
    <CellRows
      items={entries}
      columns={columns}
      onLayout={onLayout}
      keyOf={(entry) => entry.label}
      render={(entry) => <IconTile icon={entry.icon} title={entry.label} line={entry.hint} onPress={() => onOpen(entry.route)} />}
      rowGap={spacing.ms}
      columnGap={spacing.ms}
    />
  );
}

function SectionHead<R extends string>({ section, children }: { section: IndexSection<R>; children: ReactNode }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.head}>
      <TonalIcon icon={section.icon} large />
      <View style={styles.headText}>
        <Text variant="headlineSmall">{section.title}</Text>
        <Text variant="bodyMedium" style={{ color: colors.onSurfaceMuted }}>
          {section.hint}
        </Text>
      </View>
      {/* In a View of its own: as a row's item the field stood as tall as the section's wrapped name, on a tablet held upright. */}
      {children ? <View style={[styles.searchBeside, { width: fontScaled(SEARCH_WIDTH) }]}>{children}</View> : null}
    </View>
  );
}

type ResultsProps<R extends string> = { sections: IndexSection<R>[]; term: string; onOpen: (route: R) => void; noun: string; tryWords: string };

function Results<R extends string>({ sections, term, onOpen, noun, tryWords }: ResultsProps<R>) {
  const { colors } = useAppTheme();
  const hits = searchEntries<IndexEntry<R>, IndexSection<R>>(sections, term);
  const typed = term.trim();

  if (hits.length === 0) {
    return (
      <View style={styles.none}>
        <Icon source="search-off" size={40} color={colors.onSurfaceMuted} />
        <Text variant="titleMedium" style={styles.centred}>{`No ${noun} match “${typed}”`}</Text>
        <Text variant="bodySmall" style={[styles.centred, { color: colors.onSurfaceMuted }]}>
          {tryWords}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }} accessibilityLiveRegion="polite">
        {`${hits.length} ${hits.length === 1 ? 'result' : 'results'} for “${typed}”`}
      </Text>
      <View style={[styles.box, { borderColor: colors.outlineVariant, backgroundColor: colors.surface }]}>
        {hits.map(({ section, entry }, index) => (
          <Pressable
            key={entry.route}
            onPress={() => onOpen(entry.route)}
            android_ripple={{ color: colors.ripple }}
            accessibilityRole="button"
            accessibilityLabel={`${entry.label}, in ${section.title}`}
            style={[styles.row, index > 0 ? { borderTopWidth: 1, borderTopColor: colors.surfaceVariant } : null]}
          >
            <TonalIcon icon={entry.icon} />
            <View style={styles.rowText}>
              <Marked variant="bodySmall" text={section.title} term={typed} muted />
              <Marked variant="titleMedium" text={entry.label} term={typed} />
              <Marked variant="bodySmall" text={entry.hint} term={typed} muted />
            </View>
            <Icon source="chevron-right" size={20} color={colors.onSurfaceMuted} />
          </Pressable>
        ))}
      </View>
    </>
  );
}

/** A line with the words typed marked in it. */
function Marked({ variant, text, term, muted = false }: { variant: 'bodySmall' | 'titleMedium'; text: string; term: string; muted?: boolean }) {
  const { colors } = useAppTheme();

  return (
    <Text variant={variant} style={muted ? { color: colors.onSurfaceMuted } : null}>
      {markParts(text, term).map((part, index) =>
        part.hit ? (
          <Text key={index} variant={variant} style={{ backgroundColor: colors.primaryContainer, color: colors.onPrimaryContainer }}>
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, padding: spacing.md },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms },
  headText: { flex: 1, gap: spacing.xs },
  searchOutline: { borderRadius: radius.xl },
  searchBeside: { maxWidth: '50%' },
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.ms },
  rowText: { flex: 1 },
  // Centred, as the page it follows draws it (.claude/instruction_mds/frontend.md rule 18).
  none: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.md },
  centred: { textAlign: 'center' },
});
