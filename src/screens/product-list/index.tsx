import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { useArchiveUndo } from '../../components/archive-undo';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/checkbox';
import { DataTable } from '../../components/data-table';
import { DeleteProductDialog } from '../../components/delete-product-dialog';
import { HelperText } from '../../components/helper-text';
import { IconButton } from '../../components/icon-button';
import { Menu } from '../../components/menu';
import { PageHeader } from '../../components/page-header';
import { LowStockBadge, StatusText, Thumbnail, TypeBadge, availabilityLabel } from '../../components/product-badges';
import { Switch } from '../../components/switch';
import { Text } from '../../components/text';
import { TextInput } from '../../components/text-input';
import { topLevel, useCategoriesQuery } from '../../features/categories/queries';
import { useProductsQuery, useSetProductStatusMutation } from '../../features/products/queries';
import type { ProductListRow, ProductSort } from '../../features/products/queries';
import { RESOURCE_META, RESOURCE_ROUTE } from '../../features/products/resources';
import type { ResourceScope } from '../../features/products/resources';
import { STATUS_META, TYPE_META, productStatus, usesInventory } from '../../features/products/schema';
import type { ProductStatus, ProductType } from '../../features/products/schema';
import { useShellWide } from '../../lib/columns';
import { failureMessage, postgrestError } from '../../lib/errors';
import { formatMoney } from '../../lib/money';
import { useAppTheme } from '../../lib/theme';
import { useSheetResult } from '../../Store/sheet-result';
import { spacing } from '../../themes';

type Props = {
  merchantId: string;
  merchantName: string;
  currency: string;
  /** Which Resources screen this is (src/features/products/resources.ts). */
  scope: ResourceScope;
};

const STATUS_FILTERS: { value: ProductStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All but archived' },
  ...productStatus.options.map((status) => ({ value: status, label: STATUS_META[status].label })),
];
const SORTS: { value: ProductSort; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'price', label: 'Price' },
  { value: 'stock', label: 'Stock' },
  { value: 'created', label: 'Newest' },
];

