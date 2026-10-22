import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { AdaptiveDialog } from '../../../components/adaptive-dialog';
import { Button } from '../../../components/button';
import { PickList } from '../../../components/search-select';
import { usePickRequest } from '../../../Store/picker';

// A searchable select's picker on a phone, as a native sheet (.claude/instruction_mds/frontend.md §4.4). The
// field that opened it left its options and callback in src/Store/picker.ts; a pick hands the value back
// and closes the sheet onto the form underneath.
export default function PickSheet() {
  const request = usePickRequest();

  // Only reachable through openPicker(), which always leaves a request first.
  if (!request) return null;

  return (
    <AdaptiveDialog
      inSheet
      scroll={false}
      onDismiss={() => router.back()}
      title={request.title}
      actions={
        <Button mode="outlined" onPress={() => router.back()} contentStyle={styles.leading}>
          Cancel
        </Button>
      }
    >
      <PickList
        options={request.options}
        value={request.value}
        onPick={(picked) => {
          request.onPick(picked);
          router.back();
        }}
      />
    </AdaptiveDialog>
  );
}

const styles = StyleSheet.create({
  // Full width in the sheet, so the label sits at the left edge (.claude/instruction_mds/frontend.md §5).
  leading: { justifyContent: 'flex-start' },
});
