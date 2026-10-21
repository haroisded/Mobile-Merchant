import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdaptiveDialog } from '../../../components/adaptive-dialog';
import { Button } from '../../../components/button';
import { PickChip } from '../../../components/filter-chips';
import { Field, FieldGrid } from '../../../components/form-fields';
import { Icon } from '../../../components/icon';
import { NoteCallout } from '../../../components/note-callout';
import { SampleLine } from '../../../components/sample-box';
import { SectionHeading } from '../../../components/section-heading';
import { RowBox } from '../../../components/row-box';
import { Text } from '../../../components/text';
import { TextInput } from '../../../components/text-input';
import { displayDate } from '../../../lib/dates';
import { useAppTheme } from '../../../lib/theme';
import { radius, spacing } from '../../../themes';
import { SandboxContext, useSandbox } from '../sandbox/context';
import { GuideButton, GuideTarget } from '../sandbox/guide-target';
import {
  addEntryRow,
  addItem,
  addPrice,
  cancelEntry,
  IMPORT_ROWS,
  importItems,
  newEntry,
  newRecon,
  setCount,
  submitEntry,
  submitRecon,
} from '../sandbox-state';
import type { DocStatus, NewItem, StockEntry, Store } from '../sandbox-state';
import { T } from '../tasks';
import { Frame, IndexBoxes, ListRow, peso, ReadOut } from './frame';

// Stock in the practice store: src/screens/stock/, items/, item-prices/, import-items/, stock-entries/,
// stock-reconciliations/, stock-balance/ and stock-ledger/ drawn again over the mock store.

const number = (text: string) => (text.trim() === '' || Number.isNaN(Number(text)) ? null : Number(text));

export function StockIndex() {
  const { holds } = useSandbox();
  const sees = holds('view_stock');
  const items = holds('manage_items');

  return (
    <Frame title="Stock" meta="Items, their prices, and stock coming in and going out">
      <IndexBoxes
        sections={[
          {
            title: 'Items & Pricing',
            rows: [
              { label: 'Items', hint: 'What the store sells', show: sees || items, page: 'items', target: T.stockItems },
              { label: 'Item Prices', hint: "Each item's rate in a price list", show: items, page: 'item-prices', target: T.stockPrices },
              { label: 'Import Items', hint: 'Many items from one spreadsheet file', show: items, page: 'import', target: T.stockImport },
            ],
          },
          {
            title: 'Stock Transactions',
            rows: [
              {
                label: 'Stock Entries',
                hint: 'Deliveries in, stock out, moves between warehouses',
                show: holds('move_stock') || holds('adjust_inventory'),
                page: 'stock-entries',
                target: T.stockEntries,
              },
              { label: 'Stock Reconciliations', hint: 'Opening stock and counts against the books', show: holds('adjust_inventory'), page: 'recons', target: T.stockRecons },
            ],
          },
          {
            title: 'Reports',
            rows: [
              { label: 'Stock Balance', hint: 'What is on hand and what it is worth', show: sees, page: 'stock-balance', target: T.stockBalance },
              { label: 'Stock Ledger', hint: 'Every stock movement behind the balance', show: sees, page: 'stock-ledger' },
            ],
          },
        ]}
      />
    </Frame>
  );
}

export function Items() {
  const { store, go, back, holds, did } = useSandbox();
  const [search, setSearch] = useState('');
  const shown = store.items.filter((item) => `${item.name} ${item.code} ${item.barcode}`.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <Frame
      title="Items"
      meta={`${store.items.length} items`}
      onBack={back}
      actions={
        holds('manage_items') ? (
          <GuideTarget target={T.itemsNew}>
            <Button mode="contained" icon="add" onPress={() => { did(T.itemsNew); go('item'); }}>
              New Item
            </Button>
          </GuideTarget>
        ) : undefined
      }
    >
      <TextInput mode="outlined" dense placeholder="Search by code, name or barcode" value={search} onChangeText={setSearch} left={<TextInput.Icon icon="search" />} />
      <RowBox empty="No item matches the search.">
        {shown.map((item, index) => (
          <ListRow
            key={item.code}
            first={index === 0}
            title={item.name}
            sub={`${item.code} · ${item.group} · ${item.stock} on hand`}
            figure={peso(item.price)}
            onPress={() => go('item', { itemCode: item.code })}
          />
        ))}
      </RowBox>
    </Frame>
  );
}

