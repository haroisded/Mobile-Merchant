import { recognizeText } from '@infinitered/react-native-mlkit-text-recognition';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { BarcodeScanningResult, BarcodeType, PermissionResponse } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { AppState, Linking, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { ActivityIndicator } from '../../components/activity-indicator';
import { Appbar } from '../../components/appbar';
import { Button } from '../../components/button';
import { IconButton } from '../../components/icon-button';
import { Surface } from '../../components/surface';
import { Text } from '../../components/text';
import { noSightings, sighted } from '../../lib/barcode';
import { fontScaled, SCAN_PANEL, useBottomInset, useShellWide } from '../../lib/columns';
import type { Notice } from '../../lib/errors';
import { PickerUnavailableError, pickImage } from '../../lib/files';
import { useAppTheme } from '../../lib/theme';
import type { LabelLine, ScanEntry } from '../../Store/scan';
import { useScanRequest } from '../../Store/scan';
import { radius, spacing } from '../../themes';

// The product barcodes: EAN-13 / UPC-A on almost every packaged good, their short forms, and Code 128 for a
// shop's own printed labels. QR is left out — it carries links, not products.
const BARCODES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'];

const HINTS = {
  item: 'Point at the barcode, then read the label.',
  register: 'Point at a barcode to add it to the cart.',
} satisfies Record<'item' | 'register', string>;

const EMPTY = {
  item: 'No barcode read yet.\nPoint at a barcode, then tap Read Label.',
  register: 'Nothing scanned yet.\nPoint at a barcode to add it to the cart.',
} satisfies Record<'item' | 'register', string>;

// The red line sweeping the viewfinder while a label is read: a linear loop, top to bottom and back.
const SWEEP = { from: { top: '12%' }, to: { top: '88%' } } as const;

type Listed = ScanEntry & { key: number };

const productCount = (count: number) => (count === 1 ? '1 product' : `${count} products`);

/**
 * The product scan (ARCHITECTURE.md, Product scan), on the full-screen route src/app/(app)/scan.tsx. The screen
 * that opened it left a request in src/Store/scan.ts. Barcodes are read live: expo-camera's scanner, which is
 * Google ML Kit on Android. A label is read from one picture, on Read Label or Choose Photo, by ML Kit's text
 * recognizer (@infinitered/react-native-mlkit-text-recognition). Both run on the phone: no network, no cost.
 *
 * Laid out after the human's mockup (visualization/revamp/Merchant · Scan Product.html, 2026-10-23): the camera, its
 * viewfinder and a status pill; beside it on a tablet, under it on a phone, the hint, the label buttons and the
 * Scanned list — what this scan did, each row taken back with its ✕, all of them with Clear.
 */
export function Scan({ onDismiss }: { onDismiss: () => void }) {
  const request = useScanRequest();
  const wide = useShellWide();
  const { colors } = useAppTheme();
  const [permission, requestPermission] = useCameraAccess();
  const camera = useRef<CameraView>(null);
  const seen = useRef(noSightings());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [reading, setReading] = useState(false);
  const scannedList = useScannedList(request?.mode === 'item');

  // Only reachable through openScan(), which always leaves a request first.
  if (!request) return null;
  const allowed = permission?.granted === true;

  const scanned = ({ data }: BarcodeScanningResult) => {
    if (!sighted(seen.current, data, Date.now(), request.mode === 'register')) return;
    const answer = request.onBarcode(data);
    setNotice(answer.notice);
    if (answer.entry) scannedList.add(answer.entry);
  };
  const clear = () => {
    scannedList.clear();
    setNotice(null);
  };

  return (
    <Surface style={styles.fill}>
      <Appbar.Header style={{ borderBottomWidth: 1, borderBottomColor: colors.outlineVariant }}>
        <Appbar.BackAction onPress={onDismiss} />
        <Appbar.Content title={request.title} />
      </Appbar.Header>
      <View style={wide ? styles.row : styles.fill}>
        <View style={[styles.camera, wide ? styles.fill : styles.cameraNarrow, { backgroundColor: colors.primary }]}>
          {allowed ? (
            <>
              <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: BARCODES }} onBarcodeScanned={scanned} />
              <Viewfinder reading={reading} />
              <StatusPill notice={notice} reading={reading} />
            </>
          ) : (
            <CameraAccess permission={permission} onAsk={requestPermission} />
          )}
        </View>
        <View
          style={[
            styles.panel,
            wide
              ? { width: fontScaled(SCAN_PANEL), borderLeftWidth: 1, borderLeftColor: colors.outlineVariant }
              : { flex: 1, borderTopWidth: 1, borderTopColor: colors.outlineVariant },
          ]}
        >
          <View style={styles.panelTop}>
            <Text variant="bodyMedium" style={{ color: colors.onSurfaceMuted }}>
              {HINTS[request.mode]}
            </Text>
            {request.onLabel ? (
              <LabelButtons
                camera={camera}
                allowed={allowed}
                reading={reading}
                onReading={setReading}
                onLabel={request.onLabel}
                onNotice={setNotice}
                onDone={onDismiss}
                side={!wide}
              />
            ) : null}
            <View style={styles.heading}>
              <Text variant="titleMedium">Scanned</Text>
              <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                {productCount(scannedList.entries.length)}
              </Text>
            </View>
          </View>
          <ScrollView style={styles.fill} contentContainerStyle={styles.list}>
            <ScannedList entries={scannedList.entries} empty={EMPTY[request.mode]} onRemove={scannedList.remove} />
          </ScrollView>
          <ScanFooter canClear={scannedList.entries.length > 0} onDone={onDismiss} onClear={clear} />
        </View>
      </View>
    </Surface>
  );
}

