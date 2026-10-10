import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { ControlledText, FieldGrid } from '../../components/form-fields';
import { ControlledSelect } from '../../components/search-select';
import { useSeriesPreviewQuery, useUpdateSeriesCounterMutation } from '../../features/naming-series/queries';
import type { SeriesPreview } from '../../features/naming-series/queries';
import { seriesCounterSchema } from '../../features/naming-series/schema';
import type { SeriesCounterValues } from '../../features/naming-series/schema';
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';

type Props = { merchantId: string; onDismiss: () => void };

/**
 * Update Series (docs.frappe.io/erpnext/naming-series-current-value): pick a series, see the number it is at,
 * change it — the body of src/app/(app)/forms/series-counter.tsx (page narrow, Dialog wide).
 */
export function SeriesCounterForm({ merchantId, onDismiss }: Props) {
  // The list this form was opened from fetched the same key, so this is a cache hit.
  const preview = useSeriesPreviewQuery({ merchantId }).data;

  return preview ? <Form merchantId={merchantId} preview={preview} onDismiss={onDismiss} /> : null;
}

/** The database's refusals in words (supabase/migrations/20261010064803_naming_series.sql). */
const saveFailure = (error: Error | null) =>
  postgrestError(error)?.message === 'no_fiscal_year'
    ? 'No fiscal year covers today, so this series has no number to set. Add the year in Fiscal Years.'
    : failureMessage("Couldn't update the series. Try again.");

function Form({ merchantId, preview, onDismiss }: { merchantId: string; preview: SeriesPreview[]; onDismiss: () => void }) {
  const save = useUpdateSeriesCounterMutation({ merchantId });
  const notice = mutationNotice(save, saveFailure(save.error));

  const { control, handleSubmit, setValue } = useForm<SeriesCounterValues>({
    resolver: zodResolver(seriesCounterSchema),
    defaultValues: { series: '', current_value: '' },
    mode: 'onTouched',
  });
  const series = useWatch({ control, name: 'series' });
  const picked = preview.find((line) => line.series === series);

  const submit = handleSubmit(saveOnce(save, onDismiss));

  // "The current value will be fetched and displayed."
  const onSeriesPicked = (value: string) => {
    const line = preview.find((candidate) => candidate.series === value);
    setValue('current_value', String(line?.current_value ?? 0), { shouldDirty: true, shouldValidate: true });
  };

  return (
    <AdaptiveDialog
      asPage
      onDismiss={onDismiss}
      dismissable={!(save.isPending && !save.isPaused)}
      kicker="Document Naming Settings"
      title="Update Series"
      notice={notice}
      actions={<FormActions mutation={save} onCancel={onDismiss} onSave={submit} saveLabel="Update Series Number" />}
    >
      <FieldGrid>
        <ControlledSelect
          control={control}
          name="series"
          label="Prefix"
          required
          hint={picked?.prefix ? `Counts under ${picked.prefix}` : undefined}
          span="full"
          title="Prefix"
          options={preview.map((line) => ({ value: line.series, label: line.series, hint: line.document_type }))}
          onPicked={onSeriesPicked}
        />
        <ControlledText
          control={control}
          name="current_value"
          label="Current Value"
          required
          hint="The last number given out; the next document takes one more"
          span="full"
          keyboardType="number-pad"
          maxLength={12}
        />
      </FieldGrid>
    </AdaptiveDialog>
  );
}
