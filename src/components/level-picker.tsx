import { Pressable, StyleSheet, View } from 'react-native';

import { LEVELS } from '../features/merchants/levels';
import { useAppTheme } from '../lib/theme';
import { radius, spacing } from '../themes';
import { RadioButton } from './radio-button';
import { Text } from './text';

type Props = { value: number; onChange: (level: number) => void; disabled?: boolean };

/**
 * Pick a store's level (src/features/merchants/levels.ts): five rows in one box, each its name, what it is for and
 * what it gives. Create Store's second step and Features' Store Level form (.claude/instruction-mds/frontend.md §5).
 */
export function LevelPicker({ value, onChange, disabled }: Props) {
  const { colors } = useAppTheme();

  return (
    <View accessibilityRole="radiogroup" style={[styles.box, { borderColor: colors.outlineVariant }]}>
      {LEVELS.map((info, index) => {
        const picked = info.level === value;
        return (
          <Pressable
            key={info.level}
            onPress={() => onChange(info.level)}
            disabled={disabled}
            // Pressable reads no theme, so the press colour is passed every time (frontend.md §5).
            android_ripple={{ color: colors.ripple }}
            accessibilityRole="radio"
            accessibilityState={{ checked: picked, disabled }}
            accessibilityLabel={`Level ${info.level}, ${info.name}. ${info.summary}`}
            style={[
              styles.row,
              index === 0 ? null : { borderTopWidth: 1, borderTopColor: colors.surfaceVariant },
              // The picked row: the selected row's ground (frontend.md §2.2).
              picked ? { backgroundColor: colors.surfaceMuted } : null,
            ]}
          >
            {/* The row is the control; the radio only draws its state. */}
            <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <RadioButton.Android value={String(info.level)} status={picked ? 'checked' : 'unchecked'} color={colors.accent} disabled={disabled} />
            </View>
            <View style={styles.text}>
              <Text variant="titleMedium">{`Level ${info.level} · ${info.name}`}</Text>
              <Text variant="bodyMedium">{info.summary}</Text>
              {info.gets.map((line) => (
                <Text key={line} variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                  {`· ${line}`}
                </Text>
              ))}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.ms },
  text: { flex: 1, gap: spacing.xs },
});
