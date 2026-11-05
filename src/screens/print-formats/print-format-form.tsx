import { zodResolver } from '@hookform/resolvers/zod';
import { router, useNavigation } from 'expo-router';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { saveOnce } from '../../components/adaptive-dialog';
import { Button } from '../../components/button';
import { useConfirm } from '../../components/confirm-dialog';
import { ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { PageForm } from '../../components/form-footer';
import { PageHeader } from '../../components/page-header';
import { ControlledSelect } from '../../components/search-select';
import { SectionHeading } from '../../components/section-heading';
import type { Merchant } from '../../features/merchants/queries';
import { useDeletePrintFormatMutation, usePrintFormatsQuery, useSavePrintFormatMutation } from '../../features/print-formats/queries';
import type { PrintFormat } from '../../features/print-formats/queries';
import { PAPERS, printFormatSchema } from '../../features/print-formats/schema';
import type { Paper, PrintFormatValues } from '../../features/print-formats/schema';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { ReceiptSample } from './receipt-sample';

/**
 * One Print Format (docs.frappe.io/erpnext/print-format): how the receipt is laid out, and a sample receipt
 * drawn from the unsaved values. A page of the Setup stack — src/app/(app)/systems/[id]/setup/print-format.tsx
 * — at every width, since the sample needs the room.
 */
export function PrintFormatPage({ merchant, formatId }: { merchant: Merchant; formatId?: string }) {
  // The list this page was opened from fetched the same key, so this is a cache hit.
  const formats = usePrintFormatsQuery({ merchantId: merchant.id }).data;
  if (!formats) return null;
  const existing = formatId ? formats.find((format) => format.id === formatId) : undefined;

  return <Form merchant={merchant} existing={existing} />;
}

const PAPER_OPTIONS: { value: Paper; label: string; hint: string }[] = [
  { value: '58mm', label: '58mm', hint: 'The narrow receipt roll' },
  { value: '80mm', label: '80mm', hint: 'The wide receipt roll' },
  { value: 'A4', label: 'A4', hint: 'A full page' },
];

const asPaper = (paper: string | undefined): Paper => PAPERS.find((candidate) => candidate === paper) ?? '80mm';

const defaults = (existing: PrintFormat | undefined): PrintFormatValues => ({
  print_format_name: existing?.print_format_name ?? '',
  paper: asPaper(existing?.paper),
  print_heading: existing?.print_heading ?? '',
  show_item_code: existing?.show_item_code ?? true,
  footer_note: existing?.footer_note ?? '',
  is_default: existing?.is_default ?? false,
  disabled: existing?.disabled ?? false,
});

const saveFailure = (error: Error | null) =>
  postgrestError(error)?.code === '23505' ? 'There is already a print format with this name.' : failureMessage("Couldn't save this print format. Try again.");

/** The page's header: kicker, title, and the red Delete with its confirm for whoever may delete. */
function FormatHeader({ merchant, existing, save }: { merchant: Merchant; existing: PrintFormat | undefined; save: ReactNode }) {
  const { colors } = useAppTheme();
  const navigation = useNavigation();
  const wide = useShellWide();
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const remove = useDeletePrintFormatMutation();
  const confirm = useConfirm();

  const askDelete = (format: PrintFormat) =>
    confirm.ask({
      title: `Delete ${format.print_format_name}?`,
      body: 'It leaves the list of receipt layouts. Disable it instead to keep it for later.',
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(format.id),
      failure: () => failureMessage("Couldn't delete this print format. Try again."),
      // A page of the Setup stack, not a forms/ route: this page pops through its own navigator, and on a
      // phone the confirm's sheet of the outer stack pops too (sales-tax-templates/template-form.tsx).
      onDone: () => {
        navigation.goBack();
        if (!wide) router.back();
      },
    });

  return (
    <>
      <PageHeader
        kicker="Print Format"
        title={existing?.print_format_name ?? 'New print format'}
        onBack={() => router.back()}
        actions={[
          existing && can(permissions, 'Print Format', 'delete') ? (
            <Button key="delete" mode="outlined" textColor={colors.error} icon="delete" onPress={() => askDelete(existing)}>
              Delete
            </Button>
          ) : null,
          save,
        ]}
      />
      {confirm.dialog}
    </>
  );
}

function Form({ merchant, existing }: { merchant: Merchant; existing: PrintFormat | undefined }) {
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const editable = can(permissions, 'Print Format', existing ? 'write' : 'create');
  const save = useSavePrintFormatMutation({ merchantId: merchant.id, formatId: existing?.id });
  const notice = mutationNotice(save, saveFailure(save.error));

  const { control, handleSubmit, formState } = useForm<PrintFormatValues>({
    resolver: zodResolver(printFormatSchema),
    defaultValues: defaults(existing),
    mode: 'onTouched',
  });

  const submit = handleSubmit(saveOnce(save, () => router.back()));

  return (
    <View style={styles.fill}>
      <PageForm
        header={(button) => <FormatHeader merchant={merchant} existing={existing} save={button} />}
        editable={editable}
        readOnly="Changing it needs Print Format write."
        notice={notice}
        mutation={save}
        // A format not yet saved always has something to check: Save names what is missing ("Enter a name.").
        dirty={!existing || formState.isDirty}
        unsaved={formState.isDirty}
        onSave={submit}
      >
        <FieldGrid>
          <ControlledText control={control} name="print_format_name" label="Name" required span="full" placeholder="e.g. POS Receipt" maxLength={140} disabled={!editable} />
          <ControlledSelect control={control} name="paper" label="Paper" required title="Paper" options={PAPER_OPTIONS} disabled={!editable} />
          <ControlledText
            control={control}
            name="print_heading"
            label="Print Heading"
            hint="Printed over the receipt; blank prints none"
            placeholder="e.g. Official Receipt"
            maxLength={140}
            disabled={!editable}
          />
          <ControlledSwitch
            control={control}
            name="show_item_code"
            label="Show Item Code"
            span="full"
            on="Each line prints the item's code with its name"
            off="Each line prints the item's name only"
            disabled={!editable}
          />
          <ControlledText
            control={control}
            name="footer_note"
            label="Footer Note"
            hint="Printed under the totals"
            span="full"
            multiline
            placeholder="e.g. Thank you. Please come again."
            maxLength={500}
            disabled={!editable}
          />
          <ControlledSwitch
            control={control}
            name="is_default"
            label="Default"
            on="A receipt takes this format unless the POS Profile names another"
            off="Not the default"
            deps={['disabled']}
            disabled={!editable}
          />
          <ControlledSwitch control={control} name="disabled" label="Disabled" on="Not offered for new receipts" off="In use" deps={['is_default']} disabled={!editable} />
        </FieldGrid>
        <SectionHeading title="Sample receipt" hint="A made-up sale in this format, before saving" />
        <ReceiptSample merchant={merchant} control={control} />
      </PageForm>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
