import type { useQueryClient } from '@tanstack/react-query';
import { router, useNavigation } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAccountsSettingsQuery } from '../features/accounts-settings/queries';
import { DOCSTATUS, useDocumentActionMutation } from '../features/documents/queries';
import { can, usePermissions } from '../features/role-permissions/queries';
import type { Permissions } from '../features/role-permissions/queries';
import { useShellWide } from '../lib/columns';
import { failureMessage, mutationNotice, postingRefusal } from '../lib/errors';
import { useAppTheme } from '../lib/theme';
import { spacing } from '../themes';
import { Button } from './button';
import { useConfirm } from './confirm-dialog';
import { PageForm } from './form-footer';
import { useVoucherRoutes } from './ledger-filters';
import { PageHeader } from './page-header';
import { QueryState } from './query-state';
import { Text } from './text';

// The page every document shares (docs.frappe.io/erpnext/accounting-entries; POS-System-Added-Features 15.1,
// 21.1): its number and status in the header, what its status and the reader's roles allow beside them, and
// its form underneath — editable while a draft, a record of what was posted from then on.

/** A saved document, as much of it as the page needs whatever its doctype. */
type SavedDocument = { id: string; name: string; docstatus: number };

type SharedProps = {
  merchantId: string;
  /** The doctype's name, as public.doctypes has it ("Stock Entry"): the kicker, and what allows each action. */
  doctype: string;
  /** The document's own queries, refetched after a submit, a cancel or a delete. */
  invalidate: (queryClient: ReturnType<typeof useQueryClient>) => Promise<void>;
  /** What Cancel will do, said in its confirm. */
  cancelBody: string;
};

/** What only a draft's header needs. */
type DraftProps = {
  /** The form holds changes Save has not written: Submit waits for them. */
  dirty: boolean;
  /** The draft's delete. */
  remove: (id: string) => Promise<void>;
  /** What Submit will do, said in its confirm. */
  submitBody: string;
};

type HeaderProps = SharedProps &
  DraftProps & {
    /** Undefined for a document not yet saved. */
    document: SavedDocument | undefined;
  };

/** A saved document's header. A document that is never a draft in the app — a POS Invoice — leaves the draft's three out. */
type SavedHeaderProps = SharedProps &
  Partial<DraftProps> & {
    document: SavedDocument;
    /** After the status in the header's meta line: what else the document is ("Return against …"). */
    note?: string;
    /** The document's own actions (a sale's Return), after Submit and Delete. */
    extra?: ReactNode[];
  };

/**
 * Whether a document can still be changed, and whether the reader may change it: only a draft, and with
 * Write — Create for one not yet saved. The database holds the same line (private.guard_docstatus).
 */
export function useDocumentAccess(merchantId: string, doctype: string, document: { docstatus: number } | undefined) {
  const permissions = usePermissions({ merchantId }).data;
  const draft = !document || document.docstatus === 0;

  return { draft, editable: draft && can(permissions, doctype, document ? 'write' : 'create') };
}

/**
 * What a saved document's status and the reader's roles allow, action by action. `keepsEntries`: Accounts
 * Settings' "Delete Ledger Entries with the Document" is off, so a cancelled document stays.
 */
function allowed(permissions: Permissions | null | undefined, doctype: string, docstatus: number, keepsEntries: boolean) {
  return {
    submit: docstatus === 0 && can(permissions, doctype, 'submit'),
    // A draft, or a cancelled document whose entries may go with it.
    remove: (docstatus === 0 || (docstatus === 2 && !keepsEntries)) && can(permissions, doctype, 'delete'),
    cancel: docstatus === 1 && can(permissions, doctype, 'cancel'),
    // What it posted, and after a cancel what reversed it.
    stockLedger: docstatus > 0 && can(permissions, 'Stock Ledger Entry', 'read'),
    generalLedger: docstatus > 0 && can(permissions, 'GL Entry', 'read'),
  };
}

/**
 * The questions a document's header asks. Submit, Cancel and a cancelled document's Delete go through
 * public.submit_document, public.cancel_document and public.delete_document, each after a confirm: none can
 * be taken back, and the confirm's own button is what stops a second tap posting twice.
 */
function useDocumentConfirms({ doctype, document, remove, invalidate, submitBody, cancelBody }: SavedHeaderProps) {
  const navigation = useNavigation();
  const wide = useShellWide();
  const submit = useDocumentActionMutation({ doctype, action: 'submit', invalidate });
  const cancel = useDocumentActionMutation({ doctype, action: 'cancel', invalidate });
  const erase = useDocumentActionMutation({ doctype, action: 'delete', invalidate });
  const confirm = useConfirm();
  const { id, name } = document;
  const cancelled = document.docstatus === 2;

  const failure = (cause: Error) => postingRefusal(cause) ?? failureMessage("Couldn't finish that. Try again.");
  // Narrow, the confirm is a sheet of the outer stack, popped here; wide, useConfirm closes its own Dialog.
  const closeConfirm = () => {
    if (!wide) router.back();
  };
  // A deleted document's page pops through its own navigator, as an item's does (src/screens/items/item-form.tsx).
  const leave = () => {
    navigation.goBack();
    closeConfirm();
  };

  return {
    dialog: confirm.dialog,
    submit: () =>
      confirm.ask({ kicker: 'Submit', tone: 'accent', title: `Submit ${name}?`, body: submitBody ?? '', confirmLabel: 'Submit', run: () => submit.mutateAsync(id), failure, onDone: closeConfirm }),
    cancel: () =>
      confirm.ask({
        kicker: 'Cancel',
        title: `Cancel ${name}?`,
        body: cancelBody,
        confirmLabel: 'Cancel document',
        dismissLabel: 'Keep it',
        run: () => cancel.mutateAsync(id),
        failure,
        onDone: closeConfirm,
      }),
    remove: () =>
      confirm.ask({
        title: `Delete ${name}?`,
        body: cancelled
          ? 'This cancelled document goes for good, with the ledger entries it posted and the ones that reversed them.'
          : 'This draft goes for good. Nothing was posted from it.',
        confirmLabel: 'Delete',
        // A draft goes through its own feature; a cancelled document, entries and all, through public.delete_document.
        run: () => (cancelled ? erase.mutateAsync(id) : (remove?.(id) ?? Promise.resolve())),
        failure,
        onDone: leave,
      }),
  };
}

