import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { Drawer } from 'react-native-drawer-layout';

import { Appbar } from '../../../components/appbar';
import { Button } from '../../../components/button';
import { NavItem, StoreBadge } from '../../../components/shell-nav';
import { Surface } from '../../../components/surface';
import { Text } from '../../../components/text';
import { DRAWER_WIDTH, fontScaled, RAIL_COLLAPSED, RAIL_EXPANDED, useShellWide } from '../../../lib/columns';
import { useAppTheme } from '../../../lib/theme';
import { radius, spacing } from '../../../themes';
import { AccountsIndex, GeneralLedger } from '../pages/accounts';
import { Dashboard } from '../pages/dashboard';
import { STORE_NAME } from '../pages/frame';
import { AccessCodes, EmployeePage, Employees, FeaturesPage, HomePage, StoreLevel } from '../pages/owner';
import { CartPage, ClosingEntries, CloseSession, OpeningEntries, OpenSession, Orders, ReceiptPage, Register, ReturnPage, SalePage, ScanSell, SellIndex } from '../pages/sell';
import { SetupForm, SetupIndex, SetupList } from '../pages/setup';
import { ImportPage, ItemPage, ItemPricePage, ItemPrices, Items, ReconPage, Recons, ScanItem, StockBalance, StockEntries, StockEntryPage, StockIndex, StockLedger } from '../pages/stock';
import { roleById } from '../roles';
import type { Role } from '../roles';
import { initialStore } from '../sandbox-state';
import type { NewItem, Store } from '../sandbox-state';
import { holds, menuFor, PAGE_RULES, tasksFor } from '../tasks';
import type { Page, Task } from '../tasks';
import { SandboxContext } from './context';
import type { Params, Sandbox as SandboxValue } from './context';
import { GuideBar } from './guide-bar';
import { TaskDoneDialog, TaskIntroDialog, TaskListDialog } from './task-list';
import { useTour } from './use-tour';

// The Store Screen Sandbox: a practice store for one role (.claude/instruction-mds/frontend.md §5, Store Guide). The
// store's header over a rail (wide) or a drawer (narrow) listing only the role's screens, the practice pages, a guided
// task's bar, and its pop-ups. Nothing reaches the database: the store is src/screens/guide/sandbox-state.ts, held here
// and dropped on exit.
//
// Its pages switch by state in this one route, with a history Android's back walks — the one exception to
// structure.md rule 5. Rejected: a route per practice page (~35 files mirroring systems/[id], and the tour and the
// store held in a module store across them) for pages nothing links to and no deep link opens.

type Entry = { page: Page; params: Params };
type Pop = { kind: 'tasks' } | { kind: 'intro'; task: Task } | { kind: 'done'; task: Task };

export function Sandbox({ roleId }: { roleId: string }) {
  const role = roleById(roleId);
  if (role) return <PracticeStore role={role} />;
  return (
    <Surface style={styles.fill}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Store Guide" />
      </Appbar.Header>
      <View style={styles.missing}>
        <Text variant="bodyMedium">This role is not in the guide.</Text>
        <Button mode="outlined" onPress={() => router.back()}>
          Back to the Guide
        </Button>
      </View>
    </Surface>
  );
}

