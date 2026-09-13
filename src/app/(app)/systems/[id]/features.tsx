import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

// A stub. Features has no screen or mockup yet, but its rail item needs somewhere to land.
export default function Features() {
  return <Text variant="bodyMedium" style={styles.stub}>Nothing here yet.</Text>;
}

const styles = StyleSheet.create({ stub: { padding: 24 } });
