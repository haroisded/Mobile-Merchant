import * as z from 'zod';

import { Constants } from '../../lib/database.types';
import type { Enums } from '../../lib/database.types';
import type { ProductDetail } from './queries';

// Form input only. Reads are typed by database.types.ts, never parsed with Zod (docs/data-layer.md §4).
// One schema for the create and edit form, shared with the save mutation through toSavePayload.

export type ProductType = Enums<'product_type'>;
export type ProductStatus = Enums<'product_status'>;
export type MeasureUnit = Enums<'measure_unit'>;
export type RatePeriod = Enums<'rate_period'>;
export type DurationMode = Enums<'duration_mode'>;
export type CustomFieldKind = Enums<'custom_field_kind'>;

// The enum values come from the generated Constants, so adding a value in a migration and regenerating
// is the whole change on this side.
export const productType = z.enum(Constants.public.Enums.product_type);
export const productStatus = z.enum(Constants.public.Enums.product_status);
export const measureUnit = z.enum(Constants.public.Enums.measure_unit);
export const ratePeriod = z.enum(Constants.public.Enums.rate_period);
export const durationMode = z.enum(Constants.public.Enums.duration_mode);
export const customFieldKind = z.enum(Constants.public.Enums.custom_field_kind);

// `satisfies`, not an annotation, so every value keeps its literal type (anti-slop/no-known-value-widening)
// and a missing enum value is still a compile error.
export const TYPE_META = {
  stock: {
    label: 'Stock / Consumable',
    badge: 'Stock',
    skuPrefix: 'STK',
    hint: 'Physical item, deducted permanently when it sells or is used — a shelf item, a kitchen ingredient.',
  },
  rental: {
    label: 'Rental Asset',
    badge: 'Rental',
    skuPrefix: 'RNT',
    hint: 'Physical item, finite quantity, checked out then returned — a bike, a tool, a car.',
  },
  bookable: {
    label: 'Bookable Service',
    badge: 'Bookable',
    skuPrefix: 'BKG',
    hint: 'A time-based capacity slot, not returned — a room-night, a spa slot, a class seat.',
  },
  flat: {
    label: 'Flat Service',
    badge: 'Flat',
    skuPrefix: 'SVC',
    hint: 'No stock and no schedule, just a flat sellable line — a delivery fee, an installation.',
  },
} satisfies Record<ProductType, { label: string; badge: string; skuPrefix: string; hint: string }>;

// The status colours from docs/visual-language.md §4. Archived is not in that table; it reads as
// Inactive, which is what an archived product is from a till's point of view.
export const STATUS_META = {
  draft: { label: 'Draft', tone: 'onSurfaceMuted' },
  active: { label: 'Active', tone: 'onSurface' },
  inactive: { label: 'Inactive', tone: 'onSurfaceFaint' },
  archived: { label: 'Archived', tone: 'onSurfaceFaint' },
} satisfies Record<ProductStatus, { label: string; tone: 'onSurface' | 'onSurfaceMuted' | 'onSurfaceFaint' }>;

export const UNIT_META = {
  piece: { label: 'Piece', short: 'pc' },
  box: { label: 'Box', short: 'box' },
  pack: { label: 'Pack', short: 'pack' },
  kg: { label: 'Kilogram', short: 'kg' },
  g: { label: 'Gram', short: 'g' },
  l: { label: 'Litre', short: 'L' },
  ml: { label: 'Millilitre', short: 'mL' },
  minute: { label: 'Minute', short: 'min' },
  hour: { label: 'Hour', short: 'hr' },
  day: { label: 'Day', short: 'day' },
  week: { label: 'Week', short: 'wk' },
  month: { label: 'Month', short: 'mo' },
  night: { label: 'Night', short: 'night' },
  session: { label: 'Session', short: 'session' },
} satisfies Record<MeasureUnit, { label: string; short: string }>;

export const RATE_PERIOD_LABELS = {
  hour: 'Hourly',
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
  night: 'Nightly',
} satisfies Record<RatePeriod, string>;

export const DURATION_MODE_LABELS = {
  fixed_slot: 'Fixed slot',
  flexible_range: 'Flexible range',
} satisfies Record<DurationMode, string>;

export const CUSTOM_FIELD_KIND_LABELS = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  boolean: 'Yes / No',
} satisfies Record<CustomFieldKind, string>;

