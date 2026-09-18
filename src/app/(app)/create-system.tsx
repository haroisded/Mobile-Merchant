import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Surface } from '../../components/surface';
import { CreateSystem } from '../../screens/home/create-system';

// The stepped create-system wizard on a narrow container: a full-screen route, not a sheet. It is a
// three-step form, not a confirm or a picker (instruction_mds/visual-language.md §5); wide, Home opens the same
// form in a modal.
export default function CreateSystemScreen() {
  return (
    <Surface style={styles.screen}>
      <CreateSystem stepped onDismiss={() => router.back()} />
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