/** The camera permission, asked for on mounting — and read again on coming back from Settings, where it may now be allowed. */
function useCameraAccess() {
  const [permission, requestPermission, getPermission] = useCameraPermissions({ request: true });

  // The hook asks only when it mounts.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') getPermission();
    });
    return () => subscription.remove();
  }, [getPermission]);

  return [permission, requestPermission] as const;
}

/**
 * The Scanned list: what each barcode did, newest first, each taken back with its ✕ and all of them with Clear.
 * `one`: the Item form reads one product, so a second barcode takes the first one's place.
 */
function useScannedList(one: boolean) {
  const [entries, setEntries] = useState<Listed[]>([]);
  const next = useRef(0);

  return {
    entries,
    add: (entry: ScanEntry) => {
      next.current += 1;
      const key = next.current;
      setEntries((list) => [{ ...entry, key }, ...(one ? [] : list)]);
    },
    remove: (entry: Listed) => {
      entry.undo();
      setEntries((list) => list.filter((other) => other.key !== entry.key));
    },
    clear: () => {
      entries.forEach((entry) => entry.undo());
      setEntries([]);
    },
  };
}

/** The panel's foot: Done, and Clear — which takes every scan back — clear of the system navigation bar. */
function ScanFooter({ canClear, onDone, onClear }: { canClear: boolean; onDone: () => void; onClear: () => void }) {
  const { colors } = useAppTheme();
  const bottom = useBottomInset();

  return (
    <View style={[styles.footer, { borderTopColor: colors.outlineVariant, paddingBottom: spacing.sm + bottom }]}>
      <Button mode="text" onPress={onDone}>
        Done
      </Button>
      <Button mode="text" textColor={colors.error} disabled={!canClear} onPress={onClear}>
        Clear
      </Button>
    </View>
  );
}

/** At the camera's foot: what the scan is doing, or what the last barcode did — an error in the accent. */
function StatusPill({ notice, reading }: { notice: Notice | null; reading: boolean }) {
  const { colors } = useAppTheme();
  const failed = notice?.type === 'error' && !reading;

  return (
    <View style={[styles.pill, { backgroundColor: colors.backdrop }]} accessibilityLiveRegion="polite">
      <Text variant="bodySmall" numberOfLines={2} style={{ color: failed ? colors.accent : colors.onPrimary }}>
        {reading ? 'Reading label…' : (notice?.text ?? 'Ready to scan')}
      </Text>
    </View>
  );
}

/** What this scan did, newest first, each row with its ✕ — or a dashed box saying what will show here. */
function ScannedList({ entries, empty, onRemove }: { entries: Listed[]; empty: string; onRemove: (entry: Listed) => void }) {
  const { colors } = useAppTheme();

  if (entries.length === 0) {
    return (
      <View style={[styles.empty, { borderColor: colors.outlineVariant }]}>
        <Text variant="bodyMedium" style={{ color: colors.onSurfaceMuted }}>
          {empty}
        </Text>
      </View>
    );
  }

  return entries.map((entry) => (
    <View key={entry.key} style={[styles.entry, { borderBottomColor: colors.outlineVariant }]}>
      <View style={styles.fill}>
        <Text variant="titleSmall">{entry.title}</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {entry.sub}
        </Text>
      </View>
      <IconButton icon="close" onPress={() => onRemove(entry)} accessibilityLabel={`Remove ${entry.title}`} />
    </View>
  ));
}

/** The viewfinder: four corner marks, red while a label is read, with the line sweeping between them. */
function Viewfinder({ reading }: { reading: boolean }) {
  const { colors } = useAppTheme();
  const reduced = useReducedMotion();
  const mark = { borderColor: reading ? colors.accent : colors.onPrimary };

  return (
    <View pointerEvents="none" style={styles.finder}>
      <View style={[styles.corner, styles.topLeft, mark]} />
      <View style={[styles.corner, styles.topRight, mark]} />
      <View style={[styles.corner, styles.bottomLeft, mark]} />
      <View style={[styles.corner, styles.bottomRight, mark]} />
      {reading ? (
        <Animated.View
          style={[
            styles.sweep,
            { backgroundColor: colors.accent },
            // Reduced motion: the line holds still across the middle, still saying a label is being read.
            reduced
              ? styles.sweepStill
              : { animationName: SWEEP, animationDuration: '1s', animationIterationCount: 'infinite', animationDirection: 'alternate', animationTimingFunction: 'linear' },
          ]}
        />
      ) : null}
    </View>
  );
}