/** Index 0 is Sunday, matching Date.getDay() and product_operating_hours.weekday. */
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// ---------------------------------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------------------------------

export type SectionId =
  | 'general'
  | 'pricing'
  | 'inventory'
  | 'availability'
  | 'variants'
  | 'recipe'
  | 'media'
  | 'advanced';

export const SECTION_META = {
  general: { name: 'General', hint: 'Identity, classification and whether it can be sold on its own.' },
  pricing: { name: 'Pricing', hint: 'What it sells for, what it costs, and how that price is expressed.' },
  inventory: { name: 'Inventory', hint: 'Stock on hand, reordering, suppliers and expiry.' },
  availability: { name: 'Availability', hint: 'Capacity and time — units, durations, buffers and blackouts.' },
  variants: { name: 'Variants', hint: 'One product, many sellable combinations.' },
  recipe: { name: 'Recipe / Bundle', hint: 'Composition — several products sold as one line.' },
  media: { name: 'Media', hint: 'Gallery and alt text.' },
  advanced: { name: 'Advanced', hint: 'Anything the default schema does not carry.' },
} satisfies Record<SectionId, { name: string; hint: string }>;

type SectionEntry = { id: SectionId; optional: boolean };

// The tab visibility table from uploads/products-screen-spec.md, section by type.
export const SECTIONS_BY_TYPE = {
  stock: [
    { id: 'general', optional: false },
    { id: 'pricing', optional: false },
    { id: 'inventory', optional: false },
    { id: 'variants', optional: true },
    { id: 'recipe', optional: true },
    { id: 'media', optional: false },
    { id: 'advanced', optional: false },
  ],
  rental: [
    { id: 'general', optional: false },
    { id: 'pricing', optional: false },
    { id: 'inventory', optional: false },
    { id: 'availability', optional: false },
    { id: 'variants', optional: true },
    { id: 'recipe', optional: true },
    { id: 'media', optional: false },
    { id: 'advanced', optional: false },
  ],
  bookable: [
    { id: 'general', optional: false },
    { id: 'pricing', optional: false },
    { id: 'availability', optional: false },
    { id: 'variants', optional: true },
    { id: 'recipe', optional: true },
    { id: 'media', optional: false },
    { id: 'advanced', optional: false },
  ],
  flat: [
    { id: 'general', optional: false },
    { id: 'pricing', optional: false },
    { id: 'recipe', optional: true },
    { id: 'media', optional: false },
    { id: 'advanced', optional: false },
  ],
} satisfies Record<ProductType, SectionEntry[]>;

export const usesInventory = (type: ProductType) => type === 'stock' || type === 'rental';
export const usesAvailability = (type: ProductType) => type === 'rental' || type === 'bookable';
export const usesVariants = (type: ProductType) => type !== 'flat';

// ---------------------------------------------------------------------------------------------------
// Field schemas
// ---------------------------------------------------------------------------------------------------

// Every numeric field is a STRING in the form and becomes a number in toSavePayload. TextInput hands
// back strings, and z.coerce.number() would make z.input differ from z.output — react-hook-form's value
// type would then not be the type the resolver produces, the same reason merchants/schema.ts keeps
// normalizePhone out of the schema. The refinements below keep the strings honest.
const isNumber = (value: string) => value.trim() !== '' && Number.isFinite(Number(value));

const amount = z
  .string()
  .trim()
  .refine((value) => value === '' || (isNumber(value) && Number(value) >= 0), {
    error: 'Enter an amount of 0 or more.',
  });

const signedAmount = z
  .string()
  .trim()
  .refine((value) => value === '' || isNumber(value), { error: 'Enter an amount.' });

const quantity = z
  .string()
  .trim()
  .refine((value) => value === '' || (isNumber(value) && Number(value) >= 0), {
    error: 'Enter a quantity of 0 or more.',
  });

const wholeNumber = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d+$/.test(value), { error: 'Enter a whole number.' });

const unitOrNone = z.union([measureUnit, z.literal('')]);

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Pick a time.' });
const optionalTime = z.union([timeOfDay, z.literal('')]);
const optionalDate = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]);

const rateTierSchema = z.object({
  period: ratePeriod,
  price: amount.refine((value) => value !== '', { error: 'Enter a price.' }),
  note: z.string().trim().max(80, 'Keep the note under 80 characters.'),
});

