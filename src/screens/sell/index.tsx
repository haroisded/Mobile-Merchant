import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { useRegisterSession } from '../../components/pos-session';
import { QueryState } from '../../components/query-state';
import { RecordIndex } from '../../components/record-index';
import type { IndexSection } from '../../components/record-index';
import { Text } from '../../components/text';
import { can, has, usePermissions } from '../../features/role-permissions/queries';
import { displayDate } from '../../lib/dates';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';

/** The pages under src/app/(app)/systems/[id]/sell/ this index opens. */
type SellRoute = 'register' | 'open-session' | 'close-session' | 'pos-invoices' | 'pos-opening-entries' | 'pos-closing-entries';

// What was sold and when, as .claude/erpnext-docs/POS-System-Added-Features.md Step 18 groups it.
export const SELL_SECTIONS: IndexSection<SellRoute>[] = [
  {
    title: 'Orders & Sessions',
    hint: 'What was sold, and each session it was sold in',
    entries: [
      {
        label: 'Orders',
        hint: 'Every sale, newest first: reopen its receipt',
        purpose: 'Every sale and return, newest first. Open one to read its receipt again, take items back with a return, or cancel it.',
        useCase: 'Use it when a customer comes back with a question or a return.',
        doctype: 'POS Invoice',
        route: 'pos-invoices',
      },
      {
        label: 'POS Opening Entries',
        hint: 'Each session, and what its drawer started with',
        purpose: 'Each session that was opened: its register, its day and the cash its drawer started with.',
        useCase: 'Use it to check when a shift began and what it began with.',
        doctype: 'POS Opening Entry',
        route: 'pos-opening-entries',
      },
      {
        label: 'POS Closing Entries',
        hint: 'Each closed session: expected against counted',
        purpose: 'Each closed session: the cash the drawer should have held against what was counted, and what was sold.',
        useCase: 'Use it to review a shift at the end of the day.',
        doctype: 'POS Closing Entry',
        route: 'pos-closing-entries',
      },
    ],
  },
];

/** Sell: the cashier's session and the Register, then the orders and sessions behind them — a rail destination. */
export function SellIndex({ merchantId, merchantName, isOwner }: { merchantId: string; merchantName: string; isOwner: boolean }) {
  const open = (route: SellRoute) => router.push(`/systems/${merchantId}/sell/${route}`);
  // A cashier opens a session without reading the list of them: the box is theirs, and nothing is missing below it.
  const opensSessions = isOwner || can(usePermissions({ merchantId }).data, 'POS Opening Entry', 'create');

  return (
    <RecordIndex
      merchantId={merchantId}
      screen="sell"
      kicker={merchantName}
      title="Sell"
      meta="Open a session, sell at the Register, close the session"
      isOwner={isOwner}
      sections={SELL_SECTIONS}
      onOpen={open}
      offline="You're offline. Sell will load when you reconnect."
      failure="Couldn't load Sell. Try again."
      empty={opensSessions ? null : 'Your permissions give you nothing to see here. Ask the owner if you need more.'}
    >
      {opensSessions ? <SessionCard merchantId={merchantId} onOpen={open} /> : null}
    </RecordIndex>
  );
}

/** The cashier's own session: the way into the Register while one is open, the way to open one otherwise. */
function SessionCard({ merchantId, onOpen }: { merchantId: string; onOpen: (route: SellRoute) => void }) {
  const { colors } = useAppTheme();
  const { query, session, profile } = useRegisterSession(merchantId);
  const permissions = usePermissions({ merchantId }).data;

  return (
    <View style={[styles.card, { borderColor: colors.outlineVariant }]}>
      <QueryState query={query} offline="You're offline. Your session will load when you reconnect." failure="Couldn't load your session. Try again.">
        {session ? (
          <>
            <View style={styles.text}>
              <Text variant="titleMedium">{`Session ${session.name}`}</Text>
              <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                {[profile?.pos_profile_name, `Open since ${displayDate(session.posting_date)}`].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View style={styles.actions}>
              {/* Open/Close Register alone keeps a drawer without selling from it. */}
              {has(permissions, 'process_sales') ? (
                <Button mode="contained" onPress={() => onOpen('register')}>
                  Register
                </Button>
              ) : null}
              <Button mode="outlined" onPress={() => onOpen('close-session')}>
                Close Session
              </Button>
            </View>
          </>
        ) : (
          <>
            <View style={styles.text}>
              <Text variant="titleMedium">No session is open</Text>
              <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                A session is one cashier's shift on one POS Profile: sales are rung up inside it.
              </Text>
            </View>
            {can(permissions, 'POS Opening Entry', 'create') ? (
              <View style={styles.actions}>
                <Button mode="contained" onPress={() => onOpen('open-session')}>
                  Open Session
                </Button>
              </View>
            ) : null}
          </>
        )}
      </QueryState>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous' },
  text: { gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