function PracticeStore({ role }: { role: Role }) {
  const wide = useShellWide();
  const { colors } = useAppTheme();
  const [store, setStore] = useState<Store>(initialStore);
  const [history, setHistory] = useState<Entry[]>([{ page: 'home', params: {} }]);
  const [pop, setPop] = useState<Pop | null>({ kind: 'tasks' });
  const [done, setDone] = useState<string[]>([]);
  const [scanned, setScanned] = useState<NewItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const current = history[history.length - 1];
  const tour = useTour({
    wide,
    setStore,
    startAt: (page) => setHistory([{ page, params: {} }]),
    onDone: (task) => {
      setDone((ids) => (ids.includes(task.id) ? ids : [...ids, task.id]));
      setPop({ kind: 'done', task });
    },
  });

  // Android's back walks the practice store's own pages first, then leaves it for the Guide page.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (history.length <= 1) return false;
      setHistory((entries) => entries.slice(0, -1));
      return true;
    });
    return () => subscription.remove();
  }, [history.length]);

  const value: SandboxValue = {
    role,
    store,
    act: (change) => setStore(change),
    page: current.page,
    params: current.params,
    go: (page, params = {}) => setHistory((entries) => [...entries, { page, params }]),
    replace: (page, params = {}) => setHistory((entries) => [...entries.slice(0, -1), { page, params }]),
    reset: (page) => setHistory([{ page, params: {} }]),
    back: () => (history.length > 1 ? setHistory((entries) => entries.slice(0, -1)) : router.back()),
    holds: (key) => holds(role, key),
    did: tour.did,
    isTarget: tour.isTarget,
    scanned,
    setScanned,
    showTasks: () => setPop({ kind: 'tasks' }),
  };

  const nav = (
    <SandboxNav
      role={role}
      wide={wide}
      labelled={!wide || expanded}
      active={PAGE_RULES[current.page].destination}
      onOpen={(page) => {
        setHistory([{ page, params: {} }]);
        setDrawerOpen(false);
      }}
    />
  );
  const content = (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <View style={styles.fill}>
        {/* Keyed by depth: each page opened is a fresh one, as a pushed route is. */}
        <PageView key={`${history.length}-${current.page}`} page={current.page} />
      </View>
      <TourBar tour={tour} page={current.page} wide={wide} />
    </View>
  );

  return (
    <SandboxContext value={value}>
      <Surface style={styles.fill}>
        <Appbar.Header style={{ backgroundColor: colors.primary }}>
          <Appbar.Action icon="menu" color={colors.onPrimary} accessibilityLabel="Menu" onPress={() => (wide ? setExpanded((open) => !open) : setDrawerOpen((open) => !open))} />
          <Appbar.Content title={`Guide · ${role.name}`} color={colors.onPrimary} />
          <Appbar.Action icon="checklist" color={colors.onPrimary} accessibilityLabel="Tasks" onPress={() => setPop({ kind: 'tasks' })} />
          <Appbar.Action icon="close" color={colors.onPrimary} accessibilityLabel="Leave the practice store" onPress={() => router.back()} />
        </Appbar.Header>
        <SandboxLayout wide={wide} expanded={expanded} drawerOpen={drawerOpen} setDrawerOpen={setDrawerOpen} nav={nav}>
          {content}
        </SandboxLayout>
        <SandboxPops
          role={role}
          pop={pop}
          done={done}
          setPop={setPop}
          onStart={(task) => {
            setPop(null);
            tour.start(task);
          }}
        />
      </Surface>
    </SandboxContext>
  );
}

type LayoutProps = { wide: boolean; expanded: boolean; drawerOpen: boolean; setDrawerOpen: (open: boolean) => void; nav: ReactNode; children: ReactNode };

/** The rail beside the page on a wide window; the front drawer over it on a narrow one, as the real shell lays out. */
function SandboxLayout({ wide, expanded, drawerOpen, setDrawerOpen, nav, children }: LayoutProps) {
  const { colors } = useAppTheme();
  if (wide) {
    return (
      <View style={styles.row}>
        <View style={{ width: expanded ? fontScaled(RAIL_EXPANDED) : RAIL_COLLAPSED }}>{nav}</View>
        {children}
      </View>
    );
  }
  return (
    <Drawer
      open={drawerOpen}
      onOpen={() => setDrawerOpen(true)}
      onClose={() => setDrawerOpen(false)}
      drawerType="front"
      drawerStyle={[styles.drawer, { width: DRAWER_WIDTH, backgroundColor: colors.primary }]}
      overlayStyle={{ backgroundColor: colors.backdrop }}
      renderDrawerContent={() => nav}
    >
      {children}
    </Drawer>
  );
}

/** The guided task's bar, while a task runs. */
function TourBar({ tour, page, wide }: { tour: ReturnType<typeof useTour>; page: Page; wide: boolean }) {
  const { tour: running, step } = tour;
  if (!running || !step) return null;
  return (
    <GuideBar
      task={running.task}
      step={step}
      index={running.step}
      count={tour.count}
      // On a tablet the cart is the Register's right pane, so a cart step is on the Register page.
      elsewhere={step.page !== page && !(wide && step.page === 'cart' && page === 'register')}
      onRestart={() => tour.start(running.task)}
      onStop={tour.stop}
    />
  );
}