const operatingHourSchema = z
  .object({ weekday: z.number().int().min(0).max(6), opens: timeOfDay, closes: timeOfDay })
  // "HH:MM" strings compare correctly as strings, so no Date is needed.
  .refine((hours) => hours.opens < hours.closes, { error: 'Closing must be after opening.', path: ['closes'] });

const variantAttributeSchema = z.object({
  name: z.string().trim().min(1, 'Name the attribute.').max(40, 'Keep it under 40 characters.'),
  values: z.array(z.string().trim().min(1)).min(1, 'Add at least one value.'),
});

const variantSchema = z.object({
  label: z.string(),
  options: z.array(z.string()),
  sku: z.string().trim().max(64, 'Keep the SKU under 64 characters.'),
  barcode: z.string().trim().max(64, 'Keep the barcode under 64 characters.'),
  priceDelta: signedAmount,
  qtyOnHand: quantity,
});

const componentSchema = z.object({
  componentId: z.string().min(1, 'Pick a product.'),
  qty: z.string().trim().refine((value) => isNumber(value) && Number(value) > 0, {
    error: 'Enter a quantity above 0.',
  }),
  unit: unitOrNone,
});

const customFieldSchema = z.object({
  label: z.string().trim().min(1, 'Name the field.').max(40, 'Keep it under 40 characters.'),
  kind: customFieldKind,
  value: z.string().trim().max(500, 'Keep it under 500 characters.'),
});

export const productFormSchema = z
  .object({
    // General
    type: productType,
    name: z.string().trim().min(1, 'Enter a product name.').max(120, 'Keep the name under 120 characters.'),
    categoryId: z.string().min(1, 'Pick a category.'),
    subcategoryId: z.string(),
    sku: z.string().trim().max(64, 'Keep the SKU under 64 characters.'),
    barcode: z.string().trim().max(64, 'Keep the barcode under 64 characters.'),
    description: z.string().trim().max(2000, 'Keep the description under 2000 characters.'),
    tags: z.array(z.string()),
    status: productStatus,
    soldDirectly: z.boolean(),

    // Pricing
    sellingPrice: amount,
    costPrice: amount,
    pricingUnit: unitOrNone,
    taxClassId: z.string(),
    discountable: z.boolean(),
    depositAmount: amount,
    lateFeePerHour: amount,
    cancellationFee: amount,
    extraUnitFee: amount,
    rateTiers: z.array(rateTierSchema),

    // Inventory
    uom: unitOrNone,
    trackInventory: z.boolean(),
    qtyOnHand: quantity,
    reorderThreshold: quantity,
    reorderQty: quantity,
    maxStock: quantity,
    storageLocation: z.string().trim().max(120, 'Keep it under 120 characters.'),
    supplierId: z.string(),
    supplierItemCode: z.string().trim().max(64, 'Keep it under 64 characters.'),
    leadTimeDays: wholeNumber,
    batchTracking: z.boolean(),
    perishable: z.boolean(),
    shelfLifeDays: wholeNumber,
    expiryDate: optionalDate,
    expiryAlertDays: wholeNumber,
    purchaseUnit: unitOrNone,
    usageUnit: unitOrNone,
    conversionFactor: amount,

    // Availability
    totalUnits: wholeNumber,
    capacityPerUnit: wholeNumber,
    durationMode: z.union([durationMode, z.literal('')]),
    defaultStartTime: optionalTime,
    defaultEndTime: optionalTime,
    minDuration: amount,
    minDurationUnit: unitOrNone,
    maxDuration: amount,
    maxDurationUnit: unitOrNone,
    bufferMinutes: wholeNumber,
    advanceWindowDays: wholeNumber,
    blackoutDates: z.array(z.string()),
    operatingHours: z.array(operatingHourSchema),
    overbookingAllowed: z.boolean(),

    // Variants
    hasVariants: z.boolean(),
    variantAttributes: z.array(variantAttributeSchema),
    variants: z.array(variantSchema),

    // Recipe / bundle
    isComposite: z.boolean(),
    components: z.array(componentSchema),

    // Advanced
    customFields: z.array(customFieldSchema),
    internalNotes: z.string().trim().max(2000, 'Keep the notes under 2000 characters.'),
  })
  // The rules that depend on another field. A draft may be saved half-filled, so everything a sale
  // needs is required only once the status is not draft — the same line products_price_when_sold
  // draws in the database.
  .superRefine((values, ctx) => {
    const publishing = values.status !== 'draft';
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });

    if (publishing && values.soldDirectly && values.sellingPrice === '') {
      issue(['sellingPrice'], 'Enter a selling price, or turn off "Sold directly".');
    }
    if (publishing && usesInventory(values.type) && values.uom === '') {
      issue(['uom'], 'Pick a unit of measure.');
    }
    if (publishing && usesAvailability(values.type) && values.totalUnits === '') {
      issue(['totalUnits'], 'Enter how many units there are.');
    }
    if (values.conversionFactor !== '' && Number(values.conversionFactor) <= 0) {
      issue(['conversionFactor'], 'Enter a factor above 0.');
    }
    if (values.minDuration !== '' && values.minDurationUnit === '') {
      issue(['minDurationUnit'], 'Pick a unit.');
    }
    if (values.maxDuration !== '' && values.maxDurationUnit === '') {
      issue(['maxDurationUnit'], 'Pick a unit.');
    }
    if (
      values.minDuration !== '' &&
      values.maxDuration !== '' &&
      values.minDurationUnit === values.maxDurationUnit &&
      Number(values.minDuration) > Number(values.maxDuration)
    ) {
      issue(['maxDuration'], 'The maximum must be at least the minimum.');
    }
    if (publishing && values.hasVariants && usesVariants(values.type) && values.variantAttributes.length === 0) {
      issue(['variantAttributes'], 'Add at least one attribute, or turn off variants.');
    }
    if (publishing && values.isComposite && values.components.length === 0) {
      issue(['components'], 'Add at least one component, or turn this off.');
    }
    // product_components_once in the database, reported on the row instead of as a save failure.
    const seen = new Set<string>();
    values.components.forEach((component, index) => {
      if (component.componentId !== '' && seen.has(component.componentId)) {
        issue(['components', index, 'componentId'], 'This product is already in the list.');
      }
      seen.add(component.componentId);
    });
  });

