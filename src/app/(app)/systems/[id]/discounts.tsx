import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

// A stub. Discounts has no screen yet, but its rail item needs somewhere to land. The real screens
// replace this file with a discounts/ directory (docs/structure.md §3).
export default function Discounts() {
  return <Text variant="bodyMedium" style={styles.stub}>Nothing here yet.</Text>;
}

const styles = StyleSheet.create({ stub: { padding: 24 } });
