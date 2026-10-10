import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { NoteCallout } from '../../components/note-callout';
import { useNamingSeriesQuery, useUpdateNamingSeriesMutation } from '../../features/naming-series/queries';
import type { NamingSeries } from '../../features/naming-series/queries';
import { namingSeriesSchema } from '../../features/naming-series/schema';
import type { NamingSeriesValues } from '../../features/naming-series/schema';
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';

type Props = { merchantId: string; documentType: string; onDismiss: () => void };

/** One document's naming series — the body of src/app/(app)/forms/naming-series.tsx (page narrow, Dialog wide). */
export function NamingSeriesForm({ merchantId, documentType, onDismiss }: Props) {
  // The list this form was opened from fetched the same key, so this is a cache hit.
  const existing = useNamingSeriesQuery({ merchantId }).data?.find((row) => row.document_type === documentType);

  return existing ? <Form merchantId={merchantId} existing={existing} onDismiss={onDismiss} /> : null;
}

/** The database's refusals in words (supabase/migrations/20261010064803_naming_series.sql). */
const saveFailure = (error: Error | null) => {
  const cause = postgrestError(error);
  if (cause?.message === 'series_in_use') return 'One of these series already numbers another document. Give each document its own.';
  if (cause?.code === '23514') return "One of these series can't be used. Check each line.";
  return failureMessage("Couldn't save the series. Try again.");
};

function Form({ merchantId, existing, onDismiss }: { merchantId: string; existing: NamingSeries; onDismiss: () => void }) {
  const save = useUpdateNamingSeriesMutation({ merchantId, documentType: existing.document_type });
  const notice = mutationNotice(save, saveFailure(save.error));

  const { control, handleSubmit } = useForm<NamingSeriesValues>({
    resolver: zodResolver(namingSeriesSchema),
    defaultValues: { series: existing.options.join('\n'), user_must_select: existing.user_must_select },
    mode: 'onTouched',
  });

  const submit = handleSubmit(saveOnce(save, onDismiss));

  return (
    <AdaptiveDialog
      asPage
      onDismiss={onDismiss}
      dismissable={!(save.isPending && !save.isPaused)}
      kicker="Naming Series"
      title={existing.document_type}
      notice={notice}
      actions={<FormActions mutation={save} onCancel={onDismiss} onSave={submit} />}
    >
      {/* docs.frappe.io/erpnext/naming-series §1–§2: the parts of a series. */}
      <NoteCallout>
        {`Parts are separated by dots. .YYYY. .YY. .MM. and .DD. print today's date, .FY. the fiscal year, and # at the end is the number: #### counts 0001, 0002. With no # the number has five digits. ACC-PSINV-.YYYY.- gives ACC-PSINV-${new Date().getFullYear()}-00001.`}
      </NoteCallout>
      <FieldGrid>
        <ControlledText
          control={control}
          name="series"
          label="Series"
          required
          hint="One per line; the first is the default"
          span="full"
          multiline
          autoCapitalize="characters"
          maxLength={1000}
        />
        <ControlledSwitch
          control={control}
          name="user_must_select"
          label="User must always select"
          span="full"
          on="No default: a series is picked for every new document"
          off="A new document takes the first series unless another is picked"
        />
      </FieldGrid>
    </AdaptiveDialog>
  );
}
