import { router } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { User } from '@supabase/supabase-js';

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
import { FORM_MEASURE, useShellWide } from '../../lib/columns';
import { failureMessage } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { useSession } from '../../Store/StoreUser';
import { spacing } from '../../themes';
import { PreferencesCard } from './preferences-card';

type Props = {
  /** The back arrow (narrow) and Go Back (wide). */
  onBack: () => void;
};

// The Account tab's body (`(tabs)/account.tsx`). On a tablet the tab bar is hidden, and the systems
// list's account icon opens it instead.
export function ProfileScreen({ onBack }: Props) {
  const session = useSession();
  const { data: profile } = useProfileQuery();
  // MD3's `error` role, read from whichever of themes.js's two palettes the root layout put in
  // context. A destructive action is the one place a color has to be picked by hand, and this is
  // how it gets picked without hardcoding one.
  const { colors } = useAppTheme();
  const narrow = !useShellWide();
  const { busy, error, signOutNow } = useSignOut();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // The root guard only renders this branch with a session; the check is what narrows the
  // three-state value for TypeScript, and it covers the frame between sign-out and the flip.
  //
  // No router call follows a successful sign-out or delete, from any route. The session going null
  // flips the root layout's guard, which drops the whole (app) history — this screen, the shell under
  // it and the systems list — and lands on sign-in.
  if (!session) return null;

  const user = session.user;
  const { name, email } = identity(user, profile?.display_name);

  // Narrow, the confirm is a formSheet route (.claude/instruction_mds/frontend.md §5); wide, it mounts here.
  const askDelete = () => {
    if (narrow) router.push('/sheets/delete-account');
    else setConfirmingDelete(true);
  };

  return (
    <Surface style={styles.screen}>
      {/* Narrow gets a back arrow; wide gets the "Go Back" button at the bottom
          instead, so the same action is not offered twice. */}
      <Appbar.Header>
        {narrow ? <Appbar.BackAction onPress={onBack} /> : null}
        <Appbar.Content title="Profile" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.identity}>
          <View>
            <Avatar.Icon size={narrow ? 80 : 96} icon="account" />
            {/* Unticked: renders over the avatar, does nothing yet. */}
            <FAB size="small" icon="camera" style={styles.avatarFab} />
          </View>
          <Text variant="titleMedium">{name}</Text>
          <Text variant="bodySmall">{email}</Text>
        </View>

        <ProfileDetails narrow={narrow} name={name} email={email} user={user} />

        {/* Outside the width branch on purpose: a phone and a tablet both get it. */}
        <PreferencesCard />

        <View style={narrow ? styles.actions : styles.actionsRow}>
          {narrow ? null : (
            <Button icon="arrow-back" mode="outlined" onPress={onBack} contentStyle={styles.leading}>
              Go Back
            </Button>
          )}
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
        <Button icon="person-remove" mode="text" textColor={colors.error} onPress={askDelete} disabled={busy} contentStyle={styles.leading}>
          Delete account
        </Button>
        <HelperText type="error" visible={error !== null}>
          {error}
        </HelperText>
        {confirmingDelete ? <DeleteAccountDialog onDismiss={() => setConfirmingDelete(false)} /> : null}
      </ScrollView>
    </Surface>
  );
}

/**
 * display_name wins over the OAuth full_name when set. Facebook withholds the email when the account
 * has no confirmed address, so the chain falls through to the user id rather than rendering blank.
 */
function identity(user: User, displayName: string | null | undefined) {
  const email = user.email ?? user.id;
  return { name: displayName ?? user.user_metadata.full_name ?? email, email };
}

function useSignOut() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return { busy, error, signOutNow };
}

type DetailsProps = { narrow: boolean; name: string; email: string; user: User };

/** Narrow, the account and security lists; wide, the same identity condensed into one details card. */
function ProfileDetails({ narrow, name, email, user }: DetailsProps) {
  if (!narrow) {
    return (
      // Wide condenses the same identity into one details card, per the M3 tablet analysis.
      <Card mode="contained">
        <Card.Title title="Account Details" titleVariant="titleMedium" left={(p) => <Avatar.Icon {...p} icon="account" />} />
        <Card.Content style={styles.details}>
          <Detail label="Full name">{name}</Detail>
          <Detail label="Email address">{email}</Detail>
          <Detail label="Signed in with">{user.app_metadata.provider ?? 'unknown'}</Detail>
          <Detail label="Account ID">{user.id}</Detail>
        </Card.Content>
      </Card>
    );
  }

  return (
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
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View>
      <Text variant="labelMedium">{label}</Text>
      <Text variant="bodyMedium">{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  leading: { justifyContent: 'flex-start' },
  screen: { flex: 1 },
  body: { gap: spacing.ms, padding: spacing.lg, maxWidth: FORM_MEASURE, width: '100%' },
  // Left-aligned like every heading and label (.claude/instruction_mds/frontend.md rule 18).
  identity: { alignItems: 'flex-start', gap: spacing.xs },
  // Overlaps the avatar's corner: a position, not spacing between siblings.
  avatarFab: { position: 'absolute', right: -spacing.sm, bottom: -spacing.sm },
  details: { gap: spacing.ms },
  actions: { gap: spacing.ms },
  // Wide: content-width buttons in a row. Stacked full-width buttons read as banners on a tablet.
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
