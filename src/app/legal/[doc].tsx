import { Redirect, useLocalSearchParams } from 'expo-router';

import { isLegalDoc } from '../../screens/legal/documents';
import { LegalScreen } from '../../screens/legal';

// The Privacy Policy (/legal/privacy) or the Terms of Service (/legal/terms). A route file only reads its params
// and renders a screen (.claude/instruction_mds/structure.md rule 5).
export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  return isLegalDoc(doc) ? <LegalScreen doc={doc} /> : <Redirect href="/" />;
}
