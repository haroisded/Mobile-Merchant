import { Card } from '../../components/card';
import { IconButton } from '../../components/icon-button';
import { List } from '../../components/list';
import { Text } from '../../components/text';
import { useAppTheme } from '../../lib/theme';
import { toggleThemeMode } from '../../Store/StoreTheme';

/**
 * The Preferences block of the Profile screen — one row for now. It sits outside the screen's width
 * branch, so a phone and a tablet get the same card.
 *
 * Its own file rather than inline in index.tsx: the screen is already the longest in `src/screens/`
 * and `node tools/fallow-verdict.mjs` fails it on complexity. A block with no props and no state of
 * its own is the cheapest thing to lift out (instruction_mds/structure.md §6 — it stays in the
 * screen's folder until a second screen wants it).
 */
export function PreferencesCard() {
  // `dark` is the theme that is actually rendering, OS setting or stored choice alike, so the toggle
  // flips what the user can see rather than resolving the preference a second time.
  const { dark } = useAppTheme();

  return (
    <>
      <Text variant="labelMedium">Preferences</Text>
      <Card>
        {/* One row, and a button rather than a switch: the two themes are peers, not on and off.
            A picker belongs here the day a third theme exists, not before. */}
        <List.Item
          title="Themes"
          left={(p) => <List.Icon {...p} icon="themes" />}
          right={() => (
            <IconButton icon="theme-switch" onPress={() => toggleThemeMode(dark ? 'dark' : 'light')} />
          )}
        />
      </Card>
    </>
  );
}
