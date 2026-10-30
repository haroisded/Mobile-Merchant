import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { ControlledDate, ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { Text } from '../../components/text';
import { useDeleteFiscalYearMutation, useFiscalYearsQuery, useSaveFiscalYearMutation } from '../../features/fiscal-years/queries';
import type { FiscalYear } from '../../features/fiscal-years/queries';
import { fiscalYearSchema } from '../../features/fiscal-years/schema';
import type { FiscalYearValues } from '../../features/fiscal-years/schema';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useShellWide } from '../../lib/columns';
import { fullYearEnd, todayDate, yearName } from '../../lib/dates';
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';

type Props = {
  merchantId: string;
  /** Absent for a new year. */
  fiscalYearId?: string;
  onDismiss: () => void;
};

/**
 * The day after the latest year ends, or 1 January this year for the first: where a new year starts.
 * The list arrives newest start first, and years cannot overlap, so the first row also ends last.
 */
function nextStart(years: FiscalYear[]) {
  const latest = years[0]?.year_end_date;
  if (!latest) return `${todayDate().slice(0, 4)}-01-01`;
  const [year, month, day] = latest.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function defaults(years: FiscalYear[], existing: FiscalYear | undefined): FiscalYearValues {
  if (existing) {
    return {
      year: existing.year,
      year_start_date: existing.year_start_date,
      year_end_date: existing.year_end_date,
      is_short_year: existing.is_short_year,
      is_default: existing.is_default,
      disabled: existing.disabled,
    };
  }
  const start = nextStart(years);
  const end = fullYearEnd(start);
  return { year: yearName(start, end), year_start_date: start, year_end_date: end, is_short_year: false, is_default: false, disabled: false };
}

/**
 * Create or edit one fiscal year — the body of src/app/(app)/forms/fiscal-year.tsx: a full page on a phone,
 * a Dialog over the list on a tablet (AdaptiveDialog `asPage`). As ERPNext does, the end date and the name
 * follow the start date until the user sets them.
 */
export function FiscalYearForm({ merchantId, fiscalYearId, onDismiss }: Props) {
  const years = useFiscalYearsQuery({ merchantId });
  // The list this form was opened from fetched the same key, so this is a cache hit.
  if (!years.data) return null;
  const existing = fiscalYearId ? years.data.find((year) => year.id === fiscalYearId) : undefined;

  return <YearForm merchantId={merchantId} existing={existing} initial={defaults(years.data, existing)} onDismiss={onDismiss} />;
}

type FormProps = {
  merchantId: string;
  existing: FiscalYear | undefined;
  initial: FiscalYearValues;
  onDismiss: () => void;
};

/** The copy for a failed save: a duplicate name (23505) and an overlap (23P01) get their own. */
function saveFailure(error: Error | null) {
  const code = postgrestError(error)?.code;
  if (code === '23505') return 'There is already a fiscal year with this name.';
  if (code === '23P01') return 'These dates overlap another fiscal year. Change them, or edit that year first.';
  return failureMessage("Couldn't save this fiscal year. Try again.");
}

function YearForm({ merchantId, existing: opened, initial, onDismiss }: FormProps) {
  const wide = useShellWide();
  // Held from the open: a delete refetches the list before this form closes, and the year must not turn
  // into "New fiscal year" under the confirm in that moment.
  const [existing] = useState(opened);
  const save = useSaveFiscalYearMutation({ merchantId, fiscalYearId: existing?.id });
  const permissions = usePermissions({ merchantId }).data;
  // Without the permission the form is read-only, and the buttons it would need are not there.
  const editable = can(permissions, 'Fiscal Year', existing ? 'write' : 'create');
  const deletable = can(permissions, 'Fiscal Year', 'delete');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inFlight = save.isPending && !save.isPaused;

  // A confirm is a native sheet narrow and a Dialog wide (.claude/instruction_mds/frontend.md §4.4).
  const askDelete = (year: FiscalYear) =>
    wide
      ? setConfirmDelete(true)
      : router.push({ pathname: '/sheets/delete-fiscal-year', params: { merchantId, fiscalYearId: year.id } });

  const notice = mutationNotice(save, saveFailure(save.error));

  const { control, handleSubmit, setValue, getValues, getFieldState, formState } = useForm<FiscalYearValues>({
    resolver: zodResolver(fiscalYearSchema),
    defaultValues: initial,
    mode: 'onTouched',
  });

  // ERPNext fills the end date from the start: the same date a year on, minus a day. The name follows
  // the dates until the user has typed one of their own.
  const startPicked = (start: string) => {
    if (!getValues('is_short_year')) setValue('year_end_date', fullYearEnd(start), { shouldValidate: true });
    if (!getFieldState('year', formState).isDirty) setValue('year', yearName(start, getValues('year_end_date')));
  };

  const submit = handleSubmit(saveOnce(save, onDismiss));

  return (
    <>
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        dismissable={!inFlight}
        kicker="Fiscal year"
        title={existing ? existing.year : 'New fiscal year'}
        notice={notice}
        actions={
          <FormActions
            mutation={save}
            onCancel={onDismiss}
            onSave={editable ? submit : undefined}
            onDelete={existing && deletable ? () => askDelete(existing) : undefined}
          />
        }
      >
        <FieldGrid>
          <ControlledText control={control} name="year" label="Year Name" required span="full" placeholder="e.g. 2026" maxLength={20} disabled={!editable} />
          <ControlledDate control={control} name="year_start_date" label="Year Start Date" required onPicked={startPicked} disabled={!editable} />
          <ControlledDate control={control} name="year_end_date" label="Year End Date" required disabled={!editable} />
          <ControlledSwitch
            control={control}
            name="is_short_year"
            deps={['year_end_date']}
            label="Short Year"
            span="full"
            disabled={!editable}
            on="A transition period shorter than twelve months"
            off="A full twelve months"
          />
          <ControlledSwitch
            control={control}
            name="is_default"
            label="Default"
            span="full"
            disabled={!editable}
            on="The only default: new transactions and reports start in it"
            off="Not the default year"
          />
          <ControlledSwitch control={control} name="disabled" label="Disabled" span="full" on="Not used for new transactions" off="In use" disabled={!editable} />
        </FieldGrid>
      </AdaptiveDialog>
      {confirmDelete && existing ? <DeleteFiscalYear year={existing} onDismiss={() => setConfirmDelete(false)} onDeleted={onDismiss} /> : null}
    </>
  );
}

type DeleteProps = {
  year: FiscalYear;
  /** The body of the narrow sheet route (src/app/(app)/sheets/delete-fiscal-year.tsx); otherwise a Dialog. */
  inSheet?: boolean;
  onDismiss: () => void;
  /** Closes the confirm and the form it was opened from. */
  onDeleted: () => void;
};

/** Delete a fiscal year: a Dialog over the form wide, the sheet route's body narrow. */
export function DeleteFiscalYear({ year, inSheet, onDismiss, onDeleted }: DeleteProps) {
  const remove = useDeleteFiscalYearMutation();
  const notice = mutationNotice(remove, failureMessage("Couldn't delete this fiscal year. Try again."));

  return (
    <ConfirmDialog
      inSheet={inSheet}
      onDismiss={onDismiss}
      kicker="Delete"
      title={`Delete fiscal year ${year.year}?`}
      confirmLabel="Delete"
      onConfirm={() => saveOnce(remove, onDeleted)(year.id)}
      mutation={remove}
      notice={notice}
    >
      <Text variant="bodyMedium">Transactions can only be posted on days a fiscal year covers. Disable a year instead to keep its record.</Text>
    </ConfirmDialog>
  );
}
