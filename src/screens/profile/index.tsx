import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Appbar } from '../../components/appbar';
import { Avatar } from '../../components/avatar';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { DeleteAccountDialog } from '../../components/delete-account-dialog';
import { Divider } from '../../components/divider';
import { FAB } from '../../components/fab';
import { HelperText } from '../../components/helper-text';
import { List } from '../../components/list';
import { Surface } from '../../components/surface';
import { Text } from '../../components/text';
import { useProfileQuery } from '../../features/profiles/queries';
import { signOut } from '../../lib/auth';
import { useColumns } from '../../lib/columns';
import { failureMessage } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { useSession } from '../../Store/StoreUser';
import { spacing } from '../../themes';
import { PreferencesCard } from './preferences-card';

type Props = {
  /** The back arrow (narrow) and the Go Back button (wide). Where it goes depends on the route. */
  onBack: () => void;
  /**
   * Given only when Profile was opened from inside a system. Renders "Back to your systems", the one
   * way out of a system: the shell's rail and drawer carry no switcher.
   */
  onExitSystem?: () => void;
};

// The ProfileDialog from the specs, rendered as a screen rather than a Dialog. On a wide container
// the M3 analysis calls for a centred modal, but this is a navigation destination, not a layer over
// something else. It gets a maximum measure so the content does not span a 1000dp tablet, and stays
// left-aligned like every screen (instruction_mds/layout.md rule 6).
//
// A screen rather than a route because two routes render it, and they differ only in where back
// goes: the Account tab `(tabs)/account.tsx` returns to the systems list, and `(app)/profile.tsx`,
// pushed from inside a system, returns to that system (instruction_mds/structure.md §3).
export function ProfileScreen({ onBack, onExitSystem }: Props) {
  const session = useSession();
  const { data: profile } = useProfileQuery();
  // MD3's `error` role, read from whichever of themes.js's two palettes the root layout put in
  // context. A destructive action is the one place a color has to be picked by hand, and this is
  // how it gets picked without hardcoding one.
  const { colors } = useAppTheme();
  const { columns, onLayout } = useColumns();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // The root guard only renders this branch with a session; the check is what narrows the
  // three-state value for TypeScript, and it covers the frame between sign-out and the flip.
  //
  // No router call follows a successful sign-out or delete, from either route. The session going
  // null flips the root layout's guard, which drops the whole (app) history — this screen, the
  // shell under it and the systems list — and lands on sign-in.
  if (!session) return null;

  const user = session.user;
  const narrow = columns === 1;

  // display_name is what the user typed in the wizard's step 1, so it wins over the OAuth
  // full_name. Facebook withholds the email when the account has no confirmed address, so the
  // chain falls through to the user id rather than rendering blank.
  const name = profile?.display_name ?? user.user_metadata.full_name ?? user.email ?? user.id;
  const email = user.email ?? user.id;

  const signOutNow = async () => {
    setBusy(true);
    setError(null);
    try {
      await signOut();
    } catch (e) {
      // The one place the real error still goes. __DEV__ is stripped from release builds, the same
      // mechanism supabase.ts uses for its `debug` flag, so this keeps the detail reachable while
      // developing without putting a GoTrue string in front of a user.
      if (__DEV__) console.warn('[profile]', e);
      setError(failureMessage("Couldn't sign out. Try again."));
    } finally {
      setBusy(false);
    }
  };

  // Narrow, the confirm is a formSheet route (instruction_mds/visual-language.md §5); wide, it mounts here.
  const askDelete = () => {
    if (narrow) router.push('/sheets/delete-account');
    else setConfirmingDelete(true);
  };

  return (
    <Surface style={styles.screen}>
      {/* Narrow gets the back arrow the mockup shows; wide gets the "Go Back" button at the bottom
          instead, so the same action is not offered twice. */}
      <Appbar.Header>
        {narrow ? <Appbar.BackAction onPress={onBack} /> : null}
        <Appbar.Content title="Profile" />
      </Appbar.Header>

      <View style={styles.measured} onLayout={onLayout}>
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.identity}>
            <View>
              <Avatar.Icon size={narrow ? 80 : 96} icon="account" />
              {/* Unticked: renders over the avatar as in the mockup, does nothing yet. */}
              <FAB size="small" icon="camera" style={styles.avatarFab} />
            </View>
            <Text variant="titleMedium">{name}</Text>
            <Text variant="bodySmall">{email}</Text>
          </View>

          {narrow ? (
            <>
              <Text variant="labelMedium">Account</Text>
              <Card>
                <List.Item title="Account Information" left={(p) => <List.Icon {...p} icon="account" />} right={(p) => <List.Icon {...p} icon="chevron-right" />} />
                <Divider />
                <List.Item title="Your Businesses" left={(p) => <List.Icon {...p} icon="grid" />} right={(p) => <List.Icon {...p} icon="chevron-right" />} />
                <Divider />
                <List.Item title="Manage Devices" left={(p) => <List.Icon {...p} icon="device" />} right={(p) => <List.Icon {...p} icon="chevron-right" />} />
              </Card>

              <Text variant="labelMedium">Security &amp; Privacy</Text>
              <Card>
                <List.Item title="Privacy Policy" left={(p) => <List.Icon {...p} icon="shield" />} right={(p) => <List.Icon {...p} icon="chevron-right" />} />
                <Divider />
                <List.Item title="Terms of Service" left={(p) => <List.Icon {...p} icon="terms" />} right={(p) => <List.Icon {...p} icon="chevron-right" />} />
              </Card>
            </>
          ) : (
            // Wide condenses the same identity into one details card, per the M3 tablet analysis.
            <Card mode="contained">
              <Card.Title title="Account Details" titleVariant="titleMedium" left={(p) => <Avatar.Icon {...p} icon="account" />} />
              <Card.Content style={styles.details}>
                <View>
                  <Text variant="labelMedium">Full name</Text>
                  <Text variant="bodyMedium">{name}</Text>
                </View>
                <View>
                  <Text variant="labelMedium">Email address</Text>
                  <Text variant="bodyMedium">{email}</Text>
                </View>
                <View>
                  <Text variant="labelMedium">Signed in with</Text>
                  <Text variant="bodyMedium">{user.app_metadata.provider ?? 'unknown'}</Text>
                </View>
                <View>
                  <Text variant="labelMedium">Account ID</Text>
                  <Text variant="bodyMedium">{user.id}</Text>
                </View>
              </Card.Content>
            </Card>
          )}

          {/* Outside the width branch on purpose: a phone and a tablet both get it. */}
          <PreferencesCard />

          <View style={styles.actions}>
            {narrow ? null : (
              <Button icon="arrow-back" mode="outlined" onPress={onBack} contentStyle={styles.leading}>
                Go Back
              </Button>
            )}
            {onExitSystem ? (
              <Button icon="grid" mode="outlined" onPress={onExitSystem} disabled={busy} contentStyle={styles.leading}>
                Back to your systems
              </Button>
            ) : null}
            <Button
              icon="logout"
              mode="contained"
              buttonColor={colors.error}
              textColor={colors.onError}
              onPress={() => void signOutNow()}
              loading={busy}
              disabled={busy}
              contentStyle={styles.leading}
            >
              Sign Out
            </Button>
          </View>

          {/* Deleting an account has to be reachable in-app — App Store Guideline 5.1.1(v) — and it
              cannot be undone, so it asks first and is styled apart from the primary action. */}
          <Button
            icon="person-remove"
            mode="text"
            textColor={colors.error}
            onPress={askDelete}
            disabled={busy}
            contentStyle={styles.leading}
          >
            Delete account
          </Button>

          <HelperText type="error" visible={error !== null}>
            {error}
          </HelperText>
        </ScrollView>
      </View>

      {confirmingDelete ? <DeleteAccountDialog wide onDismiss={() => setConfirmingDelete(false)} /> : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  // Full-width buttons put their label at the left edge (instruction_mds/visual-language.md §5).
  leading: { justifyContent: 'flex-start' },
  screen: { flex: 1 },
  measured: { flex: 1 },
  body: { gap: spacing.ms, padding: spacing.lg, maxWidth: 640, width: '100%' },
  // Left-aligned like every heading and label (instruction_mds/visual-language.md rule 8).
  identity: { alignItems: 'flex-start', gap: spacing.xs },
  // Overlaps the avatar's corner, as the mockup draws it: a position, not spacing between siblings.
  avatarFab: { position: 'absolute', right: -spacing.sm, bottom: -spacing.sm },
  details: { gap: spacing.ms },
  actions: { gap: spacing.ms },
});