/** The entries a document posted, each report opened narrowed to it. */
function useReportActions(merchantId: string, name: string, allow: { stockLedger: boolean; generalLedger: boolean }) {
  const routes = useVoucherRoutes(merchantId);
  const voucher = { voucher: name };

  return [
    allow.stockLedger ? (
      <Button key="stock-ledger" mode="outlined" onPress={() => routes.openReport('stock-ledger', voucher)}>
        Stock Ledger
      </Button>
    ) : null,
    allow.generalLedger ? (
      <Button key="general-ledger" mode="outlined" onPress={() => routes.openReport('general-ledger', voucher)}>
        General Ledger
      </Button>
    ) : null,
  ];
}

/**
 * A saved document's header: Submit and Delete on a draft, Cancel on a submitted one, Delete again on a
 * cancelled one where Accounts Settings let its entries go, then the entries it posted.
 */
export function DocumentHeader(props: SavedHeaderProps) {
  const { merchantId, doctype, document, dirty = false, note, extra = [] } = props;
  const { colors } = useAppTheme();
  // Every member reads Accounts Settings; until it loads, a cancelled document is kept.
  const keepsEntries = !useAccountsSettingsQuery({ merchantId }).data?.delete_linked_ledger_entries;
  const allow = allowed(usePermissions({ merchantId }).data, doctype, document.docstatus, keepsEntries);
  const ask = useDocumentConfirms(props);
  const reports = useReportActions(merchantId, document.name, allow);
  const status = allow.submit && dirty ? 'Draft · save your changes before submitting' : DOCSTATUS[document.docstatus];

  const actions = [
    allow.submit ? (
      <Button key="submit" mode="contained" icon="check" onPress={ask.submit} disabled={dirty}>
        Submit
      </Button>
    ) : null,
    allow.remove ? (
      <Button key="delete" mode="outlined" textColor={colors.error} icon="delete" onPress={ask.remove}>
        Delete
      </Button>
    ) : null,
    ...extra,
    allow.cancel ? (
      <Button key="cancel" mode="outlined" textColor={colors.error} icon="close" onPress={ask.cancel}>
        Cancel
      </Button>
    ) : null,
    ...reports,
  ].filter((action) => action !== null);

  return (
    <>
      <PageHeader kicker={doctype} title={document.name} meta={note ? `${status} · ${note}` : status} onBack={() => router.back()} actions={actions.length > 0 ? actions : null} />
      {ask.dialog}
    </>
  );
}

type PageProps = HeaderProps & {
  /** From useDocumentAccess. */
  draft: boolean;
  editable: boolean;
  /** The draft's save: its state is the footer's, its error the notice's. */
  save: { isPending: boolean; isPaused: boolean; isError: boolean; error: Error | null };
  onSave: () => void;
  /** The document's fields. */
  children: ReactNode;
};

/** A document's page: its header over its form. A new one has no number yet, and nothing to submit until saved. */
export function DocumentPage({ draft, editable, save, onSave, children, ...header }: PageProps) {
  const { doctype, document, dirty } = header;
  const noun = doctype.toLowerCase();

  return (
    <View style={styles.fill}>
      {document ? <DocumentHeader {...header} document={document} /> : <PageHeader kicker={doctype} title={`New ${noun}`} meta="Not saved yet" onBack={() => router.back()} />}
      <PageForm
        editable={editable}
        readOnly={draft ? `Changing it needs ${doctype} write.` : 'It is no longer a draft, so it stays as it was posted.'}
        notice={mutationNotice(save, postingRefusal(save.error) ?? failureMessage(`Couldn't save this ${noun}. Try again.`))}
        mutation={save}
        // A document not yet saved always has something to check: Save names what is missing.
        dirty={!document || dirty}
        onSave={onSave}
      >
        {children}
      </PageForm>
    </View>
  );
}

type StateProps = {
  doctype: string;
  query: { data: unknown; isPaused: boolean; isPending: boolean; isError: boolean; refetch: () => void };
};

/** A document's page before its document: loading, offline, failed — or gone, or hidden from the reader's roles. */
export function DocumentState({ doctype, query }: StateProps) {
  const noun = doctype.toLowerCase();

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Document" title={doctype} onBack={() => router.back()} />
      <View style={styles.state}>
        <QueryState query={query} offline={`You're offline. This ${noun} will load when you reconnect.`} failure={`Couldn't load this ${noun}. Try again.`}>
          <Text variant="bodyMedium">{`This ${noun} no longer exists, or your roles can't open it.`}</Text>
        </QueryState>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
});
