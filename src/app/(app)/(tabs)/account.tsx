import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Avatar,
  Button,
  Card,
  Dialog,
  Divider,
  FAB,
  HelperText,
  List,
  Portal,
  Surface,
  Switch,
  Text,
  useTheme,
} from 'react-native-paper';

import { useProfileQuery } from '../../../features/profiles/queries';
import { deleteAccount, signOut } from '../../../lib/auth';
import { useColumns } from '../../../lib/columns';
import { useSession } from '../../../Store/StoreUser';

// The ProfileDialog from the specs, shipped as a tab screen rather than a Dialog. On a wide
// container the M3 analysis calls for a centred modal, but this is a navigation destination — the
// Account tab — not a layer over something else. It gets the same treatment a centred dialog would:
// a maximum measure so the content does not span a 1000dp tablet (docs/layout.md rule 6).
export default function Account() {
  const session = useSession();
  const { data: profile } = useProfileQuery();
  // MD3's `error` role, read from whichever of themes.js's two palettes the root layout put in
  // context. A destructive action is the one place a color has to be picked by hand, and this is
  // how it gets picked without hardcoding one.
  const { colors } = useTheme();
  const { columns, onLayout } = useColumns();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // The root guard only renders this branch with a session; the check is what narrows the
  // three-state value for TypeScript, and it covers the frame between sign-out and the flip.
  if (!session) return null;

  const user = session.user;
  const narrow = columns === 1;

  // display_name is what the user typed in the wizard's step 1, so it wins over the OAuth
  // full_name. Facebook withholds the email when the account has no confirmed address, so the
  // chain falls through to the user id rather than rendering blank.
  const name = profile?.display_name ?? user.user_metadata.full_name ?? user.email ?? user.id;
  const email = user.email ?? user.id;

  // Both actions end the session, so both unmount this screen on success and only ever surface an
  // error on failure. One wrapper rather than two copies of the same try/finally.
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const signOutButton = (
    <Button
      icon="logout"
      mode="contained"
      buttonColor={colors.error}
      textColor={colors.onError}
      onPress={() => run(signOut)}
      loading={busy}
      disabled={busy}
    >
      Sign Out
    </Button>
  );

  return (
    <Surface style={styles.screen}>
      {/* Narrow gets the back arrow the mockup shows; wide gets the "Go Back" button at the bottom
          instead, so the same action is not offered twice. */}
      <Appbar.Header>
        {narrow ? <Appbar.BackAction onPress={() => router.navigate('/')} /> : null}
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
              <Text variant="labelMedium">ACCOUNT</Text>
              <Card>
                <List.Item title="Account Information" left={(p) => <List.Icon {...p} icon="account" />} right={(p) => <List.Icon {...p} icon="chevron-right" />} />
                <Divider />
                <List.Item title="Your Businesses" left={(p) => <List.Icon {...p} icon="view-grid" />} right={(p) => <List.Icon {...p} icon="chevron-right" />} />
                <Divider />
                <List.Item title="Manage Devices" left={(p) => <List.Icon {...p} icon="cellphone" />} right={(p) => <List.Icon {...p} icon="chevron-right" />} />
              </Card>

              <Text variant="labelMedium">SECURITY &amp; PRIVACY</Text>
              <Card>
                <List.Item title="Privacy Policy" left={(p) => <List.Icon {...p} icon="shield-account" />} right={(p) => <List.Icon {...p} icon="chevron-right" />} />
                <Divider />
                <List.Item title="Terms of Service" left={(p) => <List.Icon {...p} icon="handshake" />} right={(p) => <List.Icon {...p} icon="chevron-right" />} />
              </Card>

              <Text variant="labelMedium">PREFERENCES</Text>
              <Card>
                {/* The Switch has no onValueChange — the Appearance toggle is unticked. The theme
                    still follows the OS setting through useColorScheme() in the root layout. */}
                <List.Item
                  title="Appearance"
                  left={(p) => <List.Icon {...p} icon="weather-night" />}
                  right={() => <Switch value={false} />}
                />
              </Card>
            </>
          ) : (
            // Wide condenses the same identity into one details card, per the M3 tablet analysis.
            <Card mode="contained">
              <Card.Title title="Account Details" titleVariant="titleMedium" left={(p) => <Avatar.Icon {...p} icon="account" />} />
              <Card.Content style={styles.details}>
                <View>
                  <Text variant="labelMedium">FULL NAME</Text>
                  <Text variant="bodyMedium">{name}</Text>
                </View>
                <View>
                  <Text variant="labelMedium">EMAIL ADDRESS</Text>
                  <Text variant="bodyMedium">{email}</Text>
                </View>
                <View>
                  <Text variant="labelMedium">SIGNED IN WITH</Text>
                  <Text variant="bodyMedium">{user.app_metadata.provider ?? 'unknown'}</Text>
                </View>
                <View>
                  <Text variant="labelMedium">ACCOUNT ID</Text>
                  <Text variant="bodyMedium">{user.id}</Text>
                </View>
              </Card.Content>
            </Card>
          )}

          <View style={styles.actions}>
            {narrow ? null : (
              <Button icon="arrow-left" mode="outlined" onPress={() => router.navigate('/')}>
                Go Back
              </Button>
            )}
            {signOutButton}
          </View>

          {/* Deleting an account has to be reachable in-app — App Store Guideline 5.1.1(v) — and it
              cannot be undone, so it asks first and is styled apart from the primary action. */}
          <Button
            icon="account-remove"
            mode="text"
            textColor={colors.error}
            onPress={() => setConfirmingDelete(true)}
            disabled={busy}
          >
            Delete account
          </Button>

          <HelperText type="error" visible={error !== null}>
            {error}
          </HelperText>
        </ScrollView>
      </View>

      <Portal>
        {/* Dialog has no maximum width of its own — its container is only
            marginHorizontal: Math.max(left, right, 26) (Dialog/Dialog.js:95) — so on a tablet a
            confirmation would span ~950dp without this (docs/layout.md rule 7). */}
        <Dialog
          visible={confirmingDelete}
          onDismiss={() => setConfirmingDelete(false)}
          style={styles.dialog}
        >
          <Dialog.Title>Delete account?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              This permanently deletes your account and everything stored against it. It cannot be
              undone.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmingDelete(false)}>Cancel</Button>
            <Button
              textColor={colors.error}
              onPress={() => {
                setConfirmingDelete(false);
                void run(deleteAccount);
              }}
            >
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  measured: { flex: 1 },
  body: { gap: 12, padding: 24, maxWidth: 640, alignSelf: 'center', width: '100%' },
  identity: { alignItems: 'center', gap: 4 },
  avatarFab: { position: 'absolute', right: -8, bottom: -8 },
  details: { gap: 12 },
  actions: { gap: 12 },
  dialog: { maxWidth: 560, alignSelf: 'center', width: '100%' },
});
