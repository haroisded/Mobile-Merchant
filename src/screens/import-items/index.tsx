import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { sendOnce } from '../../components/adaptive-dialog';
import { Button } from '../../components/button';
import { PageForm } from '../../components/form-footer';
import { HelperText } from '../../components/helper-text';
import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { BoxRow, RowBox } from '../../components/row-box';
import { SectionHeading } from '../../components/section-heading';
import { Text } from '../../components/text';
import { useBrandsQuery } from '../../features/brands/queries';
import { useItemGroupsQuery } from '../../features/item-groups/queries';
import { ITEM_CSV_MAX_ROWS, itemsTemplate, readItemsCsv } from '../../features/items/csv';
import type { ItemCsvFile, ItemCsvLookups, ItemCsvRow } from '../../features/items/csv';
import { useImportItemsMutation, useItemsQuery } from '../../features/items/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useSellingSettingsQuery } from '../../features/selling-settings/queries';
import { useStockSettingsQuery } from '../../features/stock-settings/queries';
import { useUomsQuery } from '../../features/uoms/queries';
import { FORM_MEASURE, useBottomInset, useShellWide } from '../../lib/columns';
import { failureMessage, itemRefusal, mutationNotice, postgrestError } from '../../lib/errors';
import type { Notice } from '../../lib/errors';
import { PickerUnavailableError, pickTextFile, saveTextFile } from '../../lib/files';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';

// ponytail: a mistake list or a log is drawn whole, so it stops here and says so. A FlashList once someone
// needs to scroll all 500.
const SHOWN = 100;

// What a button says when it could not do its job: the phone's picker never opened (src/lib/files.ts), or the
// screen's own words for anything else.
const pickFailure = (cause: unknown, otherwise: string): Notice => ({
  type: 'error',
  text: cause instanceof PickerUnavailableError ? "The phone's file picker didn't open. Close the app completely, open it again, and try once more." : otherwise,
});

const counted = (count: number, noun: string) => `${count} ${count === 1 ? noun : `${noun}s`}`;

// A row that brings a price with it, and one that brings stock.
const priced = (row: ItemCsvRow) => Number(row.item.standard_rate) > 0;
const stocked = (row: ItemCsvRow) => Number(row.item.opening_stock) > 0;

/** A chosen file: what it holds, under its name. */
type ReadFile = ItemCsvFile & { name: string };

/**
 * Import Items (POS-System-Added-Features.md 23.1; docs.frappe.io/erpnext/data-import): new items from a CSV
 * file — save the template, fill it in, choose it, read every mistake by row and column before anything is
 * saved, then import and read what was created. A page of the Stock stack —
 * src/app/(app)/systems/[id]/stock/import-items.tsx — for whoever may create an Item.
 */
export function ImportItems({ merchant }: { merchant: Merchant }) {
  const { lookups, mayCreate, waiting } = useImportRecords(merchant.id);

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Stock" title="Import Items" meta="Add many items at once from a CSV file" onBack={() => router.back()} form />
      {lookups ? <Importer merchantId={merchant.id} lookups={lookups} mayCreate={mayCreate} /> : null}
      {!lookups && waiting ? (
        <View style={styles.state}>
          <QueryState query={waiting} offline="You're offline. Import Items will load when you reconnect." failure="Couldn't load Import Items. Try again." />
        </View>
      ) : null}
    </View>
  );
}

/**
 * What a file's names are looked up in, and what the importer's settings and roles allow — cache hits once
 * Stock and Setup have been browsed. `waiting` is the first of them still on its way, standing for the page:
 * offline, loading, or failed with a retry.
 */
