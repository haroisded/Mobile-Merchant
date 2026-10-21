import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../../components/button';
import { PickChip } from '../../../components/filter-chips';
import { IconButton } from '../../../components/icon-button';
import { LevelPicker } from '../../../components/level-picker';
import { NoteCallout } from '../../../components/note-callout';
import { Snackbar } from '../../../components/snackbar';
import { RowBox } from '../../../components/row-box';
import { Text } from '../../../components/text';
import { levelInfo } from '../../../features/merchants/levels';
import { formatCode } from '../../../features/access-codes/code';
import { useAppTheme } from '../../../lib/theme';
import { radius, spacing } from '../../../themes';
import { useSandbox } from '../sandbox/context';
import { GuideTarget } from '../sandbox/guide-target';
import { createCode, setLevel, setRole } from '../sandbox-state';
import { T } from '../tasks';
import { Frame, ListRow, ReadOut } from './frame';

// The owner's screens in the practice store: Employees (src/screens/employees/), Access Codes (src/screens/access-codes/,
// a bottom tab in the app) and Features' Store Level box (src/screens/features/). Features opens for everyone.

const ROLE_NAMES = ['Cashier', 'Stock Clerk', 'Store Manager'];

export function Employees() {
  const { store, go, did } = useSandbox();

  return (
    <Frame title="Employees" meta={`${store.employees.length} employees`}>
      <GuideTarget target={T.employeesRow}>
        <RowBox empty="">
          {[
            <ListRow key="owner" first title="You" sub="You · Owner · Every permission" />,
            ...store.employees.map((employee) => (
              <ListRow
                key={employee.id}
                first={false}
                title={employee.name}
                sub={employee.email}
                status={employee.role ?? 'No role'}
                onPress={() => {
                  if (employee.role === null) did(T.employeesRow);
                  go('employee', { employeeId: employee.id });
                }}
              />
            )),
          ]}
        </RowBox>
      </GuideTarget>
    </Frame>
  );
}

export function EmployeePage() {
  const { store, act, params, back, did } = useSandbox();
  const employee = store.employees.find((candidate) => candidate.id === params.employeeId);
  const [role, setRoleName] = useState<string | null>(employee?.role ?? null);
  if (!employee) return <Frame title="Employee" onBack={back}><Text variant="bodyMedium">This person is gone.</Text></Frame>;

  return (
    <Frame
      title={employee.name}
      meta={employee.email}
      onBack={back}
      footer={
        <GuideTarget target={T.employeeSave}>
          <Button
            mode="contained"
            disabled={role === employee.role}
            onPress={() => {
              act((current) => setRole(current, employee.id, role));
              did(T.employeeSave);
              back();
            }}
            contentStyle={styles.leading}
          >
            Save Changes
          </Button>
        </GuideTarget>
      }
    >
      <Text variant="labelMedium">Role</Text>
      <GuideTarget target={T.employeeRole}>
        <View style={styles.chips}>
          {[null, ...ROLE_NAMES].map((name) => (
            <PickChip
              key={name ?? 'none'}
              picked={name === role}
              onPress={() => {
                setRoleName(name);
                if (name !== null) did(T.employeeRole);
              }}
            >
              {name ?? 'No role'}
            </PickChip>
          ))}
        </View>
      </GuideTarget>
      <NoteCallout>{role ? `Everything comes from ${role}. On a real store each permission is a switch here too, for this person alone.` : 'With no role this person sees Home only.'}</NoteCallout>
    </Frame>
  );
}