export function ProductList({ merchantId, merchantName, currency, scope }: Props) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const meta = RESOURCE_META[scope];
  const route = RESOURCE_ROUTE[scope];
  const categories = useCategoriesQuery({ merchantId, scope });
  const setStatus = useSetProductStatusMutation();
  // A screen with one type has nothing to filter by; Rentables has two.
  const typeFilters: { value: ProductType | ''; label: string }[] =
    meta.types.length > 1
      ? [{ value: '', label: 'All' }, ...meta.types.map((type) => ({ value: type, label: TYPE_META[type].badge }))]
      : [];
  const counted = meta.types.some(usesInventory);

  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [type, setType] = useState<ProductType | ''>('');
  const [status, setStatusFilter] = useState<ProductStatus | 'all'>('all');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [sort, setSort] = useState<ProductSort>('name');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // The rows awaiting delete, held here and not in a row: FlashList recycles its cells.
  const [deleting, setDeleting] = useState<{ id: string; name: string }[] | null>(null);
  // Archive writes immediately and offers Undo; only Delete still asks (src/components/archive-undo.tsx).
  const { archive, snackbar } = useArchiveUndo();
  // Narrow, the delete dialog is a formSheet route; its outcome comes back here to clear the selection.
  useSheetResult('delete-product:list', () => setSelected(new Set()));

  const remove = (targets: { id: string; name: string }[]) => {
    if (wide) {
      setDeleting(targets);
      return;
    }
    router.push({
      pathname: '/sheets/delete-product',
      params: { products: JSON.stringify(targets), resultKey: 'delete-product:list' },
    });
  };

  // A request per pause in typing, not per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchDraft), 300);
    return () => clearTimeout(timer);
  }, [searchDraft]);

  const products = useProductsQuery({
    merchantId,
    scope,
    search,
    categoryId: categoryId || null,
    type: type || null,
    status,
    lowStockOnly,
    sort,
  });
  const rows = products.data ?? [];
  const selectedRows = rows.filter((row) => selected.has(row.id));
  const filtered = search !== '' || categoryId !== '' || type !== '' || status !== 'all' || lowStockOnly;

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearFilters = () => {
    setSearchDraft('');
    setCategoryId('');
    setType('');
    setStatusFilter('all');
    setLowStockOnly(false);
  };
  const openDetail = (id: string) => router.push({ pathname: route.detail, params: { id: merchantId, productId: id } });
  const openEdit = (id: string) => router.push({ pathname: route.edit, params: { id: merchantId, productId: id } });

  const bulkStatus = (next: ProductStatus) =>
    setStatus.mutate({ ids: selectedRows.map((row) => row.id), status: next }, { onSuccess: () => setSelected(new Set()) });

  const bulkNotice = setStatus.isPaused
    ? { type: 'info' as const, text: 'Waiting for a connection. This finishes on its own when you reconnect.' }
    : setStatus.isError
      ? {
          type: 'error' as const,
          // products_price_when_sold: a product sold on its own cannot leave draft without a price.
          text:
            postgrestError(setStatus.error)?.code === '23514'
              ? 'A product sold on its own needs a selling price before it can be active.'
              : failureMessage("Couldn't update these products. Try again."),
        }
      : null;

  const filterControls = (
    <>
      <FilterMenu
        label="Category"
        value={categoryId}
        options={[
          { value: '', label: 'All' },
          ...topLevel(categories.data ?? []).map((category) => ({ value: category.id, label: category.name })),
        ]}
        onChange={setCategoryId}
      />
      {typeFilters.length > 0 ? <FilterMenu label="Type" value={type} options={typeFilters} onChange={setType} /> : null}
      <FilterMenu label="Status" value={status} options={STATUS_FILTERS} onChange={setStatusFilter} />
      <FilterMenu
        label="Sort"
        value={sort}
        // Sorting by stock, and filtering to what is running low, only mean something where a count is
        // kept: Inventory and Rentables. A flat service has no quantity.
        options={counted ? SORTS : SORTS.filter((option) => option.value !== 'stock')}
        onChange={setSort}
      />
      {counted ? (
        <View style={styles.switchRow}>
          <Switch value={lowStockOnly} onValueChange={setLowStockOnly} color={colors.accent} accessibilityLabel="Low stock only" />
          <Text variant="bodyMedium">Low stock</Text>
        </View>
      ) : null}
    </>
  );

  const empty = (
    <View style={styles.state}>
      {/* Paused before pending: a queued query is pending the whole time it waits (instruction_mds/data-layer.md §5). */}
      {products.isPaused && !products.data ? (
        <Text variant="bodyMedium">You&apos;re offline. Products will load when you reconnect.</Text>
      ) : products.isPending ? (
        <ActivityIndicator />
      ) : products.isError ? (
        <>
          <Text variant="bodyMedium">{failureMessage("Couldn't load products. Try again.")}</Text>
          <Button onPress={() => products.refetch()}>Try again</Button>
        </>
      ) : filtered ? (
        <>
          <Text variant="bodyMedium">No products match these filters.</Text>
          <Button onPress={clearFilters}>Clear filters</Button>
        </>
      ) : (
        <>
          <Text variant="bodyMedium">{`No ${meta.title.toLowerCase()} yet.`}</Text>
          <Button mode="contained" icon="add" onPress={() => router.push({ pathname: route.new, params: { id: merchantId } })}>
            {`Add ${meta.item}`}
          </Button>
        </>
      )}
    </View>
  );

  const allSelected = rows.length > 0 && selectedRows.length === rows.length;

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker={merchantName}
        title={meta.title}
        meta={
          products.data
            ? `${rows.length} ${rows.length === 1 ? meta.item : `${meta.item}s`}${filtered ? ' shown' : ''}`
            : undefined
        }
        actions={
          <>
            <Button mode="outlined" icon="settings" onPress={() => router.push({ pathname: route.setup, params: { id: merchantId } })}>
              Setup
            </Button>
            <Button mode="contained" icon="add" onPress={() => router.push({ pathname: route.new, params: { id: merchantId } })}>
              {`Add ${meta.item}`}
            </Button>
          </>
        }
      />

      <View style={styles.toolbar}>
        <View style={styles.searchRow}>
          <TextInput
            mode="outlined"
            dense
            value={searchDraft}
            onChangeText={setSearchDraft}
            placeholder="Search name or SKU"
            accessibilityLabel="Search products"
            left={<TextInput.Icon icon="search" />}
            right={searchDraft !== '' ? <TextInput.Icon icon="close" onPress={() => setSearchDraft('')} accessibilityLabel="Clear search" /> : undefined}
            style={styles.fill}
          />
          {wide ? null : (
            <IconButton
              icon="filter"
              mode={filtersOpen ? 'contained' : 'outlined'}
              onPress={() => setFiltersOpen((open) => !open)}
              accessibilityLabel="Filters and sort"
              accessibilityState={{ expanded: filtersOpen }}
            />
          )}
        </View>
        {wide || filtersOpen ? <View style={styles.filters}>{filterControls}</View> : null}
      </View>

      {selectedRows.length > 0 ? (
        <View style={[styles.bulkBar, { backgroundColor: colors.surfaceVariant }]}>
          <IconButton icon="close" size={18} onPress={() => setSelected(new Set())} accessibilityLabel="Clear selection" style={styles.bulkClear} />
          <Text variant="labelLarge" style={styles.bulkCount}>{`${selectedRows.length} selected`}</Text>
          <Button compact onPress={() => bulkStatus('active')} disabled={setStatus.isPending}>
            Activate
          </Button>
          <Button compact onPress={() => bulkStatus('inactive')} disabled={setStatus.isPending}>
            Deactivate
          </Button>
          <Button
            compact
            onPress={() =>
              archive(
                selectedRows.map((row) => ({ id: row.id, name: row.name, status: row.status })),
                () => setSelected(new Set())
              )
            }
          >
            Archive
          </Button>
          <Button compact textColor={colors.error} onPress={() => remove(selectedRows.map((row) => ({ id: row.id, name: row.name })))}>
            Delete
          </Button>
        </View>
      ) : null}
      {bulkNotice ? (
        <HelperText type={bulkNotice.type} style={styles.bulkNotice}>
          {bulkNotice.text}
        </HelperText>
      ) : null}

      {wide ? (
        <DataTable style={styles.fill}>
          <DataTable.Header style={{ borderBottomColor: colors.outlineVariant }}>
            <View style={styles.checkCell}>
              <Checkbox.Android
                status={allSelected ? 'checked' : selectedRows.length > 0 ? 'indeterminate' : 'unchecked'}
                onPress={() => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)))}
                accessibilityLabel="Select all"
              />
            </View>
            <View style={styles.thumbCell} />
            <HeaderTitle label="Product" style={styles.nameCell} />
            <HeaderTitle label="Category" style={styles.categoryCell} />
            <HeaderTitle label="Type" style={styles.typeCell} />
            <HeaderTitle label="Availability" style={styles.stockCell} />
            <HeaderTitle label="Price" style={styles.priceCell} />
            <HeaderTitle label="Status" style={styles.statusCell} />
            <View style={styles.actionsCell} />
          </DataTable.Header>
          <FlashList
            data={rows}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={empty}
            renderItem={({ item }) => (
              <TableRow
                item={item}
                currency={currency}
                selected={selected.has(item.id)}
                onToggle={() => toggle(item.id)}
                onOpen={() => openDetail(item.id)}
                onEdit={() => openEdit(item.id)}
                onArchive={() => archive([{ id: item.id, name: item.name, status: item.status }])}
                onDelete={() => remove([{ id: item.id, name: item.name }])}
              />
            )}
          />
        </DataTable>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={empty}
          renderItem={({ item }) => (
            <CardRow
              item={item}
              currency={currency}
              selecting={selectedRows.length > 0}
              selected={selected.has(item.id)}
              onToggle={() => toggle(item.id)}
              onOpen={() => openDetail(item.id)}
            />
          )}
        />
      )}

      {deleting ? (
        <DeleteProductDialog
          products={deleting}
          onDismiss={() => setDeleting(null)}
          onDone={() => {
            setDeleting(null);
            setSelected(new Set());
          }}
        />
      ) : null}
      {snackbar}
    </View>
  );
}