function useImportRecords(merchantId: string) {
  const items = useItemsQuery({ merchantId });
  const groups = useItemGroupsQuery({ merchantId });
  const uoms = useUomsQuery({ merchantId });
  const brands = useBrandsQuery({ merchantId });
  const stockSettings = useStockSettingsQuery({ merchantId });
  const sellingSettings = useSellingSettingsQuery({ merchantId });
  const permissions = usePermissions({ merchantId });
  const waiting = [items, groups, uoms, brands, stockSettings, sellingSettings, permissions].find((query) => query.data === undefined);

  if (!items.data || !groups.data || !uoms.data || !brands.data || !stockSettings.data || !sellingSettings.data || !permissions.data) {
    return { lookups: null, mayCreate: false, waiting };
  }

  const lookups: ItemCsvLookups = {
    // ponytail: the items list stops at PostgREST's 1,000 rows (useItemsQuery). A code past it is still
    // refused, by the database, with its row.
    itemCodes: items.data.map((item) => item.item_code),
    groups: groups.data,
    uoms: uoms.data,
    brands: brands.data,
    codeFromSeries: stockSettings.data.item_naming_by === 'Naming Series',
    defaultGroup: stockSettings.data.item_group,
    defaultUom: stockSettings.data.stock_uom,
    hasWarehouse: stockSettings.data.default_warehouse !== null,
    hasPriceList: sellingSettings.data.default_price_list !== null,
    mayPrice: can(permissions.data, 'Item Price', 'create'),
    // The opening stock is a Stock Reconciliation saved and submitted as the importer.
    mayStock: can(permissions.data, 'Stock Reconciliation', 'create') && can(permissions.data, 'Stock Reconciliation', 'submit'),
  };

  return { lookups, mayCreate: can(permissions.data, 'Item', 'create'), waiting };
}

// What each column takes, as the template's own headings name them.
const columnRules = (lookups: ItemCsvLookups) => [
  {
    title: 'Item Code',
    sub: lookups.codeFromSeries ? 'Not read: Stock Settings numbers items by the Item series.' : 'Required. A code no item has yet, once in the file.',
  },
  { title: 'Item Name', sub: 'Blank: the code.' },
  { title: 'Item Group · Default Unit of Measure', sub: "The name exactly as in Setup. Blank: Stock Settings' default." },
  { title: 'Description', sub: 'Up to 1,000 characters.' },
  { title: 'Brand', sub: 'The name exactly as in Setup, or blank.' },
  { title: 'Disabled · Maintain Stock', sub: 'yes or no. Blank: not disabled, and stock is kept.' },
  { title: 'Standard Selling Rate', sub: "Becomes the item's price in Selling Settings' Default Price List." },
  {
    title: 'Opening Stock · Valuation Rate',
    sub: "What is on hand, and what each one cost. It goes in Stock Settings' Default Warehouse. A blank Valuation Rate is the Standard Selling Rate.",
  },
];

// What stopped an import: the row the database named, by its number in the file, and why. Every row or none,
// so each ending says nothing was saved.
function importFailure(error: Error | null, rows: ItemCsvRow[]) {
  const cause = postgrestError(error);
  // query_canceled: the one statement ran into the role's time limit.
  if (cause?.code === '57014') return 'The file took too long to import, so nothing was saved. Split it into smaller files and try again.';
  // public.import_items' hint: 'row 3' — the third row sent — or 'opening stock'.
  const row = rows[Number(/^row (\d+)$/.exec(cause?.hint ?? '')?.[1]) - 1]?.row;
  const where = row ? `Row ${row}: ` : cause?.hint === 'opening stock' ? 'Opening stock: ' : '';
  const why = itemRefusal(error) ?? (cause?.code === '42501' ? "You don't have permission for this." : null);
  if (why) return `${where}${why} Nothing was imported.`;
  return failureMessage(row ? `Row ${row} couldn't be saved, so nothing was imported. Check it and try again.` : "Couldn't import the file, so nothing was saved. Try again.");
}