export type ProductFormValues = z.infer<typeof productFormSchema>;

/** Which section a top-level form field lives in, so a failed submit can open the section at fault. */
export const FIELD_SECTION = {
  type: 'general',
  name: 'general',
  categoryId: 'general',
  subcategoryId: 'general',
  sku: 'general',
  barcode: 'general',
  description: 'general',
  tags: 'general',
  status: 'general',
  soldDirectly: 'general',
  sellingPrice: 'pricing',
  costPrice: 'pricing',
  pricingUnit: 'pricing',
  taxClassId: 'pricing',
  discountable: 'pricing',
  depositAmount: 'pricing',
  lateFeePerHour: 'pricing',
  cancellationFee: 'pricing',
  extraUnitFee: 'pricing',
  rateTiers: 'pricing',
  uom: 'inventory',
  trackInventory: 'inventory',
  qtyOnHand: 'inventory',
  reorderThreshold: 'inventory',
  reorderQty: 'inventory',
  maxStock: 'inventory',
  storageLocation: 'inventory',
  supplierId: 'inventory',
  supplierItemCode: 'inventory',
  leadTimeDays: 'inventory',
  batchTracking: 'inventory',
  perishable: 'inventory',
  shelfLifeDays: 'inventory',
  expiryDate: 'inventory',
  expiryAlertDays: 'inventory',
  purchaseUnit: 'inventory',
  usageUnit: 'inventory',
  conversionFactor: 'inventory',
  totalUnits: 'availability',
  capacityPerUnit: 'availability',
  durationMode: 'availability',
  defaultStartTime: 'availability',
  defaultEndTime: 'availability',
  minDuration: 'availability',
  minDurationUnit: 'availability',
  maxDuration: 'availability',
  maxDurationUnit: 'availability',
  bufferMinutes: 'availability',
  advanceWindowDays: 'availability',
  blackoutDates: 'availability',
  operatingHours: 'availability',
  overbookingAllowed: 'availability',
  hasVariants: 'variants',
  variantAttributes: 'variants',
  variants: 'variants',
  isComposite: 'recipe',
  components: 'recipe',
  customFields: 'advanced',
  internalNotes: 'advanced',
} satisfies Record<keyof ProductFormValues, SectionId>;

// ---------------------------------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------------------------------

