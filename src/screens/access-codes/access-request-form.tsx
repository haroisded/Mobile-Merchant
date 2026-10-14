import { StyleSheet, View } from 'react-native';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { Avatar } from '../../components/avatar';
import { Field, FieldGrid } from '../../components/form-fields';
import { Text } from '../../components/text';
import { formatCode } from '../../features/access-codes/code';
import { useAccessRequestsQuery, useDecideAccessRequestMutation } from '../../features/access-requests/queries';
import type { AccessRequest } from '../../features/access-requests/queries';
import { memberName } from '../../features/members/queries';
import { displayDateTime } from '../../lib/dates';
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';
import { statusOf } from './requests';

/** Someone who used a code: who they are, and Approve or Decline — the body of src/app/(app)/forms/access-request.tsx. */
export function AccessRequestForm({ requestId, onDismiss }: { requestId: string; onDismiss: () => void }) {
  const request = useAccessRequestsQuery().data?.find((candidate) => candidate.id === requestId);
  if (!request) return null;

  return <Decide request={request} onDismiss={onDismiss} />;
}

/** The copy for a decision the database refused: decided elsewhere meanwhile, or gone with its system. */
function decideFailure(error: Error | null) {
  const message = postgrestError(error)?.message;
  if (message === 'request_decided') return 'This request was already approved or declined.';
  if (message === 'request_not_found') return "This request doesn't exist any more.";
  return failureMessage("Couldn't save your decision. Try again.");
}

function Decide({ request, onDismiss }: { request: AccessRequest; onDismiss: () => void }) {
  const { colors } = useAppTheme();
  const decide = useDecideAccessRequestMutation();
  const send = saveOnce(decide, onDismiss);
  const pending = request.status === 'pending';

  return (
    <AdaptiveDialog
      asPage
      onDismiss={onDismiss}
      dismissable={!(decide.isPending && !decide.isPaused)}
      kicker={pending ? 'Wants to join' : statusOf(request)}
      title={memberName(request)}
      notice={mutationNotice(decide, decideFailure(decide.error))}
      actions={
        pending ? (
          <FormActions
            mutation={decide}
            onCancel={onDismiss}
            onDelete={() => send({ id: request.id, approve: false })}
            deleteLabel="Decline"
            onSave={() => send({ id: request.id, approve: true })}
            saveLabel="Approve"
          />
        ) : (
          <FormActions mutation={decide} onCancel={onDismiss} />
        )
      }
    >
      <View style={styles.person}>
        {request.avatar_url ? <Avatar.Image size={56} source={{ uri: request.avatar_url }} /> : <Avatar.Icon size={56} icon="account" />}
        <View style={styles.grow}>
          <Text variant="titleMedium">{memberName(request)}</Text>
          {request.email && request.full_name ? (
            <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
              {request.email}
            </Text>
          ) : null}
        </View>
      </View>
      <FieldGrid>
        <Field label="System">
          <Text variant="bodyMedium">{request.merchant_name}</Text>
        </Field>
        <Field label="Code Used">
          <Text variant="bodyMedium">{formatCode(request.code)}</Text>
        </Field>
        <Field label="Asked">
          <Text variant="bodyMedium">{displayDateTime(request.created_at)}</Text>
        </Field>
        {request.decided_at ? (
          <Field label={statusOf(request)}>
            <Text variant="bodyMedium">{displayDateTime(request.decided_at)}</Text>
          </Field>
        ) : null}
      </FieldGrid>
      {pending ? (
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          Approving lets them into {request.merchant_name} with no role: they see Home only until you give them one under Employees.
        </Text>
      ) : null}
    </AdaptiveDialog>
  );
}

const styles = StyleSheet.create({
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms },
  grow: { flex: 1, gap: spacing.xs },
});