function Importer({ merchantId, lookups, mayCreate }: { merchantId: string; lookups: ItemCsvLookups; mayCreate: boolean }) {
  const run = useImportItemsMutation({ merchantId });
  const [file, setFile] = useState<ReadFile | null>(null);
  // The log draws from the write's answer; the file it came from is done with.
  const send = sendOnce(run, () => setFile(null));

  if (run.data) return <ImportLog merchantId={merchantId} created={run.data} sent={run.variables ?? []} onAnother={() => run.reset()} />;

  const ready = file !== null && file.errors.length === 0 && file.rows.length > 0;

  return (
    <PageForm
      editable={mayCreate}
      readOnly="Importing needs Item create."
      notice={mutationNotice(run, importFailure(run.error, file?.rows ?? []))}
      mutation={run}
      // Import stays greyed out until a file is chosen and nothing is wrong with it.
      dirty={ready}
      onSave={() => send(file?.rows ?? [])}
      saveLabel={ready ? `Import ${counted(file.rows.length, 'Item')}` : 'Import'}
    >
      <Text variant="bodyMedium">
        {`Save the template, fill in a row for each item in a spreadsheet app, save it as comma-separated (CSV), then choose it here. Up to ${ITEM_CSV_MAX_ROWS} items a file. Nothing is imported until every row is right.`}
      </Text>
      {/* The actions before the rules: on a phone the rules fill the screen, and the buttons are the page. */}
      <FileActions
        chosen={file !== null}
        // Once a file is ready, Import below is the page's one filled button.
        filled={!ready}
        locked={run.isPending}
        mayCreate={mayCreate}
        onPicked={(name, text) => {
          // A refusal on screen was the last file's.
          run.reset();
          setFile({ name, ...readItemsCsv(text, lookups) });
        }}
      />
      {file ? <FileCheck file={file} /> : null}
      <SectionHeading title="The columns" hint="What each one takes, by the template's headings" />
      <RowBox empty="">
        {columnRules(lookups).map((rule, index) => (
          <BoxRow key={rule.title} first={index === 0} title={rule.title} sub={rule.sub} />
        ))}
      </RowBox>
    </PageForm>
  );
}

type FileActionsProps = {
  /** A file is already on the page: the button offers another. */
  chosen: boolean;
  filled: boolean;
  /** An import is on its way: neither button works. */
  locked: boolean;
  mayCreate: boolean;
  onPicked: (name: string, text: string) => void;
};

/** Download Template and Choose File, and the line under them for what either has to say that is not a file. */
function FileActions({ chosen, filled, locked, mayCreate, onPicked }: FileActionsProps) {
  const wide = useShellWide();
  const [note, setNote] = useState<Notice | null>(null);

  const download = async () => {
    setNote(null);
    try {
      const name = await saveTextFile('items-template.csv', 'text/csv', itemsTemplate());
      if (name) setNote({ type: 'info', text: `Saved ${name} there. Fill it in with a spreadsheet app, save it as CSV, then choose it here.` });
    } catch (cause) {
      setNote(pickFailure(cause, "Couldn't save the template in that folder. Pick another, such as Documents."));
    }
  };

  const choose = async () => {
    setNote(null);
    try {
      const picked = await pickTextFile();
      if (picked) onPicked(picked.name, picked.text);
    } catch (cause) {
      setNote(pickFailure(cause, "Couldn't read that file. Choose a CSV file saved from the template."));
    }
  };

  return (
    <>
      <View style={wide ? styles.actionsWide : styles.actions}>
        <Button mode="outlined" onPress={download} disabled={locked} contentStyle={styles.leading}>
          Download Template
        </Button>
        <Button mode={filled ? 'contained' : 'outlined'} onPress={choose} disabled={!mayCreate || locked} contentStyle={styles.leading}>
          {chosen ? 'Choose Another File' : 'Choose File'}
        </Button>
      </View>
      {note ? (
        <HelperText type={note.type} padding="none">
          {note.text}
        </HelperText>
      ) : null}
    </>
  );
}

