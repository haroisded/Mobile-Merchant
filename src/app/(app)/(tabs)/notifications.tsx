import { StyleSheet } from 'react-native';
import { Appbar, Surface, Text } from 'react-native-paper';

// A stub. The Notifications destination is not ticked in Interactives ( Priority ).md, but a
// BottomNavigation.Bar cannot render a tab that does not switch to something — so the destination
// exists and lands here rather than the bar carrying a dead item.
export default function Notifications() {
  return (
    <Surface style={styles.screen}>
      <Appbar.Header>
        <Appbar.Content title="Notifications" />
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
