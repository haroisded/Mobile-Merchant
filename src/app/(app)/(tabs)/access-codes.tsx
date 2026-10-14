import { AccessCodesScreen } from '../../../screens/access-codes';

// The owner's codes, the requests they bring, and the people let in. A route file only reads its params and renders a
// screen (.claude/instruction_mds/structure.md rule 4); the pane is a param so a notification can open Requests.
export default function AccessCodes() {
  return <AccessCodesScreen />;
}