export function AccessCodes() {
  const { store, act, did } = useSandbox();
  const [sent, setSent] = useState(false);

  return (
    <View style={styles.fill}>
      <Frame
        title="Access Codes"
        meta="In the app: the Access Codes tab, outside the store"
        actions={
          <GuideTarget target={T.codesCreate}>
            <Button
              mode="contained"
              icon="add"
              onPress={() => {
                act(createCode);
                did(T.codesCreate);
              }}
            >
              Create Code
            </Button>
          </GuideTarget>
        }
      >
        <GuideTarget target={T.codesShare}>
          <RowBox empty="No codes yet. A code is the one way into your store.">
            {store.codes.map((code, index) => (
              <View key={`${code}-${index}`} style={styles.codeRow}>
                <View style={styles.fill}>
                  <ListRow first={index === 0} title={formatCode(code)} sub="Sample Cafe · 1 person · expires in 1 hour" status="ACTIVE" />
                </View>
                <IconButton
                  icon="share"
                  accessibilityLabel={`Share ${formatCode(code)}`}
                  onPress={() => {
                    setSent(true);
                    did(T.codesShare);
                  }}
                />
              </View>
            ))}
          </RowBox>
        </GuideTarget>
      </Frame>
      <Snackbar visible={sent} onDismiss={() => setSent(false)} duration={4000}>
        The practice store sends nothing. A real code opens the phone's share sheet.
      </Snackbar>
    </View>
  );
}

export function FeaturesPage() {
  const { store, role, go, did } = useSandbox();
  const { colors } = useAppTheme();
  const info = levelInfo(store.level);

  return (
    <Frame title="Features" meta="Hide the screens and pages you don't use in this store. Only your own menu changes.">
      <View style={[styles.box, { borderColor: colors.outlineVariant }]}>
        <Text variant="labelMedium" style={{ color: colors.secondary }}>
          Store level
        </Text>
        <Text variant="titleMedium">{`Level ${info.level} · ${info.name}`}</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {info.summary}
        </Text>
        {role.owner ? (
          <GuideTarget target={T.featuresChange}>
            <Button mode="outlined" onPress={() => { did(T.featuresChange); go('store-level'); }} style={styles.hug}>
              Change Level
            </Button>
          </GuideTarget>
        ) : null}
      </View>
      <NoteCallout>In a real store this page also lists every screen you may open, each with its own switch. Hiding only removes it from your menu: nothing is deleted or turned off.</NoteCallout>
    </Frame>
  );
}

export function StoreLevel() {
  const { store, act, back, did } = useSandbox();
  const [level, setLevelValue] = useState(store.level);
  const info = levelInfo(level);

  return (
    <Frame
      title="Store Level"
      onBack={back}
      footer={
        <GuideTarget target={T.levelSave}>
          <Button
            mode="contained"
            disabled={level === store.level}
            onPress={() => {
              act((current) => setLevel(current, level));
              did(T.levelSave);
              back();
            }}
            contentStyle={styles.leading}
          >
            Save
          </Button>
        </GuideTarget>
      }
    >
      <NoteCallout>{"A level sets things up for the store and starts everyone's menu from it. Nothing is turned off."}</NoteCallout>
      <GuideTarget target={T.levelPick}>
        <LevelPicker
          value={level}
          onChange={(picked) => {
            setLevelValue(picked);
            if (picked !== store.level) did(T.levelPick);
          }}
        />
      </GuideTarget>
      <ReadOut label="Picked" value={`Level ${info.level} · ${info.name}`} />
    </Frame>
  );
}

/** Home: empty in a real store, so here it says so — and, for someone with no role, what Home tells them. */
export function HomePage() {
  const { role, did, showTasks } = useSandbox();
  const { colors } = useAppTheme();

  if (role.permissions.length === 0 && !role.owner) {
    return (
      <Frame title="Home">
        <Text variant="headlineSmall">{"You're in. The owner hasn't given you a role yet."}</Text>
        <Text variant="bodyMedium" style={{ color: colors.onSurfaceMuted }}>
          Your menu fills once they give you one.
        </Text>
        <GuideTarget target={T.homeOk}>
          <Button mode="contained" onPress={() => did(T.homeOk)} style={styles.hug}>
            Got It
          </Button>
        </GuideTarget>
      </Frame>
    );
  }

  return (
    <Frame title="Home" meta="The practice store">
      <Text variant="bodyMedium">In a real store Home stays empty: the work is on the screens in the menu. The menu here shows only what this role reaches.</Text>
      <Button mode="contained" icon="checklist" onPress={showTasks} style={styles.hug}>
        Show My Tasks
      </Button>
    </Frame>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
  hug: { alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.xs },
  codeRow: { flexDirection: 'row', alignItems: 'center' },
  box: { gap: spacing.xs, padding: spacing.ms, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous' },
});
