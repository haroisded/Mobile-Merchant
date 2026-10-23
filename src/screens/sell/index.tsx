import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { useRegisterSession } from '../../components/pos-session';
import { QueryState } from '../../components/query-state';
import { RecordIndex } from '../../components/record-index';
import type { IndexSection } from '../../components/record-index';
import { Text } from '../../components/text';
import { useMoney } from '../../features/currencies/queries';
import type { Merchant } from '../../features/merchants/queries';
import { useModesOfPaymentQuery } from '../../features/modes-of-payment/queries';
import { drawerCash } from '../../features/pos-invoices/cart';
import { useSessionInvoicesQuery } from '../../features/pos-invoices/queries';
import type { PosOpeningEntry } from '../../features/pos-opening-entries/queries';
import { can, has, usePermissions } from '../../features/role-permissions/queries';
import { useShellWide } from '../../lib/columns';
import { displayDate } from '../../lib/dates';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';
import { CloseSession } from '../pos-closing-entries/close-session';
import { OpenSession } from '../pos-opening-entries/open-session';

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
        purpose: 'Every sale and return, newest first. Open one to read its receipt again, take items back with a refund, or cancel it.',
        useCase: 'Use it when a customer comes back with a question or a refund.',
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
export function SellIndex({ merchant, isOwner }: { merchant: Merchant; isOwner: boolean }) {
  const open = (route: SellRoute) => router.push(`/systems/${merchant.id}/sell/${route}`);
  // A cashier opens a session without reading the list of them: the box is theirs, and nothing is missing below it.
  const opensSessions = isOwner || can(usePermissions({ merchantId: merchant.id }).data, 'POS Opening Entry', 'create');

  return (
    <RecordIndex
      merchantId={merchant.id}
      screen="sell"
      kicker={merchant.name}
      title="Sell"
      meta="Open a session, sell at the Register, close the session"
      isOwner={isOwner}
      sections={SELL_SECTIONS}
      onOpen={open}
      offline="You're offline. Sell will load when you reconnect."
      failure="Couldn't load Sell. Try again."
      empty={opensSessions ? null : 'Your permissions give you nothing to see here. Ask the owner if you need more.'}
    >
      {opensSessions ? <SessionCard merchant={merchant} onOpen={open} /> : null}
    </RecordIndex>
  );
}

type SessionDialog = 'open-session' | 'close-session';

/**
 * The cashier's own session: its number and an Open or Closed pill, the profile and since when, what it has sold and
 * holds in cash, and the way into the Register — or the way to open one. Wide, Open Session and Close Session are
 * Dialogs over this page (the human, 2026-10-23); narrow, their pages.
 */
function SessionCard({ merchant, onOpen }: { merchant: Merchant; onOpen: (route: SellRoute) => void }) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const { query, session, profile } = useRegisterSession(merchant.id);
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const [dialog, setDialog] = useState<SessionDialog | null>(null);
  const show = (route: SessionDialog) => (wide ? setDialog(route) : onOpen(route));
  // The figures add up the session's sales, which only who may look them up reads.
  const seesSales = can(permissions, 'POS Invoice', 'select') || can(permissions, 'POS Invoice', 'read');

  return (
    <View style={[styles.card, { borderColor: colors.outlineVariant }]}>
      <QueryState query={query} offline="You're offline. Your session will load when you reconnect." failure="Couldn't load your session. Try again.">
        {session ? (
          <>
            <View style={styles.text}>
              <View style={styles.title}>
                <Text variant="titleMedium">{`Session ${session.name}`}</Text>
                <StatusPill open />
              </View>
              <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                {[profile?.pos_profile_name, `Open since ${displayDate(session.posting_date)}`].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {seesSales ? <SessionFigures merchant={merchant} session={session} /> : null}
            <View style={styles.actions}>
              {/* Open/Close Register alone keeps a drawer without selling from it. */}
              {has(permissions, 'process_sales') ? (
                <Button mode="contained" onPress={() => onOpen('register')}>
                  Register
                </Button>
              ) : null}
              <Button mode="outlined" onPress={() => show('close-session')}>
                Close Session
              </Button>
            </View>
          </>
        ) : (
          <>
            <View style={styles.text}>
              <View style={styles.title}>
                <Text variant="titleMedium">No session is open</Text>
                <StatusPill open={false} />
              </View>
              <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                A session is one cashier&apos;s shift on one POS Profile: sales are rung up inside it.
              </Text>
            </View>
            {can(permissions, 'POS Opening Entry', 'create') ? (
              <View style={styles.actions}>
                <Button mode="contained" onPress={() => show('open-session')}>
                  Open Session
                </Button>
              </View>
            ) : null}
          </>
        )}
      </QueryState>
      {dialog === 'open-session' ? <OpenSession merchant={merchant} onClose={() => setDialog(null)} /> : null}
      {dialog === 'close-session' ? <CloseSession merchant={merchant} onClose={() => setDialog(null)} /> : null}
    </View>
  );
}

/** Open or Closed, in a pill: an open session's in `success`, a closed one's muted. */
export function StatusPill({ open }: { open: boolean }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.pill, { backgroundColor: open ? colors.successContainer : colors.surfaceMuted }]}>
      <Text variant="labelMedium" style={{ color: open ? colors.success : colors.onSurfaceMuted }}>
        {open ? 'Open' : 'Closed'}
      </Text>
    </View>
  );
}

/**
 * The open session in three figures: its orders (sales, not refunds), the cash its drawer holds now and what it
 * opened with — Cash-type methods only (drawerCash, src/features/pos-invoices/cart.ts), as closing will expect.
 */
function SessionFigures({ merchant, session }: { merchant: Merchant; session: PosOpeningEntry }) {
  const money = useMoney(merchant);
  const invoices = useSessionInvoicesQuery({ sessionId: session.id }, true).data;
  const modes = useModesOfPaymentQuery({ merchantId: merchant.id }).data;
  if (!invoices || !modes) return null;

  const isCash = (modeId: string) => modes.some((mode) => mode.id === modeId && mode.type === 'Cash');
  return (
    <FigureStrip
      figures={[
        { label: 'Orders', value: String(invoices.filter((invoice) => !invoice.is_return).length) },
        { label: 'Cash in drawer', value: money(drawerCash(session.pos_opening_entry_balances, invoices, isCash)) },
        { label: 'Opening cash', value: money(drawerCash(session.pos_opening_entry_balances, [], isCash)) },
      ]}
    />
  );
}

/** Figures side by side in one box, a rule between each: the session card's, and the Store Guide's copy of it. */
export function FigureStrip({ figures }: { figures: { label: string; value: string }[] }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.figures, { borderColor: colors.outlineVariant }]}>
      {figures.map((figure, index) => (
        <View key={figure.label} style={[styles.figure, index > 0 ? { borderLeftWidth: 1, borderLeftColor: colors.outlineVariant } : null]}>
          <Text variant="titleMedium">{figure.value}</Text>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
            {figure.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous' },
  text: { gap: spacing.xs },
  title: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  pill: { paddingHorizontal: spacing.ms, paddingVertical: spacing.xs / 2, borderRadius: radius.xl, borderCurve: 'continuous' },
  figures: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  figure: { flex: 1, gap: spacing.xs, paddingHorizontal: spacing.ms, paddingVertical: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
