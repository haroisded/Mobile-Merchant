import { StyleSheet, View } from 'react-native';

import { BoxRow, RowBox } from '../../components/row-box';
import { Text } from '../../components/text';
import { formatCode } from '../../features/access-codes/code';
import { useMyPendingRequestsQuery } from '../../features/access-requests/queries';
import { displayDateTime } from '../../lib/dates';
import { spacing } from '../../themes';

/**
 * The systems the person asked to join with a code, still waiting for their owners. Nothing while there are none; a
 * system leaves here for the list below once approved.
 */
export function PendingRequests() {
  const requests = useMyPendingRequestsQuery().data ?? [];
  if (requests.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text variant="titleMedium">Waiting for approval</Text>
      <RowBox empty="">
        {requests.map((request, index) => (
          <BoxRow
            key={request.id}
            first={index === 0}
            title={request.merchant_name}
            sub={`Code ${formatCode(request.code)} · asked ${displayDateTime(request.created_at)}`}
          />
        ))}
      </RowBox>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.ms },
});