export function emptyProductForm(type: ProductType): ProductFormValues {
  return {
    type,
    name: '',
    categoryId: '',
    subcategoryId: '',
    sku: '',
    barcode: '',
    description: '',
    tags: [],
    status: 'draft',
    soldDirectly: true,
    sellingPrice: '',
    costPrice: '',
    pricingUnit: '',
    taxClassId: '',
    discountable: true,
    depositAmount: '',
    lateFeePerHour: '',
    cancellationFee: '',
    extraUnitFee: '',
    rateTiers: [],
    uom: '',
    trackInventory: true,
    qtyOnHand: '',
    reorderThreshold: '',
    reorderQty: '',
    maxStock: '',
    storageLocation: '',
    supplierId: '',
    supplierItemCode: '',
    leadTimeDays: '',
    batchTracking: false,
    perishable: false,
    shelfLifeDays: '',
    expiryDate: '',
    expiryAlertDays: '',
    purchaseUnit: '',
    usageUnit: '',
    conversionFactor: '',
    totalUnits: '',
    capacityPerUnit: '',
    durationMode: '',
    defaultStartTime: '',
    defaultEndTime: '',
    minDuration: '',
    minDurationUnit: '',
    maxDuration: '',
    maxDurationUnit: '',
    bufferMinutes: '',
    advanceWindowDays: '',
    blackoutDates: [],
    operatingHours: [],
    overbookingAllowed: false,
    hasVariants: false,
    variantAttributes: [],
    variants: [],
    isComposite: false,
    components: [],
    customFields: [],
    internalNotes: '',
  };
}

const numberOrNull = (value: string) => (value.trim() === '' ? null : Number(value));
const textOrNull = (value: string) => (value.trim() === '' ? null : value.trim());
const unitOrNull = (value: MeasureUnit | '') => (value === '' ? null : value);
const formNumber = (value: number | null) => (value === null ? '' : String(value));
// Postgres `time` reads back as "HH:MM:SS"; the form works in minutes.
const formTime = (value: string | null) => (value === null ? '' : value.slice(0, 5));

/** What public.save_product receives. A type alias, so it is assignable to the generated `Json`. */
export type SavePayload = ReturnType<typeof toSavePayload>;

/**
 * The form, as the rows save_product writes. Columns a type does not use are sent as null, so changing
 * a Rental into a Flat Service also clears its stock and availability rather than leaving them behind.
 */