type NavProps = { role: Role; wide: boolean; labelled: boolean; active: string; onOpen: (page: Page) => void };

/** The rail or drawer: the practice store's badge, then the destinations this role reaches (menuFor). */
function SandboxNav({ role, wide, labelled, active, onOpen }: NavProps) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.fill, { backgroundColor: colors.primary }]}>
      <StoreBadge name={STORE_NAME} line="Practice store" wide={wide} labelled={labelled} />
      {/* Scrolls: the owner's nine destinations outgrow a landscape tablet's rail, and any menu at a large font size. */}
      <ScrollView contentContainerStyle={styles.items}>
        {menuFor(role).map((entry) => (
          <NavItem key={entry.name} label={entry.label} icon={entry.icon} wide={wide} labelled={labelled} active={entry.name === active} onPress={() => onOpen(entry.page)} />
        ))}
      </ScrollView>
    </View>
  );
}

type PopsProps = { role: Role; pop: Pop | null; done: string[]; setPop: (pop: Pop | null) => void; onStart: (task: Task) => void };

/** The role's task list, a task's "what you'll do", and a task done. */
function SandboxPops({ role, pop, done, setPop, onStart }: PopsProps) {
  const tasks = tasksFor(role);
  // The next task not yet done, after this one or else from the top.
  const nextAfter = (task: Task) =>
    tasks.slice(tasks.indexOf(task) + 1).find((candidate) => !done.includes(candidate.id)) ?? tasks.find((candidate) => !done.includes(candidate.id) && candidate !== task) ?? null;

  if (pop?.kind === 'tasks') return <TaskListDialog role={role} tasks={tasks} done={done} onPick={(task) => setPop({ kind: 'intro', task })} onClose={() => setPop(null)} />;
  if (pop?.kind === 'intro') return <TaskIntroDialog task={pop.task} onStart={() => onStart(pop.task)} onClose={() => setPop({ kind: 'tasks' })} />;
  if (pop?.kind !== 'done') return null;
  const next = nextAfter(pop.task);
  return <TaskDoneDialog task={pop.task} next={next} onNext={() => setPop(next ? { kind: 'intro', task: next } : { kind: 'tasks' })} onList={() => setPop({ kind: 'tasks' })} />;
}

const PAGES = {
  home: <HomePage />,
  dashboard: <Dashboard />,
  sell: <SellIndex />,
  'open-session': <OpenSession />,
  register: <Register />,
  cart: <CartPage />,
  'scan-sell': <ScanSell />,
  receipt: <ReceiptPage />,
  orders: <Orders />,
  sale: <SalePage />,
  return: <ReturnPage />,
  'close-session': <CloseSession />,
  'opening-entries': <OpeningEntries />,
  'closing-entries': <ClosingEntries />,
  stock: <StockIndex />,
  items: <Items />,
  item: <ItemPage />,
  'scan-item': <ScanItem />,
  'item-prices': <ItemPrices />,
  'item-price': <ItemPricePage />,
  import: <ImportPage />,
  'stock-entries': <StockEntries />,
  'stock-entry': <StockEntryPage />,
  recons: <Recons />,
  recon: <ReconPage />,
  'stock-balance': <StockBalance />,
  'stock-ledger': <StockLedger />,
  accounts: <AccountsIndex />,
  'general-ledger': <GeneralLedger />,
  setup: <SetupIndex />,
  'setup-list': <SetupList />,
  'setup-form': <SetupForm />,
  employees: <Employees />,
  employee: <EmployeePage />,
  'access-codes': <AccessCodes />,
  features: <FeaturesPage />,
  'store-level': <StoreLevel />,
} satisfies Record<Page, ReactNode>;

/** The practice page the history is on. Pages are reached only through the role's menu and the buttons it may press. */
function PageView({ page }: { page: Page }) {
  return PAGES[page];
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  missing: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.lg },
  drawer: { borderTopRightRadius: radius.xl, borderBottomRightRadius: radius.xl, overflow: 'hidden' },
  items: { paddingTop: spacing.sm },
});
