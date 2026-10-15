import { recognizeText } from '@infinitered/react-native-mlkit-text-recognition';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { BarcodeScanningResult, BarcodeType, PermissionResponse } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { Appbar } from '../../components/appbar';
import { Button } from '../../components/button';
import { FormFooter } from '../../components/form-footer';
import { Text } from '../../components/text';
import { noSightings, sighted } from '../../lib/barcode';
import { useShellWide } from '../../lib/columns';
import type { Notice } from '../../lib/errors';
import { PickerUnavailableError, pickImage } from '../../lib/files';
import type { LabelLine } from '../../Store/scan';
import { useScanRequest } from '../../Store/scan';
import { spacing } from '../../themes';

// The product barcodes: EAN-13 / UPC-A on almost every packaged good, their short forms, and Code 128 for a
// shop's own printed labels. QR is left out — it carries links, not products.
const BARCODES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'];

const HINTS = {
  item: { type: 'info', text: 'Point at the barcode, then read the label.' },
  register: { type: 'info', text: 'Point at a barcode to add it to the cart.' },
} satisfies Record<'item' | 'register', Notice>;

// Full width narrow, label at the left edge; hugging their labels wide (.claude/instruction_mds/frontend.md §5).
const useButtonWidth = () => ({ style: useShellWide() ? styles.hug : undefined, contentStyle: styles.leading });

/**
 * The product scan (ARCHITECTURE.md, Product scan), on the full-screen route src/app/(app)/scan.tsx. The screen
 * that opened it left a request in src/Store/scan.ts. Barcodes are read live: expo-camera's scanner, which is
 * Google ML Kit on Android. A label is read from one picture, on Read Label or Choose Photo, by ML Kit's text
 * recognizer (@infinitered/react-native-mlkit-text-recognition). Both run on the phone: no network, no cost.
 */
export function Scan({ onDismiss }: { onDismiss: () => void }) {
  const request = useScanRequest();
  const button = useButtonWidth();
  const [permission, requestPermission, getPermission] = useCameraPermissions({ request: true });
  const camera = useRef<CameraView>(null);
  const seen = useRef(noSightings());
  const [notice, setNotice] = useState<Notice | null>(null);

  // Back from Settings with the camera allowed: the hook asks only when it mounts.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') getPermission();
    });
    return () => subscription.remove();
  }, [getPermission]);

  // Only reachable through openScan(), which always leaves a request first.
  if (!request) return null;
  const allowed = permission?.granted === true;

  const scanned = ({ data }: BarcodeScanningResult) => {
    if (sighted(seen.current, data, Date.now(), request.mode === 'register')) setNotice(request.onBarcode(data));
  };

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={onDismiss} />
        <Appbar.Content title={request.title} />
      </Appbar.Header>
      <View style={styles.view}>
        {allowed ? (
          <CameraView ref={camera} style={styles.view} facing="back" barcodeScannerSettings={{ barcodeTypes: BARCODES }} onBarcodeScanned={scanned} />
        ) : (
          <CameraAccess permission={permission} onAsk={requestPermission} />
        )}
      </View>
      <FormFooter notice={notice ?? HINTS[request.mode]}>
        {request.onLabel ? <LabelButtons camera={camera} allowed={allowed} onLabel={request.onLabel} onNotice={setNotice} onDone={onDismiss} /> : null}
        <Button {...button} mode={request.mode === 'item' ? 'text' : 'contained'} onPress={onDismiss}>
          Done
        </Button>
      </FormFooter>
    </>
  );
}

/** Where the camera would be while it may not be used: asking, the ask, or the way to Settings once refused for good. */
function CameraAccess({ permission, onAsk }: { permission: PermissionResponse | null; onAsk: () => void }) {
  if (!permission) {
    return (
      <View style={styles.state}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <View style={styles.state}>
      <Text variant="bodyMedium">
        {permission.canAskAgain ? 'The camera reads the barcode on a product.' : "The camera is off for Mobile Merchant. Turn it on in the phone's Settings, under Permissions."}
      </Text>
      <Button mode="contained" onPress={permission.canAskAgain ? onAsk : () => Linking.openSettings()}>
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
  onLabel: (lines: LabelLine[]) => boolean;
  onNotice: (notice: Notice) => void;
  onDone: () => void;
};

/** Read Label (a picture from the camera) and Choose Photo (one from the phone): its print goes to the form, which closes the scan. */
function LabelButtons({ camera, allowed, onLabel, onNotice, onDone }: LabelButtonsProps) {
  const button = useButtonWidth();
  const [reading, setReading] = useState(false);

  const read = async (picture: () => Promise<string | null | undefined>) => {
    setReading(true);
    try {
      const uri = await picture();
      if (!uri) return;
      // Nothing the form can use keeps the scan open: a blurred picture, or the emulator's black one with a time stamp.
      if (onLabel(await labelLines(uri))) onDone();
      else onNotice({ type: 'error', text: 'No print found. Hold the label closer, in good light.' });
    } catch (cause) {
      onNotice(readFailure(cause));
    } finally {
      setReading(false);
    }
  };

  return (
    <>
      <Button
        {...button}
        mode="contained"
        icon="camera"
        disabled={!allowed || reading}
        loading={reading}
        onPress={() => read(async () => (await camera.current?.takePictureAsync({ quality: 0.8, shutterSound: false }))?.uri)}
      >
        Read Label
      </Button>
      <Button {...button} mode="outlined" disabled={reading} onPress={() => read(pickImage)}>
        Choose Photo
      </Button>
    </>
  );
}

const styles = StyleSheet.create({
  view: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  hug: { alignSelf: 'flex-start' },
  leading: { justifyContent: 'flex-start' },
});