export function toSavePayload(values: ProductFormValues, target: { merchantId: string; productId: string | null }) {
  const inventory = usesInventory(values.type);
  const availability = usesAvailability(values.type);
  const variants = values.hasVariants && usesVariants(values.type);
  const rateTiers = availability || values.type === 'rental';

  return {
    product: {
      id: target.productId,
      merchant_id: target.merchantId,
      type: values.type,
      name: values.name.trim(),
      category_id: values.categoryId,
      subcategory_id: textOrNull(values.subcategoryId),
      sku: textOrNull(values.sku),
      barcode: textOrNull(values.barcode),
      description: textOrNull(values.description),
      tags: values.tags,
      status: values.status,
      sold_directly: values.soldDirectly,

      selling_price: numberOrNull(values.sellingPrice),
      cost_price: numberOrNull(values.costPrice),
      pricing_unit: unitOrNull(values.pricingUnit),
      tax_class_id: textOrNull(values.taxClassId),
      discountable: values.discountable,
      deposit_amount: values.type === 'rental' ? numberOrNull(values.depositAmount) : null,
      late_fee_per_hour: values.type === 'rental' ? numberOrNull(values.lateFeePerHour) : null,
      cancellation_fee: values.type === 'bookable' ? numberOrNull(values.cancellationFee) : null,
      extra_unit_fee: values.type === 'bookable' ? numberOrNull(values.extraUnitFee) : null,

      uom: inventory ? unitOrNull(values.uom) : null,
      track_inventory: inventory ? values.trackInventory : false,
      qty_on_hand: inventory && values.trackInventory ? numberOrNull(values.qtyOnHand) : null,
      reorder_threshold: inventory && values.trackInventory ? numberOrNull(values.reorderThreshold) : null,
      reorder_qty: inventory && values.trackInventory ? numberOrNull(values.reorderQty) : null,
      max_stock: inventory && values.trackInventory ? numberOrNull(values.maxStock) : null,
      storage_location: inventory ? textOrNull(values.storageLocation) : null,
      supplier_id: inventory ? textOrNull(values.supplierId) : null,
      supplier_item_code: inventory ? textOrNull(values.supplierItemCode) : null,
      lead_time_days: inventory ? numberOrNull(values.leadTimeDays) : null,
      batch_tracking: inventory ? values.batchTracking : false,
      perishable: inventory ? values.perishable : false,
      shelf_life_days: inventory && values.perishable ? numberOrNull(values.shelfLifeDays) : null,
      expiry_date: inventory && values.perishable ? textOrNull(values.expiryDate) : null,
      expiry_alert_days: inventory && values.perishable ? numberOrNull(values.expiryAlertDays) : null,
      purchase_unit: inventory ? unitOrNull(values.purchaseUnit) : null,
      usage_unit: inventory ? unitOrNull(values.usageUnit) : null,
      conversion_factor: inventory ? numberOrNull(values.conversionFactor) : null,

      total_units: availability ? numberOrNull(values.totalUnits) : null,
      capacity_per_unit: availability ? numberOrNull(values.capacityPerUnit) : null,
      duration_mode: availability && values.durationMode !== '' ? values.durationMode : null,
      default_start_time: availability ? textOrNull(values.defaultStartTime) : null,
      default_end_time: availability ? textOrNull(values.defaultEndTime) : null,
      min_duration: availability ? numberOrNull(values.minDuration) : null,
      min_duration_unit: availability ? unitOrNull(values.minDurationUnit) : null,
      max_duration: availability ? numberOrNull(values.maxDuration) : null,
      max_duration_unit: availability ? unitOrNull(values.maxDurationUnit) : null,
      buffer_minutes: availability ? numberOrNull(values.bufferMinutes) : null,
      advance_window_days: availability ? numberOrNull(values.advanceWindowDays) : null,
      blackout_dates: availability ? values.blackoutDates : [],
      overbooking_allowed: availability ? values.overbookingAllowed : false,

      has_variants: variants,
      is_composite: values.isComposite,
      internal_notes: textOrNull(values.internalNotes),
    },
    rate_tiers: rateTiers
      ? values.rateTiers.map((tier) => ({ period: tier.period, price: Number(tier.price), note: textOrNull(tier.note) }))
      : [],
    operating_hours: availability
      ? values.operatingHours.map((hours) => ({ weekday: hours.weekday, opens: hours.opens, closes: hours.closes }))
      : [],
    variant_attributes: variants
      ? values.variantAttributes.map((attribute) => ({ name: attribute.name.trim(), values: attribute.values }))
      : [],
    variants: variants
      ? values.variants.map((variant) => ({
          label: variant.label,
          options: variant.options,
          sku: textOrNull(variant.sku),
          barcode: textOrNull(variant.barcode),
          price_delta: numberOrNull(variant.priceDelta) ?? 0,
          qty_on_hand: numberOrNull(variant.qtyOnHand),
        }))
      : [],
    components: values.isComposite
      ? values.components.map((component) => ({
          component_id: component.componentId,
          qty: Number(component.qty),
          unit: unitOrNull(component.unit),
        }))
      : [],
    custom_fields: values.customFields.map((field) => ({
      label: field.label.trim(),
      kind: field.kind,
      value: textOrNull(field.value),
    })),
  };
}

