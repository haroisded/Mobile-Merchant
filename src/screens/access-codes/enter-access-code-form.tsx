import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdaptiveDialog, sendOnce } from '../../components/adaptive-dialog';
import { Avatar } from '../../components/avatar';
import { Button } from '../../components/button';
import { HelperText } from '../../components/helper-text';
import { Text } from '../../components/text';
import { TextInput } from '../../components/text-input';
import { claimMessage, CODE_LENGTH, normalizeCode } from '../../features/access-codes/code';
import type { ClaimStatus } from '../../features/access-codes/code';
import { useClaimAccessCodeMutation } from '../../features/access-requests/queries';
import { failureMessage, mutationNotice } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';

type Answer = { status: ClaimStatus; merchant_name?: string | null };

const BOXES = Array.from({ length: CODE_LENGTH }, (_, index) => index);

/**
 * Use a code someone sent — the body of src/app/(app)/forms/enter-access-code.tsx (page narrow, Dialog wide). Six boxes
 * drawn over one TextInput nobody sees: the input takes the typing and a paste ("A4F-7K2" too), the boxes show it.
 */
export function EnterAccessCodeForm({ onDismiss }: { onDismiss: () => void }) {
  const { colors } = useAppTheme();
  const claim = useClaimAccessCodeMutation();
  const [code, setCode] = useState('');
  const [focused, setFocused] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const inFlight = claim.isPending && !claim.isPaused;
  const submit = sendOnce(claim, setAnswer);

  if (answer?.status === 'requested') {
    return (
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        kicker="Request sent"
        title={answer.merchant_name ?? 'Request sent'}
        actions={
          <Button mode="contained" onPress={onDismiss} contentStyle={styles.action}>
            Done
          </Button>
        }
      >
        <Text variant="bodyMedium">{claimMessage(answer.status, answer.merchant_name ?? null)}</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          It waits under Waiting for approval on Home, and Notifications tells you once it&apos;s decided.
        </Text>
      </AdaptiveDialog>
    );
  }

  return (
    <AdaptiveDialog
      asPage
      onDismiss={onDismiss}
      dismissable={!inFlight}
      kicker="Join a store"
      title="Employee Access Code"
      notice={mutationNotice(claim, failureMessage("Couldn't check the code. Try again."))}
      actions={
        <>
          <Button mode="outlined" onPress={onDismiss} disabled={inFlight} contentStyle={styles.action}>
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={() => submit(code)}
            loading={inFlight}
            disabled={code.length < CODE_LENGTH || claim.isPending}
            contentStyle={styles.action}
          >
            Use Code
          </Button>
        </>
      }
    >
      <Avatar.Icon size={56} icon="shield" />
      <Text variant="bodyMedium">Use a code your admin sent to you.</Text>
      <View>
        {/* Drawn only: a screen reader reads the field over them, which holds the same characters. */}
        <View style={styles.boxes} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {BOXES.map((index) => (
            <View
              key={index}
              style={[
                styles.box,
                // The box the next character lands in, while the field has focus.
                { borderColor: focused && index === Math.min(code.length, CODE_LENGTH - 1) ? colors.primary : colors.outlineVariant },
              ]}
            >
              <Text variant="headlineSmall">{code[index] ?? ''}</Text>
            </View>
          ))}
        </View>
        {/* Over the boxes and all but invisible, so a tap anywhere on them types into it. Not opacity 0: Android
            leaves a view at alpha 0 out of what a screen reader can reach (View.isVisibleToUser) — uiautomator found
            no field on the phone, 2026-10-14. Not a transparent text colour either: on Android, React Native reads
            colour 0 as no colour and draws the text in the default one. */}
        <TextInput
          value={code}
          onChangeText={(typed) => {
            setCode(normalizeCode(typed).replace(/[^0-9A-Z]/g, '').slice(0, CODE_LENGTH));
            setAnswer(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus
          autoCapitalize="characters"
          autoCorrect={false}
          onSubmitEditing={() => {
            if (code.length === CODE_LENGTH) submit(code);
          }}
          accessibilityLabel="Access code, six characters"
          style={styles.hidden}
          underlineColor="transparent"
          activeUnderlineColor="transparent"
        />
      </View>
      {answer ? (
        <HelperText type="error" padding="none">
          {claimMessage(answer.status, answer.merchant_name ?? null)}
        </HelperText>
      ) : null}
      <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
        Six letters and numbers. The dash is optional.
      </Text>
    </AdaptiveDialog>
  );
}

const styles = StyleSheet.create({
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  action: { justifyContent: 'flex-start' },
  boxes: { flexDirection: 'row', gap: spacing.sm },
  // The six share the row; no height, so a box grows with its character at a large font scale (frontend.md rule 17).
  box: {
    flex: 1,
    paddingVertical: spacing.ms,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  hidden: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.01 },
});
