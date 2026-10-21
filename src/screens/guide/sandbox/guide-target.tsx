import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../../components/button';
import { useAppTheme } from '../../../lib/theme';
import { radius } from '../../../themes';
import type { SetupId } from '../sandbox-state';
import type { Target } from '../tasks';
import { useSandbox } from './context';

/**
 * The control a guided step points at: a 2px accent ring while the step asks for it (.claude/instruction-mds/frontend.md
 * §5, Store Guide). The ring is drawn on every target, transparent when idle, so the step changing never moves the page.
 * Pressing the control is the page's own handler, which calls `did` — the ring only shows where.
 */
export function GuideTarget({ target, setupId, children }: { target: Target; setupId?: SetupId; children: ReactNode }) {
  const { isTarget } = useSandbox();
  const { colors } = useAppTheme();

  return <View style={[styles.ring, { borderColor: isTarget(target, setupId) ? colors.accent : 'transparent' }]}>{children}</View>;
}

type GuideButtonProps = Omit<ComponentProps<typeof Button>, 'onPress'> & { target: Target; onPress: () => void };

/** A practice page's button that a step may point at: ringed while it does, and the step moves on when it is pressed. */
export function GuideButton({ target, onPress, ...button }: GuideButtonProps) {
  const { did } = useSandbox();
  return (
    <GuideTarget target={target}>
      <Button
        {...button}
        onPress={() => {
          did(target);
          onPress();
        }}
      />
    </GuideTarget>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 2, borderRadius: radius.lg, borderCurve: 'continuous' },
});
