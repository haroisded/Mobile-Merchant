import { View } from 'react-native';

import { useBottomInset } from '../lib/columns';

/**
 * The end of a scroll kept clear of the system navigation bar: the Android build is edge-to-edge, so its last rows
 * would sit under a 3-button bar. A view the bottom inset's height after the content, so the page that scrolls reads
 * no inset of its own.
 */
export function BottomSpacer() {
  const height = useBottomInset();

  return <View style={{ height }} />;
}
