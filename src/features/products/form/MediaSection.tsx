import { StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useAppTheme } from '../../../lib/theme';
import { NoteCallout } from './fields';

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
  body: { gap: 12 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: 120, height: 120, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
});
