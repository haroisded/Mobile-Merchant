import { zodResolver } from '@hookform/resolvers/zod';
import { router, useNavigation } from 'expo-router';
import { StackActions, usePreventRemove } from 'expo-router/react-navigation';
import type { NavigationAction } from 'expo-router/react-navigation';
import { useEffect, useState } from 'react';
import { FormProvider, useForm, useFormState, useWatch } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, IconButton, ProgressBar, SegmentedButtons, Text, TouchableRipple } from 'react-native-paper';

import { AdaptiveDialog } from '../../components/AdaptiveDialog';
import { PageHeader } from '../../components/PageHeader';
import { SECTION_LIST, useShellWide } from '../../lib/columns';
import { failureMessage } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { useUnsavedGuard } from '../../lib/unsaved-guard';
import { AdvancedSection } from './form/AdvancedSection';
import { AvailabilitySection } from './form/AvailabilitySection';
import { SectionHeading } from './form/fields';
import { GeneralSection } from './form/GeneralSection';
import { InventorySection } from './form/InventorySection';
import { MediaSection } from './form/MediaSection';
import { PricingSection } from './form/PricingSection';
import { RecipeSection } from './form/RecipeSection';
import { VariantsSection } from './form/VariantsSection';
import { saveFailure, useSaveProductMutation } from './queries';
import type { ProductDetail } from './queries';
import {
  FIELD_SECTION,
  SECTIONS_BY_TYPE,
  SECTION_META,
  TYPE_META,
  emptyProductForm,
  fromProductDetail,
  productFormSchema,
} from './schema';
import type { ProductFormValues, ProductType, SectionId } from './schema';

type Props = {
  merchantId: string;
  currency: string;
  /** The saved product when editing; null when creating. Mounted only once it has loaded, so the
   * form's defaultValues are right on the first render and no reset() is needed. */
  product: ProductDetail | null;
};

// Two rows of two on a narrow form: SegmentedButtons does not wrap, so the four types are two
// controls sharing one value (docs/visual-language.md §5, "the options wrap to two per row on narrow").
const TYPE_ROWS: ProductType[][] = [
  ['stock', 'rental'],
  ['bookable', 'flat'],
];

/** What a blocked exit was about to do: a removal from the Products stack, or a rail switch. */
type Leave = { kind: 'remove'; action: NavigationAction } | { kind: 'rail'; proceed: () => void };

