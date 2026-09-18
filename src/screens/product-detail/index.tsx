import { router } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActivityIndicator } from '../../components/activity-indicator';
import { useArchiveUndo } from '../../components/archive-undo';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { DeleteProductDialog } from '../../components/delete-product-dialog';
import { HelperText } from '../../components/helper-text';
import { IconButton } from '../../components/icon-button';
import { PageHeader } from '../../components/page-header';
import { LowStockBadge, Thumbnail, TypeBadge } from '../../components/product-badges';
import { AppText, Text } from '../../components/text';
import { useDuplicateProductMutation, useProductQuery } from '../../features/products/queries';
import type { ProductDetail as Detail } from '../../features/products/queries';
import { RESOURCE_ROUTE } from '../../features/products/resources';
import type { ResourceScope } from '../../features/products/resources';
import {
  CUSTOM_FIELD_KIND_LABELS,
  DURATION_MODE_LABELS,
  RATE_PERIOD_LABELS,
  STATUS_META,
  TYPE_META,
  UNIT_META,
  WEEKDAYS,
  usesAvailability,
  usesInventory,
} from '../../features/products/schema';
import type { MeasureUnit } from '../../features/products/schema';
import { useShellWide } from '../../lib/columns';
import { failureMessage } from '../../lib/errors';
import { formatMoney } from '../../lib/money';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';
import { useSheetResult } from '../../Store/sheet-result';

/**
 * Loads one product and renders its states, then hands the row to `children`. The detail and edit
 * routes both sit behind it, so the edit form mounts only once the product has loaded.
 *
 * A product from another Resources screen reads as not found: an id is a URL anyone can type, and a
 * rental opened under Products would get Products' units and categories in its edit form.
 */
export function ProductGate({
  id,
  scope,
  children,
}: {
  id: string;
  scope: ResourceScope;
  children: (product: Detail) => ReactNode;
}) {
  const product = useProductQuery({ id });

  if (product.data && product.data.scope === scope) return children(product.data);

  return (
    <View style={styles.state}>
      {product.isPaused ? (
        <Text variant="bodyMedium">You&apos;re offline. This product will load when you reconnect.</Text>
      ) : product.isPending ? (
        <ActivityIndicator />
      ) : product.isError ? (
        <>
          <Text variant="bodyMedium">{failureMessage("Couldn't load this product. Try again.")}</Text>
          <Button onPress={() => product.refetch()}>Try again</Button>
        </>
      ) : (
        // Deleted, another merchant's id (RLS returns no row) or another screen's product: all read the same.
        <>
          <Text variant="bodyMedium">This product is no longer available.</Text>
          <Button mode="outlined" onPress={() => router.back()}>
            Back to the list
          </Button>
        </>
      )}
    </View>
  );
}

const unitShort = (unit: MeasureUnit | null) => (unit ? UNIT_META[unit].short : '');
const withUnit = (value: number | null, unit: MeasureUnit | null) =>
  value === null ? null : `${value}${unit ? ` ${unitShort(unit)}` : ''}`;
const yesNo = (value: boolean) => (value ? 'Yes' : 'No');

type Props = {
  merchantId: string;
  currency: string;
  product: Detail;
  /** Which Resources screen this detail belongs to, so Edit and Duplicate push its routes. */
  scope: ResourceScope;
};

