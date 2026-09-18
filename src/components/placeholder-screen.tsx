import { StyleSheet } from 'react-native';

import { spacing } from '../themes';
import { Appbar } from './appbar';
import { Surface } from './surface';
import { Text } from './text';

/**
 * "Nothing here yet." — what a destination with no screen renders, so its tab or rail item has
 * somewhere to land. Given a `title`, it draws its own app bar: the (tabs) screens have no header
 * above them, while the shell's destinations sit under the shell's.
 *
 * In src/components/ because eight routes render it (instruction_mds/structure.md rule 6).
 */
export function PlaceholderScreen({ title }: { title?: string }) {
  if (!title) {
    return (
      <Text variant="bodyMedium" style={styles.stub}>
        Nothing here yet.
      </Text>
    );
  }

  return (
    <Surface style={styles.screen}>
      <Appbar.Header>
        <Appbar.Content title={title} />
      </Appbar.Header>
      <Surface style={styles.body} elevation={0}>
        <Text variant="bodyMedium">Nothing here yet.</Text>
      </Surface>
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, padding: spacing.lg },
  stub: { padding: spacing.lg },
});
