import { create } from 'zustand';

import type { Notice } from '../lib/errors';

/** One line of print ML Kit read, with its height on the picture — the largest print is the product's name. */
export type LabelLine = { text: string; height: number };

type ScanRequest = {
  title: string;
  /** `register` stays open for the next product; `item` reads one product's barcode and label, then closes. */
  mode: 'item' | 'register';
  /** A barcode the camera read. Answers what the screen says under the camera. */
  onBarcode: (code: string) => Notice;
  /** Item mode: every line of the label, from Read Label or Choose Photo. Answers whether it held anything to use. */
  onLabel?: (lines: LabelLine[]) => boolean;
};

/**
 * The open scan. The camera is a full-screen route (src/app/(app)/scan.tsx), and a route cannot take a callback
 * as a param, so the screen that opens it leaves the request here — as src/Store/picker.ts does for the
 * picker. Client state, nothing fetched (.claude/instruction_mds/data-layer.md rule 9). Each open replaces the
 * last.
 */
const useScanStore = create<{ request: ScanRequest | null }>(() => ({ request: null }));

export const openScan = (request: ScanRequest) => useScanStore.setState({ request });

export const useScanRequest = () => useScanStore((state) => state.request);