export function ProductDetail({ merchantId, currency, product, scope }: Props) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const route = RESOURCE_ROUTE[scope];
  const duplicate = useDuplicateProductMutation({ merchantId });
  const [deleting, setDeleting] = useState(false);
  // Archive writes immediately and offers Undo, so the screen stays: the row is still here, its status
  // is what changed. Only Delete asks, and only Delete leaves.
  const { archive, restore, snackbar } = useArchiveUndo();
  // Narrow, the delete dialog is a formSheet route; its outcome comes back here and the detail leaves.
  useSheetResult('delete-product:detail', () => router.back());

  const remove = () => {
    if (wide) {
      setDeleting(true);
      return;
    }
    router.push({
      pathname: '/sheets/delete-product',
      params: {
        products: JSON.stringify([{ id: product.id, name: product.name }]),
        resultKey: 'delete-product:detail',
      },
    });
  };

  // An archived product offers Restore in Archive's place, never both.
  const archived = product.status === 'archived';
  const target = [{ id: product.id, name: product.name, status: product.status }];
  const toggleArchive = () => (archived ? restore(target) : archive(target));
  const edit = () => router.push({ pathname: route.edit, params: { id: merchantId, productId: product.id } });
  const copy = () =>
    duplicate.mutate(product, {
      onSuccess: (id) => router.push({ pathname: route.edit, params: { id: merchantId, productId: id } }),
    });

  const money = (amount: number | null) => (amount === null ? null : formatMoney(amount, currency));
  const margin =
    product.selling_price && product.cost_price !== null
      ? `${Math.round(((product.selling_price - product.cost_price) / product.selling_price) * 100)}%`
      : null;

  const cards: { key: string; node: ReactNode }[] = [
    {
      key: 'general',
      node: (
        <DetailCard title="General">
          <Row label="Category" value={[product.category?.name, product.subcategory?.name].filter(Boolean).join(' › ')} />
          <Row label="SKU" value={product.sku} />
          <Row label="Barcode" value={product.barcode} />
          <Row label="Tags" value={product.tags.join(', ')} />
          <Row label="Sold directly" value={yesNo(product.sold_directly)} />
          <Row label="Description" value={product.description} />
        </DetailCard>
      ),
    },
    {
      key: 'pricing',
      node: (
        <DetailCard title="Pricing">
          <Row label="Selling price" value={money(product.selling_price)} />
          <Row label="Cost price" value={money(product.cost_price)} />
          <Row label="Margin" value={margin} />
          <Row label="Price per" value={product.pricing_unit ? UNIT_META[product.pricing_unit].label : null} />
          <Row label="Tax class" value={product.tax_class ? `${product.tax_class.name} · ${product.tax_class.rate}%` : 'None'} />
          <Row label="Discounts" value={product.discountable ? 'Can apply' : 'Never apply'} />
          {product.type === 'rental' ? (
            <>
              <Row label="Deposit" value={money(product.deposit_amount)} />
              <Row label="Late fee per hour" value={money(product.late_fee_per_hour)} />
            </>
          ) : null}
          {product.type === 'bookable' ? (
            <>
              <Row label="Cancellation fee" value={money(product.cancellation_fee)} />
              <Row label="Extra unit fee" value={money(product.extra_unit_fee)} />
            </>
          ) : null}
          {product.rate_tiers.map((tier) => (
            <Row
              key={tier.id}
              label={RATE_PERIOD_LABELS[tier.period]}
              value={`${formatMoney(tier.price, currency)}${tier.note ? ` · ${tier.note}` : ''}`}
            />
          ))}
        </DetailCard>
      ),
    },
  ];

  if (usesInventory(product.type)) {
    cards.push({
      key: 'inventory',
      node: (
        <DetailCard title="Inventory">
          <Row label="Unit" value={product.uom ? UNIT_META[product.uom].label : null} />
          <Row label="Tracked" value={yesNo(product.track_inventory)} />
          {product.track_inventory ? (
            <>
              <Row label="On hand" value={withUnit(product.qty_on_hand, product.uom)} />
              <Row label="Reorder at" value={withUnit(product.reorder_threshold, product.uom)} />
              <Row label="Reorder quantity" value={withUnit(product.reorder_qty, product.uom)} />
              <Row label="Maximum" value={withUnit(product.max_stock, product.uom)} />
            </>
          ) : null}
          <Row label="Location" value={product.storage_location} />
          <Row
            label="Supplier"
            value={product.supplier ? [product.supplier.name, product.supplier.contact].filter(Boolean).join(' · ') : null}
          />
          <Row label="Supplier code" value={product.supplier_item_code} />
          <Row label="Lead time" value={product.lead_time_days === null ? null : `${product.lead_time_days} days`} />
          <Row label="Batches" value={yesNo(product.batch_tracking)} />
          <Row label="Perishable" value={yesNo(product.perishable)} />
          {product.perishable ? (
            <>
              <Row label="Shelf life" value={product.shelf_life_days === null ? null : `${product.shelf_life_days} days`} />
              <Row label="Expires" value={product.expiry_date} />
              <Row label="Alert before" value={product.expiry_alert_days === null ? null : `${product.expiry_alert_days} days`} />
            </>
          ) : null}
          {product.conversion_factor !== null ? (
            <Row
              label="Conversion"
              value={`1 ${unitShort(product.purchase_unit) || 'purchase unit'} = ${product.conversion_factor} ${unitShort(product.usage_unit) || 'usage units'}`}
            />
          ) : null}
        </DetailCard>
      ),
    });
  }

  if (usesAvailability(product.type)) {
    cards.push({
      key: 'availability',
      node: (
        <DetailCard title="Availability">
          <Row label="Units" value={product.total_units === null ? null : String(product.total_units)} />
          {product.type === 'bookable' ? (
            <Row label="Capacity per unit" value={product.capacity_per_unit === null ? null : String(product.capacity_per_unit)} />
          ) : null}
          <Row label="Duration" value={product.duration_mode ? DURATION_MODE_LABELS[product.duration_mode] : null} />
          <Row
            label="Default time"
            value={
              product.default_start_time || product.default_end_time
                ? `${product.default_start_time?.slice(0, 5) ?? '—'} to ${product.default_end_time?.slice(0, 5) ?? '—'}`
                : null
            }
          />
          <Row label="Minimum" value={withUnit(product.min_duration, product.min_duration_unit)} />
          <Row label="Maximum" value={withUnit(product.max_duration, product.max_duration_unit)} />
          <Row label="Buffer" value={product.buffer_minutes === null ? null : `${product.buffer_minutes} min`} />
          <Row label="Bookable ahead" value={product.advance_window_days === null ? null : `${product.advance_window_days} days`} />
          <Row
            label="Open"
            value={
              product.operating_hours.length === 0
                ? 'Any time'
                : product.operating_hours
                    .map((hours) => `${WEEKDAYS[hours.weekday] ?? ''} ${hours.opens.slice(0, 5)}–${hours.closes.slice(0, 5)}`)
                    .join('\n')
            }
          />
          <Row label="Closed on" value={product.blackout_dates.join(', ')} />
          {product.type === 'bookable' ? <Row label="Overbooking" value={yesNo(product.overbooking_allowed)} /> : null}
        </DetailCard>
      ),
    });
  }

  if (product.has_variants) {
    cards.push({
      key: 'variants',
      node: (
        <DetailCard title={`Variants · ${product.variants.length}`}>
          {product.variant_attributes.map((attribute) => (
            <Row key={attribute.id} label={attribute.name} value={attribute.values.join(', ')} />
          ))}
          {product.variants.map((variant) => (
            <Row
              key={variant.id}
              label={variant.label}
              value={[
                variant.sku,
                variant.price_delta === 0 ? null : `${variant.price_delta > 0 ? '+' : ''}${formatMoney(variant.price_delta, currency)}`,
                variant.qty_on_hand === null ? null : `${variant.qty_on_hand} on hand`,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ))}
        </DetailCard>
      ),
    });
  }

  if (product.is_composite) {
    const total = product.components.reduce((sum, row) => sum + row.qty * (row.component?.cost_price ?? 0), 0);
    cards.push({
      key: 'components',
      node: (
        <DetailCard title={`Components · ${product.components.length}`}>
          {product.components.map((row) => (
            <Row
              key={row.id}
              label={row.component?.name ?? 'Removed product'}
              value={`× ${withUnit(row.qty, row.unit ?? row.component?.uom ?? null)}${
                row.component?.cost_price != null ? ` · ${formatMoney(row.qty * row.component.cost_price, currency)}` : ''
              }`}
            />
          ))}
          <Row label="Components cost" value={formatMoney(total, currency)} />
        </DetailCard>
      ),
    });
  }

  if (product.custom_fields.length > 0 || product.internal_notes) {
    cards.push({
      key: 'advanced',
      node: (
        <DetailCard title="Advanced">
          {product.custom_fields.map((field) => (
            <Row
              key={field.id}
              label={field.label}
              value={field.kind === 'boolean' ? (field.value === 'true' ? 'Yes' : 'No') : field.value}
              hint={CUSTOM_FIELD_KIND_LABELS[field.kind]}
            />
          ))}
          <Row label="Internal notes" value={product.internal_notes} />
        </DetailCard>
      ),
    });
  }

  const left = cards.filter((_, position) => position % 2 === 0);
  const right = cards.filter((_, position) => position % 2 === 1);

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker={TYPE_META[product.type].label}
        title={product.name}
        onBack={() => router.back()}
        actions={
          wide ? (
            <>
              <Button mode="text" icon="copy" onPress={copy} loading={duplicate.isPending} disabled={duplicate.isPending}>
                Duplicate
              </Button>
              <Button mode="text" icon="delete" textColor={colors.error} onPress={remove}>
                Delete
              </Button>
              <Button mode="outlined" icon={archived ? 'restore' : 'archive'} onPress={toggleArchive}>
                {archived ? 'Restore' : 'Archive'}
              </Button>
              <Button mode="contained" icon="edit" onPress={edit}>
                Edit
              </Button>
            </>
          ) : (
            <>
              <IconButton icon="copy" onPress={copy} disabled={duplicate.isPending} accessibilityLabel="Duplicate" style={styles.headerIcon} />
              <IconButton icon="delete" iconColor={colors.error} onPress={remove} accessibilityLabel="Delete" style={styles.headerIcon} />
            </>
          )
        }
      />

      <ScrollView style={styles.fill} contentContainerStyle={styles.content}>
        <View style={styles.summary}>
          <Thumbnail size={wide ? 72 : 56} />
          <View style={styles.summaryText}>
            <View style={styles.badges}>
              <TypeBadge type={product.type} />
              <View style={[styles.statusBadge, { backgroundColor: colors.primary }]}>
                <Text variant="labelMedium" style={{ color: colors.onPrimary }}>
                  {STATUS_META[product.status].label}
                </Text>
              </View>
              {product.is_low_stock ? <LowStockBadge /> : null}
            </View>
            <AppText variant="amount">{formatMoney(product.selling_price, currency)}</AppText>
          </View>
        </View>

        {duplicate.isError || duplicate.isPaused ? (
          <HelperText type={duplicate.isPaused ? 'info' : 'error'} padding="none">
            {duplicate.isPaused
              ? 'Waiting for a connection. The copy is made when you reconnect.'
              : failureMessage("Couldn't duplicate this product. Try again.")}
          </HelperText>
        ) : null}

        {wide ? (
          <View style={styles.columns}>
            <View style={styles.column}>
              {left.map((card) => (
                <View key={card.key}>{card.node}</View>
              ))}
            </View>
            <View style={styles.column}>
              {right.map((card) => (
                <View key={card.key}>{card.node}</View>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.column}>
            {cards.map((card) => (
              <View key={card.key}>{card.node}</View>
            ))}
          </View>
        )}
      </ScrollView>

      {wide ? null : (
        // SafeAreaView, not View: edge-to-edge draws this bar behind the system navigation bar.
        <SafeAreaView edges={['bottom']} style={[styles.footer, { borderTopColor: colors.outlineVariant, backgroundColor: colors.surface }]}>
          <Button mode="outlined" icon={archived ? 'restore' : 'archive'} onPress={toggleArchive} style={styles.fill}>
            {archived ? 'Restore' : 'Archive'}
          </Button>
          <Button mode="contained" icon="edit" onPress={edit} style={styles.fill}>
            Edit
          </Button>
        </SafeAreaView>
      )}

      {deleting ? (
        <DeleteProductDialog
          products={[{ id: product.id, name: product.name }]}
          onDismiss={() => setDeleting(false)}
          onDone={() => {
            setDeleting(false);
            router.back();
          }}
        />
      ) : null}
      {snackbar}
    </View>
  );
}

function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useAppTheme();

  return (
    <Card mode="outlined">
      {/* The header strip: labelMedium in onPrimary on primary (instruction_mds/visual-language.md §5). */}
      <View style={[styles.strip, { backgroundColor: colors.primary }]}>
        <Text variant="labelMedium" style={{ color: colors.onPrimary }}>
          {title}
        </Text>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </Card>
  );
}

function Row({ label, value, hint }: { label: string; value: string | null | undefined; hint?: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.row, { borderBottomColor: colors.surfaceVariant }]}>
      <Text variant="bodySmall" style={[styles.rowLabel, { color: colors.onSurfaceMuted }]}>
        {hint ? `${label} · ${hint}` : label}
      </Text>
      <Text variant="bodyMedium" style={styles.rowValue}>
        {value === null || value === undefined || value === '' ? '—' : value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  // IconButton ships a 6dp margin of its own; zeroed so the header row's gap is the only spacing.
  headerIcon: { margin: 0 },
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl },
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  summaryText: { flex: 1, gap: spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  statusBadge: {
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  column: { flex: 1, gap: spacing.md },
  // The strip sits inside the outlined Card's rounded corners, so its own top corners follow them.
  strip: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.ms,
    paddingVertical: spacing.sm,
  },
  cardBody: { paddingHorizontal: spacing.ms, paddingVertical: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.ms, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { width: 128 },
  rowValue: { flex: 1 },
  footer: { flexDirection: 'row', gap: spacing.sm, padding: spacing.ms, borderTopWidth: 1 },
});
