import { StyleSheet } from 'react-native';

import { AdaptiveDialog } from '../../components/adaptive-dialog';
import { Button } from '../../components/button';
import { closesForm, useConfirm } from '../../components/confirm-dialog';
import { Field, FieldGrid } from '../../components/form-fields';
import { BoxRow, RowBox } from '../../components/row-box';
import { Text } from '../../components/text';
import { codeStatus, expiryText, formatCode } from '../../features/access-codes/code';
import { useAccessCodesQuery, useDeleteAccessCodeMutation } from '../../features/access-codes/queries';
import type { AccessCode } from '../../features/access-codes/queries';
import { memberName } from '../../features/members/queries';
import { useShellWide } from '../../lib/columns';
import { displayDateTime } from '../../lib/dates';
import { failureMessage } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { lastDay, STATUS_LABEL, useNow, usesText } from './codes';
import { share } from './new-access-code-form';
import { statusOf } from './requests';

/** One code: to share again, see who used it, or delete — the body of src/app/(app)/forms/access-code.tsx. */
export function AccessCodeForm({ codeId, onDismiss }: { codeId: string; onDismiss: () => void }) {
  const code = useAccessCodesQuery().data?.find((candidate) => candidate.id === codeId);
  if (!code) return null;

  return <Details code={code} onDismiss={onDismiss} />;
}

function Details({ code, onDismiss }: { code: AccessCode; onDismiss: () => void }) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const now = useNow();
  const remove = useDeleteAccessCodeMutation();
  const confirm = useConfirm();
  const status = codeStatus(code, code.access_requests, now);
  const system = code.merchants?.name ?? '';

  const askDelete = () =>
    confirm.ask({
      title: `Delete ${formatCode(code.code)}?`,
      body: 'It stops working at once. People it already let in stay, and requests waiting on it stay for you to decide.',
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(code.id),
      failure: () => failureMessage("Couldn't delete this code. Try again."),
      onDone: closesForm(wide, onDismiss),
    });

  return (
    <>
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        kicker={system}
        title={code.label ?? formatCode(code.code)}
        actions={
          <>
            <Button mode="text" textColor={colors.error} onPress={askDelete} contentStyle={styles.action}>
              Delete
            </Button>
            {status === 'expired' || status === 'used' ? null : (
              <Button mode="outlined" icon="share" onPress={() => share([code], system)} contentStyle={styles.action}>
                Share
              </Button>
            )}
            <Button mode="contained" onPress={onDismiss} contentStyle={styles.action}>
              Close
            </Button>
          </>
        }
      >
        <Text variant="amount">{formatCode(code.code)}</Text>
        <FieldGrid>
          <Field label="Status">
            <Text variant="bodyMedium" style={status === 'expired' ? { color: colors.error } : undefined}>
              {STATUS_LABEL[status]}
            </Text>
          </Field>
          <Field label="Expires">
            <Text variant="bodyMedium">{code.expires_at ? `${expiryText(code.expires_at, now, lastDay)} · ${displayDateTime(code.expires_at)}` : 'Never'}</Text>
          </Field>
          <Field label="Uses">
            <Text variant="bodyMedium">{usesText(code)}</Text>
          </Field>
          <Field label="Created">
            <Text variant="bodyMedium">{displayDateTime(code.created_at)}</Text>
          </Field>
        </FieldGrid>
        <Text variant="labelMedium">Used by</Text>
        <RowBox empty="Nobody has used it yet.">
          {code.access_requests.map((request, index) => (
            <BoxRow key={`${request.created_at}-${index}`} first={index === 0} title={memberName(request)} sub={`${statusOf(request)} · ${displayDateTime(request.created_at)}`} />
          ))}
        </RowBox>
      </AdaptiveDialog>
      {confirm.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  action: { justifyContent: 'flex-start' },
});
