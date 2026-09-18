import { zodResolver } from '@hookform/resolvers/zod';
import { router, useNavigation } from 'expo-router';
import { StackActions, usePreventRemove } from 'expo-router/react-navigation';
import type { NavigationAction } from 'expo-router/react-navigation';
import { useEffect, useState } from 'react';
import { FormProvider, useForm, useFormState, useWatch } from 'react-hook-form';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdaptiveDialog } from '../../components/adaptive-dialog';
import { Button } from '../../components/button';
import { HelperText } from '../../components/helper-text';
import { IconButton } from '../../components/icon-button';
import { PageHeader } from '../../components/page-header';
import { ProgressBar } from '../../components/progress-bar';
import { Snackbar } from '../../components/snackbar';
import { Text } from '../../components/text';
import { useCategoriesQuery } from '../../features/categories/queries';
import { saveFailure, useSaveProductMutation } from '../../features/products/queries';
import type { ProductDetail } from '../../features/products/queries';
import { RESOURCE_META, RESOURCE_ROUTE } from '../../features/products/resources';
import type { ResourceScope } from '../../features/products/resources';
import {
  FIELD_SECTION,
  SECTIONS_BY_TYPE,
  SECTION_META,
  TYPE_META,
  emptyProductForm,
  fromProductDetail,
  productFormSchema,
} from '../../features/products/schema';
import type { ProductFormValues, ProductType, SectionId } from '../../features/products/schema';
import { SECTION_LIST, useShellWide } from '../../lib/columns';
import { failureMessage } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { useUnsavedGuard } from '../../lib/unsaved-guard';
import { spacing } from '../../themes';
import { SectionHeading } from './fields';
import { ReviewSection } from './review-section';
import { AdvancedSection } from './sections/advanced-section';
import { AvailabilitySection } from './sections/availability-section';
import { GeneralSection } from './sections/general-section';
import { InventorySection } from './sections/inventory-section';
import { MediaSection } from './sections/media-section';
import { PricingSection } from './sections/pricing-section';
import { RecipeSection } from './sections/recipe-section';
import { VariantsSection } from './sections/variants-section';

type Props = {
  merchantId: string;
  currency: string;
  /** Which Resources screen this form belongs to (src/features/products/resources.ts). */
  scope: ResourceScope;
  /**
   * The type being created. The screen decides it — Products makes flat services, Inventory makes
   * stock items, and Rentables asks first — and a saved product never changes type, so this is only
   * read when `product` is null.
   */
  type: ProductType;
  /** The saved product when editing; null when creating. Mounted only once it has loaded, so the
   * form's defaultValues are right on the first render and no reset() is needed. */
  product: ProductDetail | null;
};

/** What a blocked exit was about to do: a removal from the stack, or a rail switch. */
type Leave = { kind: 'remove'; action: NavigationAction } | { kind: 'rail'; proceed: () => void };

