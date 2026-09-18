import { PlaceholderScreen } from '../../../components/placeholder-screen';

// A stub. The Notifications destination is not ticked in Interactives ( Priority ).md, but a tab bar
// cannot render a tab that does not switch to something — so the destination exists and lands here
// rather than the bar carrying a dead item.
export default function Notifications() {
  return <PlaceholderScreen title="Notifications" />;
}