function FilterMenu<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: { value: Value; label: string }[];
  onChange: (value: Value) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value)?.label ?? '';

  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchor={
        <Button mode="outlined" compact icon="chevron-down" contentStyle={styles.trailingIcon} onPress={() => setOpen(true)}>
          {`${label}: ${current}`}
        </Button>
      }
    >
      {options.map((option) => (
        <Menu.Item
          key={option.value}
          title={option.label}
          leadingIcon={option.value === value ? 'check' : undefined}
          onPress={() => {
            setOpen(false);
            onChange(option.value);
          }}
        />
      ))}
    </Menu>
  );
}

function HeaderTitle({ label, style }: { label: string; style: StyleProp<ViewStyle> }) {
  return (
    <DataTable.Title style={style}>
      {/* DataTable.Title sets no variant of its own (instruction_mds/visual-language.md §5, Wide list). */}
      <Text variant="labelMedium">{label}</Text>
    </DataTable.Title>
  );
}

type RowProps = {
  item: ProductListRow;
  currency: string;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
};

function TableRow({
  item,
  currency,
  selected,
  onToggle,
  onOpen,
  onEdit,
  onArchive,
  onDelete,
}: RowProps & { onEdit: () => void; onArchive: () => void; onDelete: () => void }) {
  const { colors } = useAppTheme();

  return (
    <DataTable.Row onPress={onOpen} style={[styles.tableRow, { borderBottomColor: colors.surfaceVariant }]}>
      <View style={styles.checkCell}>
        <Checkbox.Android status={selected ? 'checked' : 'unchecked'} onPress={onToggle} accessibilityLabel={`Select ${item.name}`} />
      </View>
      <View style={styles.thumbCell}>
        <Thumbnail size={36} />
      </View>
      <View style={styles.nameCell}>
        <Text variant="titleMedium" numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="bodySmall" numberOfLines={1} style={{ color: colors.onSurfaceMuted }}>
          {item.sku ?? 'No SKU'}
        </Text>
      </View>
      <View style={styles.categoryCell}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {item.category?.name ?? '—'}
        </Text>
      </View>
      <View style={styles.typeCell}>
        <TypeBadge type={item.type} />
      </View>
      <View style={styles.stockCell}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {availabilityLabel(item)}
        </Text>
        {item.is_low_stock ? <LowStockBadge /> : null}
      </View>
      <View style={styles.priceCell}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {formatMoney(item.selling_price, currency)}
        </Text>
      </View>
      <View style={styles.statusCell}>
        <StatusText status={item.status} />
      </View>
      <View style={[styles.actionsCell, styles.actions]}>
        <IconButton icon="edit" size={18} onPress={onEdit} accessibilityLabel={`Edit ${item.name}`} />
        {/* Two controls, because they are two different things: archive is reversible, delete is not. */}
        <IconButton icon="archive" size={18} onPress={onArchive} accessibilityLabel={`Archive ${item.name}`} />
        <IconButton icon="delete" size={18} iconColor={colors.error} onPress={onDelete} accessibilityLabel={`Delete ${item.name}`} />
      </View>
    </DataTable.Row>
  );
}

