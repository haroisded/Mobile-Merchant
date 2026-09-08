import { StyleSheet } from 'react-native';
import { Appbar, Surface, Text } from 'react-native-paper';

// A stub, for the same reason as notifications.tsx: the destination is unticked, but the nav bar
// needs somewhere to land.
export default function Settings() {
  return (
    <Surface style={styles.screen}>
      <Appbar.Header>
        <Appbar.Content title="Settings" />
      </Appbar.Header>
      <Surface style={styles.body} elevation={0}>
        <Text variant="bodyMedium">Nothing here yet.</Text>
      </Surface>
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, padding: 24 },
});