export function ProductForm({ merchantId, currency, product }: Props) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const navigation = useNavigation();
  const save = useSaveProductMutation({ merchantId });

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: product ? fromProductDetail(product) : emptyProductForm('stock'),
    mode: 'onTouched',
  });
  // useFormState rather than form.formState: it returns a new object when a flag changes, which is
  // what a compiled component needs to see the change.
  const { isDirty, errors } = useFormState({ control: form.control });
  const type = useWatch({ control: form.control, name: 'type' });

  const sections = SECTIONS_BY_TYPE[type];
  const [sectionId, setSectionId] = useState<SectionId>('general');
  const index = Math.max(
    0,
    sections.findIndex((entry) => entry.id === sectionId)
  );
  const current = sections[index] ?? sections[0];

  const failedFields = new Set(Object.keys(errors));
  const failedSections = new Set<SectionId>(
    Object.entries(FIELD_SECTION)
      .filter(([field]) => failedFields.has(field))
      .map(([, section]) => section)
  );

  // The unsaved-changes guard. Two ways out need it: removing this screen from the Products stack
  // (hardware back, the header's arrow), which beforeRemove catches; and switching rail destination,
  // which removes nothing — the stack stays mounted — so it reaches the form only through the shell's
  // guard ref (src/lib/unsaved-guard.ts). Both hold what they were about to do until the merchant
  // decides.
  const [blocked, setBlocked] = useState<Leave | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  // Set by Discard on a rail switch, so the guards are off in the render that pops the form.
  const [leaving, setLeaving] = useState<Leave | null>(null);
  const guarded = isDirty && savedId === null && leaving === null;
  usePreventRemove(guarded, ({ data }) => setBlocked({ kind: 'remove', action: data.action }));

  const leaveGuard = useUnsavedGuard();
  useEffect(() => {
    if (!guarded) return;
    leaveGuard.current = (proceed) => setBlocked({ kind: 'rail', proceed });
    return () => {
      leaveGuard.current = null;
    };
  }, [guarded, leaveGuard]);

  // Leaves after the render in which savedId switched the guard off, never in the same tick as the
  // save — the guard would still be armed and would catch its own navigation. Keyed on `editing`, not
  // `product`: the refetch after a save hands the form a new `product` object, and an effect keyed on
  // it ran a second time — two router.back() calls, landing on the list instead of the detail.
  const editing = product !== null;
  useEffect(() => {
    if (savedId === null) return;
    if (editing) router.back();
    else router.replace({ pathname: '/systems/[id]/products/[productId]', params: { id: merchantId, productId: savedId } });
  }, [savedId, editing, merchantId]);

  // Discard on a rail switch: the Products stack goes back to its list, then the tapped destination
  // opens, so coming back to Products shows the list rather than the abandoned form.
  useEffect(() => {
    if (leaving?.kind !== 'rail') return;
    navigation.dispatch(StackActions.popToTop());
    leaving.proceed();
  }, [leaving, navigation]);

  const [invalid, setInvalid] = useState(false);

  const submit = (intent: 'draft' | 'publish') => {
    const status = form.getValues('status');
    // Save as Draft always saves a draft. Publish keeps a chosen Active or Inactive and turns a draft
    // Active — and that is what switches the schema's publish-only rules on.
    form.setValue('status', intent === 'draft' ? 'draft' : status === 'draft' ? 'active' : status, { shouldDirty: true });

    void form.handleSubmit(
      (values) => {
        setInvalid(false);
        save.mutate({ values, productId: product?.id ?? null }, { onSuccess: (id) => setSavedId(id) });
      },
      (fieldErrors) => {
        setInvalid(true);
        // Open the first section, in the order the merchant sees them, that holds an error.
        const failed = new Set(Object.keys(fieldErrors));
        const first = sections.find((entry) =>
          Object.entries(FIELD_SECTION).some(([field, section]) => section === entry.id && failed.has(field))
        );
        if (first) setSectionId(first.id);
      }
    )();
  };

  const changeType = (next: ProductType) => {
    form.setValue('type', next, { shouldDirty: true });
    // A section the new type does not have (Inventory, after switching to Flat) falls back to General.
    if (!SECTIONS_BY_TYPE[next].some((entry) => entry.id === sectionId)) setSectionId('general');
  };

  const failure = saveFailure(save.error);
  const notice = save.isPaused
    ? { type: 'info' as const, text: 'Waiting for a connection. The product saves on its own when you reconnect.' }
    : save.isError
      ? {
          type: 'error' as const,
          text:
            failure === 'sku'
              ? 'Another product already uses this SKU. Change it, or auto-generate a new one.'
              : failure === 'cycle'
                ? 'One of the components already contains this product, so the bundle would contain itself.'
                : failure === 'variant'
                  ? 'Two variants have the same combination. Remove the repeated attribute value.'
                  : failureMessage("Couldn't save this product. Try again."),
        }
      : invalid && failedFields.size > 0
        ? { type: 'error' as const, text: 'Some fields need attention before this can be saved.' }
        : null;

  const saving = save.isPending && !save.isPaused;
  const draftButton = (
    <Button mode="outlined" onPress={() => submit('draft')} disabled={saving} style={wide ? undefined : styles.fill}>
      Save as Draft
    </Button>
  );
  const publishButton = (
    <Button mode="contained" onPress={() => submit('publish')} loading={saving} disabled={saving} style={wide ? undefined : styles.fill}>
      Publish
    </Button>
  );

  const body = (
    <>
      <SectionHeading title={SECTION_META[current.id].name} hint={SECTION_META[current.id].hint} />
      {current.id === 'general' ? <GeneralSection merchantId={merchantId} /> : null}
      {current.id === 'pricing' ? <PricingSection merchantId={merchantId} currency={currency} /> : null}
      {current.id === 'inventory' ? <InventorySection merchantId={merchantId} /> : null}
      {current.id === 'availability' ? <AvailabilitySection /> : null}
      {current.id === 'variants' ? <VariantsSection currency={currency} /> : null}
      {current.id === 'recipe' ? (
        <RecipeSection merchantId={merchantId} currency={currency} productId={product?.id ?? null} />
      ) : null}
      {current.id === 'media' ? <MediaSection /> : null}
      {current.id === 'advanced' ? <AdvancedSection /> : null}
    </>
  );

  return (
    <FormProvider {...form}>
      <View style={styles.fill}>
        <PageHeader
          kicker={product ? 'Edit product' : 'New product'}
          title={product ? product.name : 'Add a product'}
          meta="Unsaved changes are guarded on exit"
          onBack={() => router.back()}
          actions={
            wide ? (
              <>
                {draftButton}
                {publishButton}
              </>
            ) : undefined
          }
        />

        <View style={styles.typeBlock}>
          {wide ? (
            <SegmentedButtons
              value={type}
              onValueChange={changeType}
              buttons={TYPE_ROWS.flat().map((option) => ({ value: option, label: TYPE_META[option].label }))}
            />
          ) : (
            TYPE_ROWS.map((row) => (
              <SegmentedButtons
                key={row.join()}
                value={type}
                onValueChange={changeType}
                density="small"
                buttons={row.map((option) => ({ value: option, label: TYPE_META[option].badge }))}
              />
            ))
          )}
          <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
            {TYPE_META[type].hint}
          </Text>
          {wide && notice ? (
            <HelperText type={notice.type} padding="none">
              {notice.text}
            </HelperText>
          ) : null}
        </View>

        {wide ? (
          <View style={[styles.split, { borderTopColor: colors.outlineVariant }]}>
            <ScrollView style={[styles.sectionList, { borderRightColor: colors.outlineVariant }]}>
              {sections.map((entry, position) => {
                const active = entry.id === current.id;
                return (
                  <TouchableRipple
                    key={entry.id}
                    onPress={() => setSectionId(entry.id)}
                    accessibilityRole="button"
                    accessibilityLabel={SECTION_META[entry.id].name}
                    accessibilityState={{ selected: active }}
                    // The 3px bar is a border on every row, transparent when inactive, so selecting a
                    // row never shifts its text (the rail item does the same).
                    style={[styles.sectionRow, active && { backgroundColor: colors.surfaceMuted, borderLeftColor: colors.accent }]}
                  >
                    <View style={styles.sectionRowInner}>
                      <Text variant="labelMedium" style={{ color: colors.onSurfaceFaint }}>
                        {String(position + 1).padStart(2, '0')}
                      </Text>
                      <Text
                        variant={active ? 'titleMedium' : 'bodyMedium'}
                        style={[styles.fill, failedSections.has(entry.id) && { color: colors.error }]}
                        numberOfLines={1}
                      >
                        {SECTION_META[entry.id].name}
                      </Text>
                      {entry.optional ? (
                        <Text variant="labelMedium" style={{ color: colors.onSurfaceFaint }}>
                          Opt
                        </Text>
                      ) : null}
                    </View>
                  </TouchableRipple>
                );
              })}
            </ScrollView>
            <ScrollView key={current.id} style={styles.fill} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              {body}
            </ScrollView>
          </View>
        ) : (
          <>
            <View style={styles.stepper}>
              <View style={styles.stepperRow}>
                <IconButton
                  icon="chevron-left"
                  disabled={index === 0}
                  onPress={() => setSectionId(sections[index - 1]?.id ?? 'general')}
                  accessibilityLabel="Previous section"
                  style={styles.stepBack}
                />
                <View style={styles.fill}>
                  <Text variant="labelMedium" style={{ color: colors.onSurfaceMuted }}>
                    {`Step ${index + 1} of ${sections.length}${current.optional ? ' · Optional' : ''}`}
                  </Text>
                  <Text variant="titleMedium" style={failedSections.has(current.id) ? { color: colors.error } : undefined}>
                    {SECTION_META[current.id].name}
                  </Text>
                </View>
              </View>
              <ProgressBar progress={(index + 1) / sections.length} color={colors.accent} />
            </View>
            <ScrollView key={current.id} style={styles.fill} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              {body}
            </ScrollView>
            <View style={[styles.footer, { borderTopColor: colors.outlineVariant, backgroundColor: colors.surface }]}>
              {notice ? (
                <HelperText type={notice.type} padding="none">
                  {notice.text}
                </HelperText>
              ) : null}
              <View style={styles.footerRow}>
                {draftButton}
                {index < sections.length - 1 ? (
                  <Button
                    mode="contained"
                    icon="chevron-right"
                    contentStyle={styles.trailingIcon}
                    onPress={() => setSectionId(sections[index + 1]?.id ?? current.id)}
                    style={styles.fill}
                  >
                    Next
                  </Button>
                ) : (
                  publishButton
                )}
              </View>
            </View>
          </>
        )}
      </View>

      {blocked ? (
        <AdaptiveDialog
          wide={wide}
          onDismiss={() => setBlocked(null)}
          kicker="Unsaved changes"
          kickerTone="error"
          title="Discard your changes?"
          actions={
            <>
              <Button mode="outlined" onPress={() => setBlocked(null)} contentStyle={styles.dialogAction}>
                Keep editing
              </Button>
              <Button
                mode="contained"
                buttonColor={colors.error}
                textColor={colors.onError}
                contentStyle={styles.dialogAction}
                onPress={() => {
                  const leave = blocked;
                  setBlocked(null);
                  if (leave.kind === 'remove') navigation.dispatch(leave.action);
                  // A rail switch pops the form in an effect, after the render that turns the guards off.
                  else setLeaving(leave);
                }}
              >
                Discard
              </Button>
            </>
          }
        >
          <Text variant="bodyMedium">What you changed on this product has not been saved and will be lost.</Text>
        </AdaptiveDialog>
      ) : null}
    </FormProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  typeBlock: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  split: { flex: 1, flexDirection: 'row', borderTopWidth: 1 },
  sectionList: { width: SECTION_LIST, flexGrow: 0, borderRightWidth: 1 },
  sectionRow: { borderLeftWidth: 3, borderLeftColor: 'transparent' },
  sectionRowInner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingLeft: 13, paddingRight: 12 },
  content: { gap: 16, padding: 16, paddingBottom: 32 },
  stepper: { gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBack: { margin: 0, marginLeft: -8 },
  footer: { gap: 6, padding: 12, borderTopWidth: 1 },
  footerRow: { flexDirection: 'row', gap: 8 },
  trailingIcon: { flexDirection: 'row-reverse' },
  dialogAction: { justifyContent: 'flex-start' },
});
