import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

// A stub. Dashboard has no screen yet, but its rail item needs somewhere to land.
export default function Dashboard() {
  return <Text variant="bodyMedium" style={styles.stub}>Nothing here yet.</Text>;
}

const styles = StyleSheet.create({ stub: { padding: 24 } });
