import { Pressable, StyleSheet, View } from 'react-native';

import { AdaptiveDialog } from '../../../components/adaptive-dialog';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useAppTheme } from '../../../lib/theme';
import { radius, spacing } from '../../../themes';
import { permissionLabel } from '../roles';
import type { Role } from '../roles';
import type { Task } from '../tasks';

// The Store Guide's pop-ups over the practice store (.claude/instruction-mds/frontend.md §5, Store Guide): the role's
// task list, a task before its first step, and a task done. A Paper Dialog at every width — a teaching overlay over
// mock state, not a confirm, so not the narrow formSheet a confirm takes.

const taskTag = (task: Task) => (task.owner ? 'Owner only' : task.noRole ? 'No role' : task.needs.map(permissionLabel).join(' or '));

type ListProps = { role: Role; tasks: Task[]; done: string[]; onPick: (task: Task) => void; onClose: () => void };

export function TaskListDialog({ role, tasks, done, onPick, onClose }: ListProps) {
  const { colors } = useAppTheme();

  return (
    <AdaptiveDialog kicker={role.name} title="What you can practise" onDismiss={onClose} actions={<Button onPress={onClose}>Explore on My Own</Button>}>
      <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
        {`${role.responsibilities}. This is a practice store: nothing here is saved, and the menu shows only the screens this role reaches.`}
      </Text>
      <View style={[styles.box, { borderColor: colors.outlineVariant }]}>
        {tasks.map((task, index) => (
          <Pressable
            key={task.id}
            onPress={() => onPick(task)}
            android_ripple={{ color: colors.ripple }}
            accessibilityRole="button"
            accessibilityLabel={`${task.title}${done.includes(task.id) ? ', done' : ''}`}
            style={[styles.row, index === 0 ? null : { borderTopWidth: 1, borderTopColor: colors.surfaceVariant }]}
          >
            <View style={styles.fill}>
              <Text variant="titleSmall">{task.title}</Text>
              <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                {taskTag(task)}
              </Text>
            </View>
            {done.includes(task.id) ? <Icon source="check" size={22} color={colors.accent} /> : <Icon source="chevron-right" size={22} color={colors.onSurfaceMuted} />}
          </Pressable>
        ))}
      </View>
    </AdaptiveDialog>
  );
}

export function TaskIntroDialog({ task, onStart, onClose }: { task: Task; onStart: () => void; onClose: () => void }) {
  const { colors } = useAppTheme();
  return (
    <AdaptiveDialog
      kicker={taskTag(task)}
      title={task.title}
      onDismiss={onClose}
      actions={
        <>
          <Button onPress={onClose}>All Tasks</Button>
          <Button mode="contained" onPress={onStart}>
            Start
          </Button>
        </>
      }
    >
      <Text variant="bodyMedium">{task.line}</Text>
      {task.steps.map((step, index) => (
        <Text key={`${step.target}-${index}`} variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {`${index + 1}. ${step.title}`}
        </Text>
      ))}
    </AdaptiveDialog>
  );
}

export function TaskDoneDialog({ task, next, onNext, onList }: { task: Task; next: Task | null; onNext: () => void; onList: () => void }) {
  return (
    <AdaptiveDialog
      kicker="Task done"
      title={task.title}
      onDismiss={onList}
      actions={
        <>
          <Button onPress={onList}>All Tasks</Button>
          {next ? (
            <Button mode="contained" onPress={onNext}>
              Next Task
            </Button>
          ) : null}
        </>
      }
    >
      <Text variant="bodyMedium">{task.done}</Text>
      {next ? <Text variant="bodySmall">{`Next: ${next.title}.`}</Text> : <Text variant="bodySmall">That was the last task for this role.</Text>}
    </AdaptiveDialog>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, padding: spacing.ms, minHeight: 56 },
});
