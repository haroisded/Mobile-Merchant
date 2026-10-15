import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Surface } from '../../components/surface';
import { Scan } from '../../screens/scan';

// The product scan: a full-screen route at every width, like create-system — a camera is no sheet or dialog.
// The screen that opens it leaves what to do with a barcode or a label in src/Store/scan.ts.
export default function ScanScreen() {
  return (
    <Surface style={styles.screen}>
      <Scan onDismiss={() => router.back()} />
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