/** Where the camera would be while it may not be used: asking, the ask, or the way to Settings once refused for good. */
function CameraAccess({ permission, onAsk }: { permission: PermissionResponse | null; onAsk: () => void }) {
  const { colors } = useAppTheme();
  if (!permission) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={colors.onPrimary} />
      </View>
    );
  }
  return (
    <View style={styles.state}>
      <Text variant="bodyMedium" style={{ color: colors.onPrimary }}>
        {permission.canAskAgain ? 'The camera reads the barcode on a product.' : "The camera is off for Mobile Merchant. Turn it on in the phone's Settings, under Permissions."}
      </Text>
      <Button mode="contained" buttonColor={colors.onPrimary} textColor={colors.primary} onPress={permission.canAskAgain ? onAsk : () => Linking.openSettings()}>
        {permission.canAskAgain ? 'Allow Camera' : 'Open Settings'}
      </Button>
    </View>
  );
}

// The print on one picture, line by line, with how tall each line stood.
const labelLines = async (uri: string): Promise<LabelLine[]> =>
  (await recognizeText(uri)).blocks.flatMap((block) => block.lines.map((line) => ({ text: line.text, height: line.frame.bottom - line.frame.top })));

const readFailure = (cause: unknown): Notice => ({
  type: 'error',
  text: cause instanceof PickerUnavailableError ? "The phone's photo picker didn't open. Close the app completely and open it again." : "Couldn't read the label. Try again.",
});

type LabelButtonsProps = {
  camera: RefObject<CameraView | null>;
  allowed: boolean;
  reading: boolean;
  onReading: (reading: boolean) => void;
  onLabel: (lines: LabelLine[]) => boolean;
  onNotice: (notice: Notice) => void;
  onDone: () => void;
  /** A phone's panel: the two buttons side by side. A tablet's: one under the other. */
  side: boolean;
};

/** Read Label (a picture from the camera) and Choose Photo (one from the phone): its print goes to the form, which closes the scan. */
function LabelButtons({ camera, allowed, reading, onReading, onLabel, onNotice, onDone, side }: LabelButtonsProps) {
  const read = async (picture: () => Promise<string | null | undefined>) => {
    onReading(true);
    try {
      const uri = await picture();
      if (!uri) return;
      // Nothing the form can use keeps the scan open: a blurred picture, or the emulator's black one with a time stamp.
      if (onLabel(await labelLines(uri))) onDone();
      else onNotice({ type: 'error', text: 'No print found. Hold the label closer, in good light.' });
    } catch (cause) {
      onNotice(readFailure(cause));
    } finally {
      onReading(false);
    }
  };

  return (
    <View style={side ? styles.buttonsSide : styles.buttons}>
      <Button
        mode="contained"
        icon="camera"
        style={side ? styles.fill : undefined}
        contentStyle={styles.tall}
        disabled={!allowed || reading}
        loading={reading}
        onPress={() => read(async () => (await camera.current?.takePictureAsync({ quality: 0.8, shutterSound: false }))?.uri)}
      >
        Read Label
      </Button>
      <Button mode="outlined" style={side ? styles.fill : undefined} contentStyle={styles.tall} disabled={reading} onPress={() => read(pickImage)}>
        Choose Photo
      </Button>
    </View>
  );
}

// The viewfinder's corner marks: a size, not spacing.
const MARK = 38;
const MARK_WIDTH = 4;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  camera: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  // A phone: the camera takes the top of the page, the panel the rest.
  cameraNarrow: { height: '42%' },
  finder: { width: '78%', maxWidth: 560, maxHeight: '80%', aspectRatio: 4 / 3 },
  corner: { position: 'absolute', width: MARK, height: MARK, borderRadius: radius.sm, borderCurve: 'continuous' },
  topLeft: { top: 0, left: 0, borderTopWidth: MARK_WIDTH, borderLeftWidth: MARK_WIDTH },
  topRight: { top: 0, right: 0, borderTopWidth: MARK_WIDTH, borderRightWidth: MARK_WIDTH },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: MARK_WIDTH, borderLeftWidth: MARK_WIDTH },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: MARK_WIDTH, borderRightWidth: MARK_WIDTH },
  // Out of flow and childless: its `top` moves nothing else (expo-animation, step 4).
  sweep: { position: 'absolute', left: '4%', right: '4%', height: 2 },
  sweepStill: { top: '50%' },
  pill: { position: 'absolute', bottom: spacing.ml, maxWidth: '90%', borderRadius: radius.xl, borderCurve: 'continuous', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  panel: { gap: spacing.ms, paddingTop: spacing.md },
  panelTop: { gap: spacing.ms, paddingHorizontal: spacing.md },
  buttons: { gap: spacing.sm },
  buttonsSide: { flexDirection: 'row', gap: spacing.sm },
  // The mockup's 52dp buttons: a touch target, not type.
  tall: { minHeight: 52 },
  heading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: spacing.sm },
  list: { flexGrow: 1, paddingHorizontal: spacing.md },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg },
  entry: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, paddingHorizontal: spacing.sm, paddingTop: spacing.xs },
});
