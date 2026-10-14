import { NotificationsScreen } from '../../../screens/notifications';

// The signed-in person's notifications. A route file only reads its params and renders a screen
// (.claude/instruction_mds/structure.md rule 4).
export default function Notifications() {
  return <NotificationsScreen />;
}
