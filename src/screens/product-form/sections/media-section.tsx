import { StyleSheet, View } from 'react-native';

import { Icon } from '../../../components/icon';
import { NoteCallout } from '../../../components/note-callout';
import { Text } from '../../../components/text';
import { useAppTheme } from '../../../lib/theme';
import { radius, spacing } from '../../../themes';

// Rendered inert: photos arrive with the image pipeline (System-Context/Image-Pipeline), which owns
// storage, resizing and products.image_file. Nothing here reads or writes.
export function MediaSection() {
  const { colors } = useAppTheme();

  return (
    <View style={styles.body}>
      <NoteCallout>Photos are coming. Nothing in this section is saved yet.</NoteCallout>
      <View style={styles.tiles}>
        {['Main photo', 'Gallery', 'Gallery'].map((label, index) => (
          <View
            key={`${label}-${index}`}
            style={[styles.tile, { backgroundColor: colors.surfaceVariant, borderColor: colors.outlineVariant }]}
            accessibilityState={{ disabled: true }}
          >
            <Icon source="image" size={28} color={colors.onSurfaceFaint} />
            <Text variant="bodySmall" style={{ color: colors.onSurfaceFaint }}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="labelMedium" style={{ color: colors.onSurfaceFaint }}>
        Alt text
      </Text>
      <Text variant="bodySmall" style={{ color: colors.onSurfaceFaint }}>
        Describes the photo for screen readers — available with photos.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.ms },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.ms },
  tile: {
    width: 120,
    height: 120,
    borderWidth: 1,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