export function ProductForm({ merchantId, currency, scope, type: newType, product }: Props) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const navigation = useNavigation();
  const meta = RESOURCE_META[scope];
  const route = RESOURCE_ROUTE[scope];
  const save = useSaveProductMutation({ merchantId });

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: product ? fromProductDetail(product) : emptyProductForm(newType),
    mode: 'onTouched',
  });
  // useFormState rather than form.formState: it returns a new object when a flag changes, which is
  // what a compiled component needs to see the change.
  const { isDirty, errors } = useFormState({ control: form.control });
  const [type, categoryId, subcategoryId] = useWatch({
    control: form.control,
    name: ['type', 'categoryId', 'subcategoryId'],
  });

  // Review is the last step of every form (SECTION_META.review), appended here rather than repeated in
  // the per-type table.
  const review = { id: 'review', optional: false } satisfies { id: SectionId; optional: boolean };
  const sections = [...SECTIONS_BY_TYPE[type], review];
  const [sectionId, setSectionId] = useState<SectionId>('general');
  const index = Math.max(
    0,
    sections.findIndex((entry) => entry.id === sectionId)
  );
  const current = sections[index] ?? sections[0];
  const reviewing = current.id === 'review';

  // The category path, which only this screen has the names for; the review summary shows it.
  const categories = useCategoriesQuery({ merchantId, scope });
  const categoryPath = [categoryId, subcategoryId]
    .map((id) => categories.data?.find((category) => category.id === id)?.name)
    .filter(Boolean)
    .join(' › ');

  const failedFields = new Set(Object.keys(errors));
  const failedSections = new Set<SectionId>(
    Object.entries(FIELD_SECTION)
      .filter(([field]) => failedFields.has(field))
      .map(([, section]) => section)
  );

  // The unsaved-changes guard. Two ways out need it: removing this screen from the stack (hardware
  // back, the header's arrow), which beforeRemove catches; and switching rail destination, which
  // removes nothing — the stack stays mounted — so it reaches the form only through the shell's guard
  // ref (src/lib/unsaved-guard.ts). Both hold what they were about to do until the merchant decides.
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
    else router.replace({ pathname: route.detail, params: { id: merchantId, productId: savedId } });
  }, [savedId, editing, merchantId, route.detail]);

  // Discard on a rail switch: the stack goes back to its list, then the tapped destination opens, so
  // coming back to this screen shows the list rather than the abandoned form.
  useEffect(() => {
    if (leaving?.kind !== 'rail') return;
    navigation.dispatch(StackActions.popToTop());
    leaving.proceed();
  }, [leaving, navigation]);

  const [invalid, setInvalid] = useState(false);

  // The Review step's buttons choose the status (see saveActions); "Save changes" passes none and keeps it.
  const submit = (status?: 'draft' | 'active') => {
    if (status) form.setValue('status', status, { shouldDirty: true });
    void form.handleSubmit(
      (values) => {
        setInvalid(false);
        save.mutate({ values, productId: product?.id ?? null }, { onSuccess: (id) => setSavedId(id) });
      },
      (fieldErrors) => {
        setInvalid(true);
        // Open the first section, in the order the merchant sees them, that holds an error. Review
        // itself is skipped: its own field is the status, which cannot be invalid.
        const failed = new Set(Object.keys(fieldErrors));
        const first = sections.find(
          (entry) =>
            entry.id !== 'review' &&
            Object.entries(FIELD_SECTION).some(([field, section]) => section === entry.id && failed.has(field))
        );
        if (first) setSectionId(first.id);
      }
    )();
  };

  const failure = saveFailure(save.error);
  const notice = save.isPaused
    ? { type: 'info' as const, text: `Waiting for a connection. The ${meta.item} saves on its own when you reconnect.` }
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
                  : failureMessage(`Couldn't save this ${meta.item}. Try again.`),
        }
      : invalid && failedFields.size > 0
        ? { type: 'error' as const, text: 'Some fields need attention before this can be saved.' }
        : null;

  const saving = save.isPending && !save.isPaused;
  // The ending, on the Review step only. Every earlier step moves forward instead — a "save" button on
  // every step competed with the real one. The status is chosen by the button rather than a toggle
  // above it: a new product or a draft is saved as active or as a draft; a product already past draft
  // keeps its status (Archive and Restore on the detail change it). Cancel is plain back, so the
  // unsaved-changes guard below still asks before anything is lost.
  // Rejected: Archive on this step — archiving something never saved has no meaning.
  const publishing = product === null || product.status === 'draft';
  const buttonStyle = wide ? undefined : styles.stretch;
  const saveActions = (
    <>
      {wide ? (
        <Button mode="text" onPress={() => router.back()} disabled={saving}>
          Cancel
        </Button>
      ) : null}
      {publishing ? (
        <Button mode="outlined" onPress={() => submit('draft')} disabled={saving} style={buttonStyle}>
          Save as draft
        </Button>
      ) : null}
      <Button
        mode="contained"
        icon="check"
        onPress={() => submit(publishing ? 'active' : undefined)}
        loading={saving}
        disabled={saving}
        style={buttonStyle}
      >
        {publishing ? 'Save as active' : 'Save changes'}
      </Button>
      {wide ? null : (
        <Button mode="text" onPress={() => router.back()} disabled={saving} style={buttonStyle}>
          Cancel
        </Button>
      )}
    </>
  );

  const body = (
    <>
      <SectionHeading title={SECTION_META[current.id].name} hint={SECTION_META[current.id].hint} />
      {current.id === 'general' ? <GeneralSection merchantId={merchantId} scope={scope} /> : null}
      {current.id === 'pricing' ? <PricingSection merchantId={merchantId} currency={currency} units={meta.units} /> : null}
      {current.id === 'inventory' ? <InventorySection merchantId={merchantId} units={meta.units} /> : null}
      {current.id === 'availability' ? <AvailabilitySection /> : null}
      {current.id === 'variants' ? <VariantsSection currency={currency} /> : null}
      {current.id === 'recipe' ? (
        <RecipeSection merchantId={merchantId} currency={currency} productId={product?.id ?? null} />
      ) : null}
      {current.id === 'media' ? <MediaSection /> : null}
      {current.id === 'advanced' ? <AdvancedSection /> : null}
      {current.id === 'review' ? (
        <ReviewSection
          sections={sections.filter((entry) => entry.id !== 'review')}
          currency={currency}
          categoryPath={categoryPath}
          onOpen={setSectionId}
        />
      ) : null}
    </>
  );

  return (
    <FormProvider {...form}>
      <View style={styles.fill}>
        <PageHeader
          kicker={product ? `Edit ${meta.item}` : `New ${meta.item}`}
          title={product ? product.name : `Add a ${meta.item}`}
          meta={TYPE_META[type].label}
          onBack={() => router.back()}
          actions={wide ? saveActions : undefined}
        />

        {wide ? (
          <View style={[styles.split, { borderTopColor: colors.outlineVariant }]}>
            <ScrollView style={[styles.sectionList, { borderRightColor: colors.outlineVariant }]}>
              {sections.map((entry, position) => {
                const active = entry.id === current.id;
                return (
                  <Pressable
                    key={entry.id}
                    onPress={() => setSectionId(entry.id)}
                    // Pressable reads no theme, so the press colour is passed every time (instruction_mds/visual-language.md §5).
                    android_ripple={{ color: colors.ripple }}
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
                  </Pressable>
                );
              })}
            </ScrollView>
            <ScrollView key={current.id} style={styles.fill} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              {notice ? (
                <HelperText type={notice.type} padding="none">
                  {notice.text}
                </HelperText>
              ) : null}
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
            {/* SafeAreaView, not View: the Android build is edge-to-edge
                (android/gradle.properties), so a bar pinned to the bottom draws behind the system
                navigation bar. `additive` adds the inset to styles.footer's own padding. */}
            <SafeAreaView edges={['bottom']} style={[styles.footer, { borderTopColor: colors.outlineVariant, backgroundColor: colors.surface }]}>
              {notice ? (
                <HelperText type={notice.type} padding="none">
                  {notice.text}
                </HelperText>
              ) : null}
              <View style={reviewing ? styles.footerStack : styles.footerRow}>
                {reviewing ? (
                  saveActions
                ) : (
                  <Button
                    mode="contained"
                    icon="chevron-right"
                    contentStyle={styles.trailingIcon}
                    onPress={() => setSectionId(sections[index + 1]?.id ?? current.id)}
                    style={styles.fill}
                  >
                    Next
                  </Button>
                )}
              </View>
            </SafeAreaView>
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
          <Text variant="bodyMedium">{`What you changed on this ${meta.item} has not been saved and will be lost.`}</Text>
        </AdaptiveDialog>
      ) : null}

      {/* The one thing that still happens after a save: another one. The screen is already leaving for
          the detail, so this is the only affordance that needs to survive it. */}
      <Snackbar
        visible={savedId !== null && !editing}
        onDismiss={() => undefined}
        duration={5000}
        action={{
          label: 'Add another',
          onPress: () => router.replace({ pathname: route.new, params: { id: merchantId } }),
        }}
      >
        {`${meta.item.charAt(0).toUpperCase()}${meta.item.slice(1)} saved`}
      </Snackbar>
    </FormProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  split: { flex: 1, flexDirection: 'row', borderTopWidth: 1 },
  sectionList: { width: SECTION_LIST, flexGrow: 0, borderRightWidth: 1 },
  sectionRow: { borderLeftWidth: 3, borderLeftColor: 'transparent' },
  sectionRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.ms,
    paddingVertical: spacing.ms,
    paddingLeft: spacing.ms,
    paddingRight: spacing.ms,
  },
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl },
  stepper: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // IconButton ships a 6dp margin of its own; zeroed so the row's gap is the only spacing.
  stepBack: { margin: 0 },
  footer: { gap: spacing.sm, padding: spacing.ms, borderTopWidth: 1 },
  footerRow: { flexDirection: 'row', gap: spacing.sm },
  // Three full-width buttons on the Review step do not fit a phone-width row, so they stack.
  footerStack: { gap: spacing.sm },
  stretch: { alignSelf: 'stretch' },
  // row-reverse turns Paper's leading icon slot into a trailing one; flex-end is the LEFT edge on a
  // reversed main axis, so a full-width button's label still starts there (instruction_mds/visual-language.md §5).
  trailingIcon: { flexDirection: 'row-reverse', justifyContent: 'flex-end' },
  dialogAction: { justifyContent: 'flex-start' },
});