function CardRow({ item, currency, selecting, selected, onToggle, onOpen }: RowProps & { selecting: boolean }) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      // Long-press starts selecting; while anything is selected, a tap toggles instead of opening.
      onPress={selecting ? onToggle : onOpen}
      onLongPress={onToggle}
      // Pressable reads no theme, so the press colour is passed every time (instruction_mds/visual-language.md §5).
      android_ripple={{ color: colors.ripple }}
      accessibilityRole="button"
      accessibilityLabel={item.name}
      accessibilityHint={selecting ? 'Toggles selection' : 'Opens the product. Long press to select.'}
      accessibilityState={{ selected }}
      style={[styles.cardRow, { borderBottomColor: colors.surfaceVariant }, selected && { backgroundColor: colors.surfaceMuted }]}
    >
      <View style={styles.cardInner}>
        {selecting ? (
          <Checkbox.Android status={selected ? 'checked' : 'unchecked'} onPress={onToggle} />
        ) : (
          <Thumbnail size={44} />
        )}
        <View style={styles.cardText}>
          <Text variant="titleMedium" numberOfLines={1}>
            {item.name}
          </Text>
          <Text variant="bodySmall" numberOfLines={1} style={{ color: colors.onSurfaceMuted }}>
            {[item.sku ?? 'No SKU', item.category?.name].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.cardBadges}>
            <TypeBadge type={item.type} />
            <StatusText status={item.status} />
            {item.is_low_stock ? <LowStockBadge /> : null}
          </View>
        </View>
        <View style={styles.cardAmount}>
          <Text variant="titleMedium" numberOfLines={1}>
            {formatMoney(item.selling_price, currency)}
          </Text>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
            {availabilityLabel(item)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  toolbar: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.ms },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trailingIcon: { flexDirection: 'row-reverse' },
  bulkBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  // IconButton ships a 6dp margin of its own; zeroed so the bar's gap is the only spacing.
  bulkClear: { margin: 0 },
  bulkCount: { paddingRight: spacing.sm },
  bulkNotice: { paddingHorizontal: spacing.md },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  tableRow: { borderBottomWidth: 1, minHeight: 60 },
  checkCell: { width: 44, justifyContent: 'center' },
  thumbCell: { width: 48, justifyContent: 'center' },
  nameCell: { flex: 3, justifyContent: 'center', paddingRight: spacing.ms },
  categoryCell: { flex: 2, justifyContent: 'center', paddingRight: spacing.ms },
  typeCell: { flex: 1.3, justifyContent: 'center' },
  stockCell: { flex: 1.4, justifyContent: 'center' },
  priceCell: { flex: 1.3, justifyContent: 'center' },
  statusCell: { flex: 1, justifyContent: 'center' },
  // Three 18dp IconButtons: edit, archive, delete.
  actionsCell: { width: 132 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  cardRow: { borderBottomWidth: 1 },
  cardInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, paddingHorizontal: spacing.md, paddingVertical: spacing.ms },
  cardText: { flex: 1, gap: spacing.xs },
  cardBadges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  cardAmount: { alignItems: 'flex-end', gap: spacing.xs },
});
