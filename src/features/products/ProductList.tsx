import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Checkbox,
  DataTable,
  HelperText,
  IconButton,
  Menu,
  Switch,
  Text,
  TextInput,
  TouchableRipple,
} from 'react-native-paper';

import { PageHeader } from '../../components/PageHeader';
import { useShellWide } from '../../lib/columns';
import { failureMessage, postgrestError } from '../../lib/errors';
import { formatMoney } from '../../lib/money';
import { useAppTheme } from '../../lib/theme';
import { topLevel, useCategoriesQuery } from '../categories/queries';
import { ArchiveProductDialog } from './ArchiveProductDialog';
import { LowStockBadge, StatusText, Thumbnail, TypeBadge, availabilityLabel } from './badges';
import { useProductsQuery, useSetProductStatusMutation } from './queries';
import type { ProductListRow, ProductSort } from './queries';
import { STATUS_META, TYPE_META, productStatus, productType } from './schema';
import type { ProductStatus, ProductType } from './schema';

type Props = {
  merchantId: string;
  merchantName: string;
  currency: string;
};

const TYPE_FILTERS: { value: ProductType | ''; label: string }[] = [
  { value: '', label: 'All' },
  ...productType.options.map((type) => ({ value: type, label: TYPE_META[type].badge })),
];
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

export function ProductList({ merchantId, merchantName, currency }: Props) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const categories = useCategoriesQuery({ merchantId });
  const setStatus = useSetProductStatusMutation();

  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [type, setType] = useState<ProductType | ''>('');
  const [status, setStatusFilter] = useState<ProductStatus | 'all'>('all');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [sort, setSort] = useState<ProductSort>('name');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // The rows awaiting archive-or-delete, held here and not in a row: FlashList recycles its cells.
  const [archiving, setArchiving] = useState<{ id: string; name: string }[] | null>(null);

  // A request per pause in typing, not per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchDraft), 300);
    return () => clearTimeout(timer);
  }, [searchDraft]);

  const products = useProductsQuery({
    merchantId,
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
  const openDetail = (id: string) =>
    router.push({ pathname: '/systems/[id]/products/[productId]', params: { id: merchantId, productId: id } });
  const openEdit = (id: string) =>
    router.push({ pathname: '/systems/[id]/products/[productId]/edit', params: { id: merchantId, productId: id } });

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
      <FilterMenu label="Type" value={type} options={TYPE_FILTERS} onChange={setType} />
      <FilterMenu label="Status" value={status} options={STATUS_FILTERS} onChange={setStatusFilter} />
      <FilterMenu label="Sort" value={sort} options={SORTS} onChange={setSort} />
      <View style={styles.switchRow}>
        <Switch value={lowStockOnly} onValueChange={setLowStockOnly} color={colors.accent} accessibilityLabel="Low stock only" />
        <Text variant="bodyMedium">Low stock</Text>
      </View>
    </>
  );

  const empty = (
    <View style={styles.state}>
      {/* Paused before pending: a queued query is pending the whole time it waits (docs/data-layer.md §5). */}
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
          <Text variant="bodyMedium">No products yet.</Text>
          <Button mode="contained" icon="plus" onPress={() => router.push({ pathname: '/systems/[id]/products/new', params: { id: merchantId } })}>
            Add product
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
        title="Products"
        meta={products.data ? `${rows.length} ${rows.length === 1 ? 'product' : 'products'}${filtered ? ' shown' : ''}` : undefined}
        actions={
          <>
            <Button
              mode="outlined"
              icon="settings"
              onPress={() => router.push({ pathname: '/systems/[id]/products/setup', params: { id: merchantId } })}
            >
              Setup
            </Button>
            <Button
              mode="contained"
              icon="plus"
              onPress={() => router.push({ pathname: '/systems/[id]/products/new', params: { id: merchantId } })}
            >
              Add product
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
            right={searchDraft !== '' ? <TextInput.Icon icon="x" onPress={() => setSearchDraft('')} accessibilityLabel="Clear search" /> : undefined}
            style={styles.fill}
          />
          {wide ? null : (
            <IconButton
              icon="sliders"
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
          <IconButton icon="x" size={18} onPress={() => setSelected(new Set())} accessibilityLabel="Clear selection" style={styles.bulkClear} />
          <Text variant="labelLarge" style={styles.bulkCount}>{`${selectedRows.length} selected`}</Text>
          <Button compact onPress={() => bulkStatus('active')} disabled={setStatus.isPending}>
            Activate
          </Button>
          <Button compact onPress={() => bulkStatus('inactive')} disabled={setStatus.isPending}>
            Deactivate
          </Button>
          <Button compact onPress={() => setArchiving(selectedRows.map((row) => ({ id: row.id, name: row.name })))}>
            Archive
          </Button>
          <Button
            compact
            textColor={colors.error}
            onPress={() => setArchiving(selectedRows.map((row) => ({ id: row.id, name: row.name })))}
          >
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
                onArchive={() => setArchiving([{ id: item.id, name: item.name }])}
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

      {archiving ? (
        <ArchiveProductDialog
          products={archiving}
          onDismiss={() => setArchiving(null)}
          onDone={() => {
            setArchiving(null);
            setSelected(new Set());
          }}
        />
      ) : null}
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
      {/* DataTable.Title sets no variant of its own (docs/visual-language.md §5, Wide list). */}
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

function TableRow({ item, currency, selected, onToggle, onOpen, onEdit, onArchive }: RowProps & { onEdit: () => void; onArchive: () => void }) {
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
        <IconButton icon="edit-2" size={18} onPress={onEdit} accessibilityLabel={`Edit ${item.name}`} />
        <IconButton icon="trash-2" size={18} iconColor={colors.error} onPress={onArchive} accessibilityLabel={`Archive or delete ${item.name}`} />
      </View>
    </DataTable.Row>
  );
}

function CardRow({ item, currency, selecting, selected, onToggle, onOpen }: RowProps & { selecting: boolean }) {
  const { colors } = useAppTheme();

  return (
    <TouchableRipple
      // Long-press starts selecting; while anything is selected, a tap toggles instead of opening.
      onPress={selecting ? onToggle : onOpen}
      onLongPress={onToggle}
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
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  toolbar: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trailingIcon: { flexDirection: 'row-reverse' },
  bulkBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  bulkClear: { margin: 0 },
  bulkCount: { marginRight: 8 },
  bulkNotice: { paddingHorizontal: 16 },
  state: { gap: 12, alignItems: 'flex-start', padding: 16 },
  tableRow: { borderBottomWidth: 1, minHeight: 60 },
  checkCell: { width: 44, justifyContent: 'center' },
  thumbCell: { width: 48, justifyContent: 'center' },
  nameCell: { flex: 3, justifyContent: 'center', paddingRight: 12 },
  categoryCell: { flex: 2, justifyContent: 'center', paddingRight: 12 },
  typeCell: { flex: 1.3, justifyContent: 'center' },
  stockCell: { flex: 1.4, justifyContent: 'center' },
  priceCell: { flex: 1.3, justifyContent: 'center' },
  statusCell: { flex: 1, justifyContent: 'center' },
  actionsCell: { width: 96 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  cardRow: { borderBottomWidth: 1 },
  cardInner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  cardText: { flex: 1, gap: 3 },
  cardBadges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 2 },
  cardAmount: { alignItems: 'flex-end', gap: 3 },
});