/** New Item at Level 1's parts (src/screens/items/item-form.tsx), or a saved item read back. */
export function ItemPage() {
  const { store, act, params, go, back, did, scanned, setScanned } = useSandbox();
  const saved = store.items.find((item) => item.code === params.itemCode);
  const [draft, setDraft] = useState<Record<'name' | 'barcode' | 'price' | 'stock' | 'cost', string>>(() => ({
    name: scanned?.name ?? '',
    barcode: scanned?.barcode ?? '',
    price: scanned ? String(scanned.price) : '',
    stock: '',
    cost: '',
  }));

  if (saved) {
    return (
      <Frame title={saved.name} meta={saved.code} onBack={back}>
        <ReadOut label="Barcode" value={saved.barcode} />
        <ReadOut label="Item Group" value={saved.group} />
        <ReadOut label="Standard Selling Rate" value={peso(saved.price)} />
        <SectionHeading title="Stock Levels" hint="Stores" />
        <ReadOut label="On hand" value={`${saved.stock} · valued at ${peso(saved.cost)} each`} />
        <ReadOut label="Re-order level" value={String(saved.reorder)} />
      </Frame>
    );
  }

  const set = (key: keyof typeof draft) => (text: string) => setDraft((current) => ({ ...current, [key]: text }));
  const save = () => {
    const item: NewItem = { name: draft.name.trim(), barcode: draft.barcode.trim(), price: number(draft.price) ?? 0, stock: number(draft.stock) ?? 0, cost: number(draft.cost) ?? 0 };
    act((current) => addItem(current, item));
    setScanned(null);
    did(T.itemSave);
    back();
  };

  return (
    <Frame
      title="New Item"
      meta="The code comes from the Item series"
      onBack={() => {
        setScanned(null);
        back();
      }}
      footer={
        <GuideTarget target={T.itemSave}>
          <Button mode="contained" disabled={draft.name.trim() === ''} onPress={save} contentStyle={styles.leading}>
            Save
          </Button>
        </GuideTarget>
      }
    >
      <GuideTarget target={T.itemScan}>
        <Button mode="outlined" icon="scan" onPress={() => { did(T.itemScan); go('scan-item'); }} style={styles.hug}>
          Scan Product
        </Button>
      </GuideTarget>
      <FieldGrid>
        <Field label="Barcode">
          <TextInput mode="outlined" dense value={draft.barcode} onChangeText={set('barcode')} accessibilityLabel="Barcode" />
        </Field>
        <Field label="Item Name" required>
          <TextInput mode="outlined" dense value={draft.name} onChangeText={set('name')} accessibilityLabel="Item Name" />
        </Field>
        <Field label="Selling Price">
          <TextInput mode="outlined" dense keyboardType="decimal-pad" value={draft.price} onChangeText={set('price')} accessibilityLabel="Selling Price" />
        </Field>
        <Field label="Stock on Hand">
          <TextInput mode="outlined" dense keyboardType="decimal-pad" value={draft.stock} onChangeText={set('stock')} accessibilityLabel="Stock on Hand" />
        </Field>
        <Field label="Cost per Unit">
          <TextInput mode="outlined" dense keyboardType="decimal-pad" value={draft.cost} onChangeText={set('cost')} accessibilityLabel="Cost per Unit" />
        </Field>
      </FieldGrid>
    </Frame>
  );
}

/** What the practice label says: Read Label fills the form with it. */
const LABEL: NewItem = { name: "Lily's Peanut Butter 340g", barcode: '4800194101234', price: 135, stock: 0, cost: 0 };

export function ScanItem() {
  const { back, did, setScanned } = useSandbox();
  const { colors } = useAppTheme();

  return (
    <Frame
      title="Scan Product"
      onBack={back}
      footer={
        <View style={styles.buttons}>
          <GuideTarget target={T.scanLabel}>
            <Button
              mode="contained"
              icon="camera"
              onPress={() => {
                setScanned(LABEL);
                did(T.scanLabel);
                back();
              }}
            >
              Read Label
            </Button>
          </GuideTarget>
          <Button mode="text" onPress={back}>
            Done
          </Button>
        </View>
      }
    >
      <Text variant="bodyMedium">{`Barcode ${LABEL.barcode}. Now read the label, or tap Done.`}</Text>
      <View style={[styles.camera, { backgroundColor: colors.surfaceVariant }]}>
        <Icon source="camera" size={48} color={colors.onSurfaceMuted} />
        <Text variant="bodyMedium">{`Practice camera · ${LABEL.name} · ₱135`}</Text>
      </View>
    </Frame>
  );
}

