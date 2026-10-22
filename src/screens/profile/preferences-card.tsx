import { Card } from '../../components/card';
import { Divider } from '../../components/divider';
import { List } from '../../components/list';
import { Switch } from '../../components/switch';
import { Text } from '../../components/text';
import { useAppTheme } from '../../lib/theme';
import { toggleThemeMode } from '../../Store/StoreTheme';

/**
 * The Preferences block of the Profile screen. It sits outside the screen's width branch, so a phone and a tablet get
 * the same card.
 *
 * Its own file rather than inline in index.tsx: the screen is already the longest in `src/screens/`
 * and `node tools/fallow-verdict.mjs` fails it on complexity. A block with no props and no state of
 * its own is the cheapest thing to lift out (.claude/instruction_mds/structure.md §6 — it stays in the
 * screen's folder until a second screen wants it).
 */
export function PreferencesCard() {
  // `dark` is the theme that is actually rendering, OS setting or stored choice alike, so the switch
  // shows and flips what the user can see rather than resolving the preference a second time.
  const { dark, colors } = useAppTheme();
  const flip = () => toggleThemeMode(dark ? 'dark' : 'light');

  return (
    <>
      <Text variant="labelMedium">Preferences</Text>
      <Card>
        {/* Dark Mode: on and off, so a switch, the whole row pressable. On is accent (frontend.md §2.3). */}
        <List.Item
          title="Dark Mode"
          onPress={flip}
          accessibilityRole="switch"
          accessibilityState={{ checked: dark }}
          left={(p) => <List.Icon {...p} icon="dark-mode" />}
          right={() => <Switch value={dark} onValueChange={flip} color={colors.accent} />}
        />
        <Divider />
        {/* ponytail: a placeholder for the palettes to come — it renders and does nothing yet. An icon, not a button,
            so the row keeps the other rows' height. Dark Mode above is the appearance choice today. */}
        <List.Item title="Themes" left={(p) => <List.Icon {...p} icon="themes" />} right={(p) => <List.Icon {...p} icon="theme-switch" />} />
      </Card>
    </>
  );
}
