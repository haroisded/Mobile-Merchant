import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { TextInput } from '../../../components/text-input';
import { toggle } from '../../../features/permissions/access';
import type { Permission } from '../../../features/permissions/queries';
import { useAppTheme } from '../../../lib/theme';
import { radius, spacing } from '../../../themes';

type Props = {
  catalog: Permission[];
  /** The keys turned on. */
  value: string[];
  onChange: (next: string[]) => void;
  /** The role's own keys, on the employee editor: a row that differs from them says what the role gives. */
  roleKeys?: string[];
};

/**
 * Every permission an owner can turn on, grouped by category under a search: a switch per row, with what it does
 * and what it needs. A switch turned on brings what it needs; turned off, it takes what needs it (toggle) — the sets the
 * database accepts.
 */
export function PermissionSwitches({ catalog, value, onChange, roleKeys }: Props) {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = catalog.filter((entry) => `${entry.label} ${entry.description}`.toLowerCase().includes(needle));
  const labels = new Map(catalog.map((entry) => [entry.key, entry.label]));
  const flip = (key: string) => onChange(toggle(catalog, value, key, !value.includes(key)));

  return (
    <View style={styles.groups}>
      <TextInput
        mode="outlined"
        dense
        value={query}
        onChangeText={setQuery}
        placeholder="Search permissions"
        accessibilityLabel="Search permissions"
        left={<TextInput.Icon icon="search" />}
      />
      {shown.length === 0 ? <Text variant="bodyMedium">No permission matches that search.</Text> : null}
      {[...new Set(shown.map((entry) => entry.category))].map((category) => (
        <View key={category} style={styles.group}>
          <Text variant="labelMedium" style={{ color: colors.secondary }}>
            {category}
          </Text>
          <View style={[styles.box, { borderColor: colors.outlineVariant }]}>
            {shown
              .filter((entry) => entry.category === category)
              .map((entry, index) => {
                const on = value.includes(entry.key);
                const differs = roleKeys !== undefined && roleKeys.includes(entry.key) !== on;

                return (
                  <Pressable
                    key={entry.key}
                    onPress={() => flip(entry.key)}
                    // Pressable reads no theme, so the press colour is passed every time (.claude/instruction_mds/frontend.md §5).
                    android_ripple={{ color: colors.ripple }}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={entry.label}
                    style={[styles.row, index > 0 ? { borderTopWidth: 1, borderTopColor: colors.surfaceVariant } : null]}
                  >
                    <View style={styles.text}>
                      <Text variant="titleSmall">{entry.label}</Text>
                      <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                        {entry.requires ? `${entry.description} Needs ${labels.get(entry.requires)}.` : entry.description}
                      </Text>
                      {/* What the role alone would give, on a row this employee's own setting overrides. */}
                      {differs ? (
                        <View style={[styles.tag, { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceMuted }]}>
                          <Text variant="labelMedium">{`Role: ${on ? 'Off' : 'On'}`}</Text>
                        </View>
                      ) : null}
                    </View>
                    {/* A switch that is on is one of the accent's places (.claude/instruction_mds/frontend.md §2.3). */}
                    <Switch value={on} onValueChange={() => flip(entry.key)} color={colors.accent} accessibilityElementsHidden importantForAccessibility="no" />
                  </Pressable>
                );
              })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  groups: { gap: spacing.lg },
  group: { gap: spacing.sm },
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.ms },
  text: { flex: 1, gap: spacing.xs },
  tag: { alignSelf: 'flex-start', borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
});