export function ItemPrices() {
  const { store, go, back, did } = useSandbox();
  const name = (code: string) => store.items.find((item) => item.code === code)?.name ?? code;

  return (
    <Frame
      title="Item Prices"
      meta={`${store.prices.length} prices`}
      onBack={back}
      actions={
        <GuideTarget target={T.pricesNew}>
          <Button mode="contained" icon="add" onPress={() => { did(T.pricesNew); go('item-price'); }}>
            New Item Price
          </Button>
        </GuideTarget>
      }
    >
      <RowBox empty="No prices yet.">
        {store.prices.map((price, index) => (
          <ListRow key={`${price.code}-${price.list}`} first={index === 0} title={name(price.code)} sub={`${price.list} · Nos`} figure={peso(price.rate)} />
        ))}
      </RowBox>
    </Frame>
  );
}

export function ItemPricePage() {
  const { store, act, back, did } = useSandbox();
  const [code, setCode] = useState(store.items[0]?.code ?? '');
  const [rate, setRate] = useState('');
  const value = number(rate);

  return (
    <Frame
      title="New Item Price"
      onBack={back}
      footer={
        <GuideTarget target={T.priceSave}>
          <Button
            mode="contained"
            disabled={value === null || value <= 0}
            onPress={() => {
              act((current) => addPrice(current, code, 'Standard Selling', value ?? 0));
              did(T.priceSave);
              back();
            }}
            contentStyle={styles.leading}
          >
            Save
          </Button>
        </GuideTarget>
      }
    >
      <Text variant="labelMedium">Item (required)</Text>
      <View style={styles.chips}>
        {store.items.map((item) => (
          <PickChip key={item.code} picked={item.code === code} onPress={() => setCode(item.code)}>
            {item.name}
          </PickChip>
        ))}
      </View>
      <ReadOut label="Price List" value="Standard Selling · Nos" />
      <GuideTarget target={T.priceRate}>
        <FieldGrid>
          <Field label="Rate" required>
            <TextInput
              mode="outlined"
              dense
              keyboardType="decimal-pad"
              value={rate}
              onChangeText={(text) => {
                setRate(text);
                if ((number(text) ?? 0) > 0) did(T.priceRate);
              }}
              accessibilityLabel="Rate"
            />
          </Field>
        </FieldGrid>
      </GuideTarget>
    </Frame>
  );
}

export function ImportPage() {
  const { act, reset, back, did } = useSandbox();
  const [chosen, setChosen] = useState(false);
  const [imported, setImported] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (imported) {
    return (
      <Frame
        title="Import Items"
        meta="3 items imported"
        onBack={back}
        footer={
          <Button mode="contained" onPress={() => reset('stock')} contentStyle={styles.leading}>
            Back to Stock
          </Button>
        }
      >
        <RowBox empty="">
          {IMPORT_ROWS.map((row, index) => (
            <ListRow key={row.name} first={index === 0} title={row.name} sub={`Barcode ${row.barcode}`} figure={peso(row.price)} />
          ))}
        </RowBox>
      </Frame>
    );
  }

  return (
    <Frame
      title="Import Items"
      meta="Up to 500 items a file"
      onBack={back}
      footer={
        <GuideTarget target={T.importRun}>
          <Button
            mode="contained"
            disabled={!chosen}
            onPress={() => {
              act(importItems);
              did(T.importRun);
              setImported(true);
            }}
            contentStyle={styles.leading}
          >
            Import 3 Items
          </Button>
        </GuideTarget>
      }
    >
      <Text variant="bodyMedium">Download the template, fill it in a spreadsheet, save it as CSV, then choose it. Nothing is imported until every row is right.</Text>
      <View style={styles.buttons}>
        <Button mode="outlined" onPress={() => setNotice('The practice store has no files to save. In a real store this asks for a folder.')}>
          Download Template
        </Button>
        <GuideTarget target={T.importChoose}>
          <Button
            mode={chosen ? 'outlined' : 'contained'}
            onPress={() => {
              setChosen(true);
              setNotice(null);
              did(T.importChoose);
            }}
          >
            Choose File
          </Button>
        </GuideTarget>
      </View>
      {notice ? <NoteCallout>{notice}</NoteCallout> : null}
      {chosen ? (
        <RowBox empty="">
          {IMPORT_ROWS.map((row, index) => (
            <ListRow key={row.name} first={index === 0} title={row.name} sub={`Row ${index + 2} · ready · ${row.stock} opening stock`} figure={peso(row.price)} />
          ))}
        </RowBox>
      ) : null}
    </Frame>
  );
}

