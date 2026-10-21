import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Appbar } from '../../components/appbar';
import { Button } from '../../components/button';
import { NoteCallout } from '../../components/note-callout';
import { PageHeader } from '../../components/page-header';
import { SectionHeading } from '../../components/section-heading';
import { Surface } from '../../components/surface';
import { Text } from '../../components/text';
import { READING_MEASURE, useShellWide } from '../../lib/columns';
import { spacing } from '../../themes';
import { RoleListDialog } from './role-list';
import { LIMITS, PERMISSIONS } from './roles';

/** The permission areas, in the catalog's order, each with its permissions. */
const AREAS = [...new Set(PERMISSIONS.map((permission) => permission.area))].map((area) => ({
  area,
  labels: PERMISSIONS.filter((permission) => permission.area === area).map((permission) => permission.label),
}));

/**
 * The Store Guide (.claude/instruction-mds/frontend.md §5, Store Guide): a page, opened from the Home tab, whose role
 * list pops up as it opens — a native sheet on a phone, a Dialog over the page on a tablet. A role opens its practice
 * store (/guide/<role>). Under the pop-up the page explains roles and the sheet's limits, and Choose a Role reopens it.
 */
export function GuideScreen() {
  const wide = useShellWide();
  const [listOpen, setListOpen] = useState(false);
  const popped = useRef(false);

  // Narrow, the list is a sheet route over this page; wide, a Dialog on it. Either way it pops up once, on opening.
  const openList = () => (wide ? setListOpen(true) : router.push('/sheets/guide-roles'));
  useEffect(() => {
    if (popped.current) return;
    popped.current = true;
    openList();
  });

  return (
    <Surface style={styles.fill}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Store Guide" />
      </Appbar.Header>
      <PageHeader
        kicker="Store Guide"
        title="Learn a role"
        meta="Practise any role's work in a store with no real data"
        actions={
          <Button mode="contained" icon="checklist" onPress={openList} style={wide ? undefined : styles.full} contentStyle={styles.leading}>
            Choose a Role
          </Button>
        }
      />
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="bodyMedium">
          A role is the set of permissions an owner gives a person on Employees. Pick a role and a practice store opens with only
          the screens that role reaches, a list of its tasks, and step-by-step help for each. Nothing you do there is saved.
        </Text>
        <SectionHeading title="The 20 permissions" hint="By area" />
        {AREAS.map((entry) => (
          <View key={entry.area} style={styles.area}>
            <Text variant="labelMedium">{entry.area}</Text>
            <Text variant="bodyMedium">{entry.labels.join(' · ')}</Text>
          </View>
        ))}
        <SectionHeading title="Good to know" hint="Limits of roles today" />
        {LIMITS.map((limit) => (
          <NoteCallout key={limit.topic}>{`${limit.topic}: ${limit.detail}`}</NoteCallout>
        ))}
      </ScrollView>
      {listOpen ? (
        <RoleListDialog
          onDismiss={() => setListOpen(false)}
          onPick={(role) => {
            setListOpen(false);
            router.push({ pathname: '/guide/[role]', params: { role: role.id } });
          }}
        />
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { gap: spacing.ms, padding: spacing.md, width: '100%', maxWidth: READING_MEASURE },
  area: { gap: spacing.xs },
  // Narrow, the page header's actions are a row of their own: a full-width button grows to fill it.
  full: { flexGrow: 1 },
  leading: { justifyContent: 'flex-start' },
});
