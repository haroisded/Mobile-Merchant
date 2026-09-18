import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import { renderIcon } from '../lib/icons';
import { makeQueryClient } from '../lib/query';
import { useIsSessionLoading, useSession } from '../Store/StoreUser';
import { DarkTheme, LightTheme } from '../themes';


// Module scope, not awaited, and deliberately so: called from inside a component or hook it can
// run after the splash has already auto-hidden, which is too late to prevent anything.
SplashScreen.preventAutoHideAsync();


// One QueryClient per mount. The lazy initialiser is what stops a new client being built on every
// render — passing makeQueryClient() rather than makeQueryClient would call it each time and throw
// the cache away constantly.
//
// Defined here rather than in lib/query.ts because the factory and the only place it is mounted are
// the same concern, and a separate file would be five lines with an import on either side.
function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}


export default function RootLayout() {
  const session = useSession();
  const isLoading = useIsSessionLoading();
  // app.json sets userInterfaceStyle: "automatic", so this follows the OS setting.
  const theme = useColorScheme() === 'dark' ? DarkTheme : LightTheme;

  // hide() is a native side effect, so it cannot live in the render body: app.json sets
  // experiments.reactCompiler, which assumes render is pure and may re-order or re-run it.
  // The hook sits above the early return so hook order stays stable across both branches.
  useEffect(() => {
    if (!isLoading) SplashScreen.hide();
  }, [isLoading]);

  // While the session is `undefined`, `!session` is true — without this the sign-in screen would
  // be the active route during the storage read and flash for an already-signed-in user. The
  // splash is still up, so rendering nothing here is invisible.
  if (isLoading) return null;

  // The two guards are mutually exclusive, so exactly one block is ever active and the stack is
  // never left with no matching route. Nothing in this app calls router.push or router.replace:
  // sign-in and sign-out change the session, and the router moves the user. Changing a guard from
  // true to false also drops that screen's history entries, which is why sign-out cannot be undone
  // with a back gesture.
  //
  // This is UX, not security. expo-router evaluates guards on the client only; Supabase RLS is the
  // real boundary, which is also why shipping the publishable key is safe.
  return (
    // Every screen is built from React Native Paper, so the whole tree needs its theme in context.
    <PaperProvider
      theme={theme}
      // Paper's built-in icon renders through react-native-vector-icons, whose font files nothing
      // here ever loads, so every icon would come out a blank box. renderIcon draws each app icon
      // name as the platform's own symbol — SF Symbols on iOS, Material Symbols on Android — and
      // falls back to MaterialCommunityIcons for Paper's internal names (src/lib/icons.tsx,
      // instruction_mds/visual-language.md §6). Some Paper internals (the Appbar back arrow, Checkbox marks)
      // never reach this function and keep MaterialCommunityIcons.
      //
      // The object literal is new each render; reactCompiler memoizes.
      settings={{ icon: renderIcon }}
    >
      {/* Keyed on the user id, which is what makes "sign out, sign in as someone else" structural
          rather than remembered: the key change remounts the provider, which builds a new client
          and throws the old cache away entirely.

          RLS does not help here. Cached rows are already on the device and render before any
          request goes out, so without this the next account sees the previous one's cards for a
          frame. A queryClient.clear() inside signOut is the version that gets forgotten
          (instruction_mds/data-layer.md §6). */}
      <QueryProvider key={session?.user.id}>
        {/* contentStyle carries the theme background to the navigator's own screen container,
            which otherwise paints react-navigation's default and flashes white in dark mode. */}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        >
          <Stack.Protected guard={!session}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
          <Stack.Protected guard={!!session}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
        </Stack>
      </QueryProvider>
    </PaperProvider>
  );
}