const statusWord = (status: DocStatus) => status.toUpperCase();

export function StockEntries() {
  const { store, act, go, back, holds, did } = useSandbox();
  const entries = [...store.entries].reverse();

  return (
    <Frame
      title="Stock Entries"
      meta={`${entries.length} entries`}
      onBack={back}
      actions={
        holds('move_stock') ? (
          <GuideTarget target={T.entriesNew}>
            <Button
              mode="contained"
              icon="add"
              onPress={() => {
                const result = newEntry(store);
                act(() => result.store);
                did(T.entriesNew);
                go('stock-entry', { entryId: result.id });
              }}
            >
              New Stock Entry
            </Button>
          </GuideTarget>
        ) : undefined
      }
    >
      <GuideTarget target={T.entriesSubmitted}>
        <RowBox empty="No stock entries yet.">
          {entries.map((entry, index) => (
            <ListRow
              key={entry.id}
              first={index === 0}
              title={entry.number}
              sub={`Material Receipt · ${displayDate(entry.date)} · ${entry.rows.length} rows`}
              status={statusWord(entry.status)}
              alert={entry.status === 'Cancelled'}
              onPress={() => {
                if (entry.status === 'Submitted') did(T.entriesSubmitted);
                go('stock-entry', { entryId: entry.id });
              }}
            />
          ))}
        </RowBox>
      </GuideTarget>
    </Frame>
  );
}

type Confirm = { title: string; body: string; label: string; danger?: boolean; run: () => void };

/** A document's Submit / Cancel confirm, as useConfirm asks it (src/components/confirm-dialog.tsx). */
function ConfirmBox({ confirm, onClose }: { confirm: Confirm; onClose: () => void }) {
  const sandbox = useSandbox();
  const { colors } = useAppTheme();
  return (
    <AdaptiveDialog
      kicker={confirm.danger ? 'Cancel' : 'Submit'}
      kickerTone={confirm.danger ? 'error' : 'accent'}
      title={confirm.title}
      onDismiss={onClose}
      // A Dialog is drawn in Paper's Portal, outside the sandbox's tree: its buttons get the sandbox again.
      actions={
        <SandboxContext value={sandbox}>
          <Button onPress={onClose}>{confirm.danger ? 'Keep it' : 'Not yet'}</Button>
          {/* GuideButton reads the step now, not when the confirm was asked: `run` only changes the store. */}
          <GuideButton
            target={T.confirmYes}
            textColor={confirm.danger ? colors.error : undefined}
            onPress={() => {
              confirm.run();
              onClose();
            }}
          >
            {confirm.label}
          </GuideButton>
        </SandboxContext>
      }
    >
      <Text variant="bodyMedium">{confirm.body}</Text>
    </AdaptiveDialog>
  );
}

export function StockEntryPage() {
  const { store, act, params, back, holds, did } = useSandbox();
  const { colors } = useAppTheme();
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const entry = store.entries.find((candidate) => candidate.id === params.entryId);
  if (!entry) {
    return (
      <Frame title="Stock Entry" onBack={back}>
        <Text variant="bodyMedium">This entry is gone.</Text>
      </Frame>
    );
  }
  const draft = entry.status === 'Draft';
  const name = (code: string) => store.items.find((item) => item.code === code)?.name ?? code;

  return (
    <Frame
      title={entry.number}
      meta={entry.status}
      onBack={back}
      actions={<EntryActions entry={entry} saved={saved} onConfirm={setConfirm} />}
      footer={
        draft ? (
          <GuideButton target={T.entrySave} mode="contained" disabled={entry.rows.length === 0} onPress={() => setSaved(true)} contentStyle={styles.leading}>
            {saved ? 'Saved' : 'Save'}
          </GuideButton>
        ) : undefined
      }
    >
      {entry.status === 'Submitted' && !holds('adjust_inventory') ? <NoteCallout>Receive Shipments submits a delivery but cannot cancel it: that is Adjust Inventory.</NoteCallout> : null}
      <ReadOut label="Purpose" value="Material Receipt" />
      <ReadOut label="Target Warehouse" value="Stores" />
      <ReadOut label="Posting Date" value={displayDate(entry.date)} />
      <SectionHeading title="Items" hint="Each row: item, quantity, basic rate" />
      <RowBox empty="No rows yet.">
        {entry.rows.map((row, index) => (
          <ListRow key={`${row.code}-${index}`} first={index === 0} title={name(row.code)} sub={`${row.qty} × ${peso(row.rate)}`} figure={peso(row.qty * row.rate)} />
        ))}
      </RowBox>
      {draft && entry.rows.length === 0 ? (
        <GuideTarget target={T.entryAddRow}>
          <Button
            mode="text"
            textColor={colors.accent}
            onPress={() => {
              act((current) => addEntryRow(current, entry.id, 'ITEM-0003', 24));
              did(T.entryAddRow);
            }}
            style={styles.hug}
          >
            + Add Bottled Water × 24
          </Button>
        </GuideTarget>
      ) : null}
      {confirm ? <ConfirmBox confirm={confirm} onClose={() => setConfirm(null)} /> : null}
    </Frame>
  );
}