/** What a chosen file holds: its mistakes by row and column, or how many items are ready. */
function FileCheck({ file }: { file: ReadFile }) {
  const { colors } = useAppTheme();

  if (file.errors.length > 0) {
    return (
      <>
        <View style={styles.summary}>
          <Text variant="titleMedium" style={{ color: colors.error }}>
            {`${counted(file.errors.length, 'mistake')} in ${file.name}`}
          </Text>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
            Nothing was imported. Correct the file, save it, and choose it again.
          </Text>
        </View>
        <RowBox empty="">
          {file.errors.slice(0, SHOWN).map((error, index) => (
            <BoxRow
              key={`${error.row}:${error.column}`}
              first={index === 0}
              title={error.row === 0 ? 'The file' : error.column ? `Row ${error.row} · ${error.column}` : `Row ${error.row}`}
              sub={error.message}
              plain
            />
          ))}
        </RowBox>
        <Cut total={file.errors.length} rest="Correct these and choose the file again for the rest." />
      </>
    );
  }
  if (file.rows.length === 0) return <Text variant="bodyMedium">{`${file.name} has no items. Fill in a row under the headings, save it, and choose it again.`}</Text>;


  return (
    <View style={[styles.card, { borderColor: colors.outlineVariant }]}>
      <Text variant="titleMedium">{`${counted(file.rows.length, 'item')} ready in ${file.name}`}</Text>
      <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
        {`${file.rows.filter(priced).length} with a price · ${file.rows.filter(stocked).length} with opening stock. Nothing is saved until you tap Import.`}
      </Text>
    </View>
  );
}

type ImportLogProps = {
  merchantId: string;
  created: { item_code: string; item_name: string }[];
  /** The rows that were sent: what else the import wrote is theirs to say. */
  sent: ItemCsvRow[];
  onAnother: () => void;
};

/** What an import created, in the file's order, and where to go next. */
function ImportLog({ merchantId, created, sent, onAnother }: ImportLogProps) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const bottom = useBottomInset();

  return (
    <ScrollView contentContainerStyle={[styles.body, { paddingBottom: spacing.md + bottom }]}>
      <View style={styles.summary}>
        <Text variant="titleMedium">{`Imported ${counted(created.length, 'item')}`}</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {`They are in Items now.${sent.some(priced) ? ' Their prices are in Item Prices.' : ''}${sent.some(stocked) ? ' Their opening stock is one submitted Stock Reconciliation.' : ''}`}
        </Text>
      </View>
      <RowBox empty="">
        {created.slice(0, SHOWN).map((item, index) => (
          <BoxRow key={item.item_code} first={index === 0} title={item.item_code} sub={item.item_name} />
        ))}
      </RowBox>
      <Cut total={created.length} rest="Items has them all." />
      <View style={wide ? styles.actionsWide : styles.actions}>
        <Button mode="outlined" onPress={onAnother} contentStyle={styles.leading}>
          Import Another File
        </Button>
        {/* Replaces this page, so Back from Items is Stock, not a log already read. */}
        <Button mode="contained" onPress={() => router.replace({ pathname: '/systems/[id]/stock/items', params: { id: merchantId } })} contentStyle={styles.leading}>
          Go to Items
        </Button>
      </View>
    </ScrollView>
  );
}

/** The line under a list that stopped at SHOWN rows. */
function Cut({ total, rest }: { total: number; rest: string }) {
  const { colors } = useAppTheme();

  return total > SHOWN ? (
    <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
      {`Showing the first ${SHOWN} of ${total}. ${rest}`}
    </Text>
  ) : null;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  // The log's page, at PageForm's measure: left-aligned, never a row across a tablet
  // (.claude/instruction_mds/frontend.md rule 18).
  body: { gap: spacing.ms, padding: spacing.md, width: '100%', maxWidth: FORM_MEASURE },
  // Narrow: full-width buttons, one under another, labels at the left. Wide: content width, in a wrapping row.
  actions: { gap: spacing.sm },
  actionsWide: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  leading: { justifyContent: 'flex-start' },
  summary: { gap: spacing.xs },
  card: { gap: spacing.xs, padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous' },
});