/** A saved product, as the form edits it. The inverse of toSavePayload. */
export function fromProductDetail(product: ProductDetail): ProductFormValues {
  return {
    type: product.type,
    name: product.name,
    categoryId: product.category_id,
    subcategoryId: product.subcategory_id ?? '',
    sku: product.sku ?? '',
    barcode: product.barcode ?? '',
    description: product.description ?? '',
    tags: product.tags,
    status: product.status,
    soldDirectly: product.sold_directly,
    sellingPrice: formNumber(product.selling_price),
    costPrice: formNumber(product.cost_price),
    pricingUnit: product.pricing_unit ?? '',
    taxClassId: product.tax_class_id ?? '',
    discountable: product.discountable,
    depositAmount: formNumber(product.deposit_amount),
    lateFeePerHour: formNumber(product.late_fee_per_hour),
    cancellationFee: formNumber(product.cancellation_fee),
    extraUnitFee: formNumber(product.extra_unit_fee),
    rateTiers: product.rate_tiers.map((tier) => ({
      period: tier.period,
      price: String(tier.price),
      note: tier.note ?? '',
    })),
    uom: product.uom ?? '',
    trackInventory: product.track_inventory,
    qtyOnHand: formNumber(product.qty_on_hand),
    reorderThreshold: formNumber(product.reorder_threshold),
    reorderQty: formNumber(product.reorder_qty),
    maxStock: formNumber(product.max_stock),
    storageLocation: product.storage_location ?? '',
    supplierId: product.supplier_id ?? '',
    supplierItemCode: product.supplier_item_code ?? '',
    leadTimeDays: formNumber(product.lead_time_days),
    batchTracking: product.batch_tracking,
    perishable: product.perishable,
    shelfLifeDays: formNumber(product.shelf_life_days),
    expiryDate: product.expiry_date ?? '',
    expiryAlertDays: formNumber(product.expiry_alert_days),
    purchaseUnit: product.purchase_unit ?? '',
    usageUnit: product.usage_unit ?? '',
    conversionFactor: formNumber(product.conversion_factor),
    totalUnits: formNumber(product.total_units),
    capacityPerUnit: formNumber(product.capacity_per_unit),
    durationMode: product.duration_mode ?? '',
    defaultStartTime: formTime(product.default_start_time),
    defaultEndTime: formTime(product.default_end_time),
    minDuration: formNumber(product.min_duration),
    minDurationUnit: product.min_duration_unit ?? '',
    maxDuration: formNumber(product.max_duration),
    maxDurationUnit: product.max_duration_unit ?? '',
    bufferMinutes: formNumber(product.buffer_minutes),
    advanceWindowDays: formNumber(product.advance_window_days),
    blackoutDates: product.blackout_dates,
    operatingHours: product.operating_hours.map((hours) => ({
      weekday: hours.weekday,
      opens: formTime(hours.opens),
      closes: formTime(hours.closes),
    })),
    overbookingAllowed: product.overbooking_allowed,
    hasVariants: product.has_variants,
    variantAttributes: product.variant_attributes.map((attribute) => ({
      name: attribute.name,
      values: attribute.values,
    })),
    variants: product.variants.map((variant) => ({
      label: variant.label,
      options: variant.options,
      sku: variant.sku ?? '',
      barcode: variant.barcode ?? '',
      priceDelta: variant.price_delta === 0 ? '' : String(variant.price_delta),
      qtyOnHand: formNumber(variant.qty_on_hand),
    })),
    isComposite: product.is_composite,
    components: product.components.map((component) => ({
      componentId: component.component_id,
      qty: String(component.qty),
      unit: component.unit ?? '',
    })),
    customFields: product.custom_fields.map((field) => ({
      label: field.label,
      kind: field.kind,
      value: field.value ?? '',
    })),
    internalNotes: product.internal_notes ?? '',
  };
}

/**
 * "STK-BEV-4K2Q": type prefix, the category's first three letters, four random base36 characters.
 * No package — products_sku_unique rejects the rare collision, and the form offers to try again.
 */
export function generateSku(type: ProductType, categoryName: string) {
  const letters = categoryName.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase() || 'GEN';
  const random = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0');
  return `${TYPE_META[type].skuPrefix}-${letters}-${random}`;
}

type VariantRow = ProductFormValues['variants'][number];

// ponytail: a product with five attributes of five values is 3125 rows. The cap stops the form from
// rendering that; revisit if a real catalogue ever needs more.
export const VARIANT_MATRIX_CAP = 200;

/**
 * One row per combination of attribute values. A row whose combination survived the edit keeps what was
 * typed into it — only new combinations start blank, and removed ones drop out.
 */
export function buildVariantMatrix(
  attributes: ProductFormValues['variantAttributes'],
  previous: VariantRow[]
): VariantRow[] {
  const filled = attributes.filter((attribute) => attribute.values.length > 0);
  if (filled.length === 0) return [];

  const combinations = filled.reduce<string[][]>(
    (combos, attribute) => combos.flatMap((combo) => attribute.values.map((value) => [...combo, value])),
    [[]]
  );

  return combinations.slice(0, VARIANT_MATRIX_CAP).map((options) => {
    const label = options.join(' · ');
    return (
      previous.find((row) => row.label === label) ?? {
        label,
        options,
        sku: '',
        barcode: '',
        priceDelta: '',
        qtyOnHand: '',
      }
    );
  });
}