type EntryActionsProps = { entry: StockEntry; saved: boolean; onConfirm: (confirm: Confirm) => void };

/** A stock entry's Submit (a saved draft, Receive Shipments) and red Cancel (submitted, Adjust Inventory). */
function EntryActions({ entry, saved, onConfirm }: EntryActionsProps) {
  const { act, holds } = useSandbox();
  const { colors } = useAppTheme();
  const finish = (change: (store: Store) => Store) => () => act(change);

  if (entry.status === 'Draft' && holds('move_stock')) {
    return (
      <GuideButton
        target={T.entrySubmit}
        mode="contained"
        disabled={!saved || entry.rows.length === 0}
        onPress={() =>
          onConfirm({ title: `Submit ${entry.number}?`, body: 'Its stock comes in, and it can no longer change.', label: 'Submit', run: finish((store) => submitEntry(store, entry.id)) })
        }
      >
        Submit
      </GuideButton>
    );
  }
  if (entry.status === 'Submitted' && holds('adjust_inventory')) {
    return (
      <GuideButton
        target={T.entryCancel}
        mode="outlined"
        textColor={colors.error}
        onPress={() =>
          onConfirm({
            title: `Cancel ${entry.number}?`,
            body: 'Its stock goes back out. The entry stays, marked Cancelled.',
            label: 'Cancel Entry',
            danger: true,
            run: finish((store) => cancelEntry(store, entry.id)),
          })
        }
      >
        Cancel
      </GuideButton>
    );
  }
  return null;
}

export function Recons() {
  const { store, act, go, back, did } = useSandbox();
  const recons = [...store.recons].reverse();

  return (
    <Frame
      title="Stock Reconciliations"
      meta={`${recons.length} reconciliations`}
      onBack={back}
      actions={
        <GuideTarget target={T.reconsNew}>
          <Button
            mode="contained"
            icon="add"
            onPress={() => {
              const result = newRecon(store);
              act(() => result.store);
              did(T.reconsNew);
              go('recon', { reconId: result.id });
            }}
          >
            New Stock Reconciliation
          </Button>
        </GuideTarget>
      }
    >
      <RowBox empty="No reconciliations yet.">
        {recons.map((recon, index) => (
          <ListRow
            key={recon.id}
            first={index === 0}
            title={recon.number}
            sub={`${recon.id === 'r1' ? 'Opening Stock' : 'A count against the books'} · ${displayDate(recon.date)}`}
            status={statusWord(recon.status)}
            onPress={() => go('recon', { reconId: recon.id })}
          />
        ))}
      </RowBox>
    </Frame>
  );
}

