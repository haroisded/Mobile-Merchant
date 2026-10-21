import { StyleSheet, View } from 'react-native';

import { Button } from '../../../components/button';
import { FormFooter } from '../../../components/form-footer';
import { Text } from '../../../components/text';
import { useAppTheme } from '../../../lib/theme';
import { spacing } from '../../../themes';
import type { Step, Task } from '../tasks';

type Props = {
  task: Task;
  step: Step;
  index: number;
  count: number;
  /** The page the step is on is not the one showing. */
  elsewhere: boolean;
  onRestart: () => void;
  onStop: () => void;
};

/**
 * A guided task's bar under the practice page: where the person is in the task and what to tap next
 * (.claude/instruction-mds/frontend.md §5, Store Guide). FormFooter's slot, so it sits where a real page's Save does.
 */
export function GuideBar({ task, step, index, count, elsewhere, onRestart, onStop }: Props) {
  const { colors } = useAppTheme();

  return (
    <FormFooter notice={null}>
      <View style={styles.text} accessibilityLiveRegion="polite">
        <Text variant="labelMedium" style={{ color: colors.accent }}>
          {`${task.title} · Step ${index + 1} of ${count}`}
        </Text>
        <Text variant="titleMedium">{step.title}</Text>
        <Text variant="bodyMedium">{step.body}</Text>
        {elsewhere ? (
          <Text variant="bodySmall" style={{ color: colors.error }}>
            This step is on another page. Go back, or start the task again.
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Button mode="text" compact onPress={onRestart}>
          Start Again
        </Button>
        <Button mode="text" compact onPress={onStop}>
          Stop Task
        </Button>
      </View>
    </FormFooter>
  );
}

const styles = StyleSheet.create({
  text: { gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