export function ReconPage() {
  const { store, act, params, back, did } = useSandbox();
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const recon = store.recons.find((candidate) => candidate.id === params.reconId);
  if (!recon) return <Frame title="Stock Reconciliation" onBack={back}><Text variant="bodyMedium">This count is gone.</Text></Frame>;
  const draft = recon.status === 'Draft';
  const item = (code: string) => store.items.find((candidate) => candidate.code === code);

  return (
    <Frame
      title={recon.number}
      meta={recon.status}
      onBack={back}
      actions={
        draft ? (
          <GuideTarget target={T.reconSubmit}>
            <Button
              mode="contained"
              disabled={!saved}
              onPress={() => {
                did(T.reconSubmit);
                setConfirm({
                  title: `Submit ${recon.number}?`,
                  body: 'Each item becomes what you counted.',
                  label: 'Submit',
                  run: () => act((current) => submitRecon(current, recon.id)),
                });
              }}
            >
              Submit
            </Button>
          </GuideTarget>
        ) : undefined
      }
      footer={
        draft ? (
          <GuideTarget target={T.reconSave}>
            <Button
              mode="contained"
              onPress={() => {
                setSaved(true);
                did(T.reconSave);
              }}
              contentStyle={styles.leading}
            >
              {saved ? 'Saved' : 'Save'}
            </Button>
          </GuideTarget>
        ) : undefined
      }
    >
      <ReadOut label="Purpose" value="A count against the books" />
      <ReadOut label="Warehouse" value="Stores" />
      <GuideTarget target={T.reconCount}>
        <FieldGrid>
          {recon.rows.map((row) => (
            <Field key={row.code} label={item(row.code)?.name ?? row.code} hint={`Books: ${item(row.code)?.stock ?? 0}`}>
              <TextInput
                mode="outlined"
                dense
                keyboardType="number-pad"
                disabled={!draft}
                value={String(row.qty)}
                onChangeText={(text) => {
                  const qty = number(text) ?? 0;
                  act((current) => setCount(current, recon.id, row.code, qty));
                  setSaved(false);
                  if (qty !== item(row.code)?.stock) did(T.reconCount);
                }}
                accessibilityLabel={`Counted ${item(row.code)?.name ?? row.code}`}
              />
            </Field>
          ))}
        </FieldGrid>
      </GuideTarget>
      {confirm ? <ConfirmBox confirm={confirm} onClose={() => setConfirm(null)} /> : null}
    </Frame>
  );
}

export function StockBalance() {
  const { store, back, did } = useSandbox();
  const { colors } = useAppTheme();
  const [open, setOpen] = useState<string | null>(null);
  const value = store.items.reduce((sum, item) => sum + item.stock * item.cost, 0);

  return (
    <Frame title="Stock Balance" meta={`Stores · total ${peso(value)}`} onBack={back}>
      <GuideTarget target={T.balanceRow}>
        <RowBox empty="Nothing in stock.">
          {store.items.map((item, index) => (
            <View key={item.code}>
              <ListRow
                first={index === 0}
                title={item.name}
                sub={`${item.stock} on hand · ${peso(item.cost)} each`}
                figure={peso(item.stock * item.cost)}
                status={item.stock <= 0 ? 'OUT OF STOCK' : item.reorder > 0 && item.stock <= item.reorder ? `${item.stock} LEFT · RE-ORDER AT ${item.reorder}` : undefined}
                alert
                onPress={() => {
                  did(T.balanceRow);
                  setOpen(open === item.code ? null : item.code);
                }}
              />
              {open === item.code ? (
                <View style={[styles.details, { borderTopColor: colors.surfaceVariant }]}>
                  {store.moves.filter((move) => move.code === item.code).length === 0 ? (
                    <Text variant="bodySmall">No movements in the practice store.</Text>
                  ) : (
                    store.moves
                      .filter((move) => move.code === item.code)
                      .map((move, moveIndex) => <SampleLine key={`${move.voucher}-${moveIndex}`} label={move.voucher} sub={displayDate(move.date)} value={move.qty > 0 ? `+${move.qty}` : String(move.qty)} />)
                  )}
                </View>
              ) : null}
            </View>
          ))}
        </RowBox>
      </GuideTarget>
    </Frame>
  );
}

export function StockLedger() {
  const { store, back } = useSandbox();
  const name = (code: string) => store.items.find((item) => item.code === code)?.name ?? code;
  const moves = [...store.moves].reverse();

  return (
    <Frame title="Stock Ledger" meta={`${moves.length} movements`} onBack={back}>
      <RowBox empty="No movements yet.">
        {moves.map((move, index) => (
          <ListRow key={`${move.voucher}-${index}`} first={index === 0} title={name(move.code)} sub={`${displayDate(move.date)} · Stores · ${move.voucher}`} figure={move.qty > 0 ? `+${move.qty}` : String(move.qty)} />
        ))}
      </RowBox>
    </Frame>
  );
}

const styles = StyleSheet.create({
  leading: { justifyContent: 'flex-start' },
  hug: { alignSelf: 'flex-start' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  camera: { aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.lg, borderCurve: 'continuous' },
  details: { gap: spacing.xs, padding: spacing.ms, borderTopWidth: 1 },
});
