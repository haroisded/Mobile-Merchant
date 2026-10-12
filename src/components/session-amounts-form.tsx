import { zodResolver } from '@hookform/resolvers/zod';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';

import { sessionAmountsSchema } from '../features/pos-opening-entries/schema';
import type { SessionAmountsValues } from '../features/pos-opening-entries/schema';
import { mutationNotice, postingRefusal } from '../lib/errors';
import { sendOnce } from './adaptive-dialog';
import { ControlledText, FieldGrid } from './form-fields';
import { PageForm } from './form-footer';

type Props<D> = {
  /** The payment methods an amount is asked for, in the POS Profile's order. */
  modes: { id: string; label: string }[];
  /** Under each field: "In the drawer now", "Counted". */
  hint: string;
  /** The button: "Open Session", "Close Session". */
  submitLabel: string;
  mutation: { isPending: boolean; isPaused: boolean; isError: boolean; error: Error | null; mutate: (values: SessionAmountsValues, options: { onSuccess: (data: D) => void }) => void };
  /** The screen's words for a failure the database did not name. */
  failure: (error: Error | null) => string;
  /** False: nothing to send yet — no POS Profile picked. */
  ready: boolean;
  onDone: (data: D) => void;
  /** Above the amounts. */
  children?: ReactNode;
};

/**
 * An amount per payment method, the body of the two pages a session has: what its drawer starts with
 * (src/screens/pos-opening-entries/open-session.tsx) and what was counted at its end
 * (src/screens/pos-closing-entries/close-session.tsx). Key it by what the methods come from — the fields are
 * the form's defaults.
 */
export function SessionAmountsForm<D>({ modes, hint, submitLabel, mutation, failure, ready, onDone, children }: Props<D>) {
  const { control, handleSubmit } = useForm<SessionAmountsValues>({
    resolver: zodResolver(sessionAmountsSchema),
    defaultValues: { amounts: modes.map((mode) => ({ mode_of_payment_id: mode.id, amount: '' })) },
    mode: 'onTouched',
  });
  // Made per render, not per tap: sendOnce's guard is the handler two quick taps share.
  const send = sendOnce(mutation, onDone);

  return (
    <PageForm
      editable
      readOnly=""
      notice={mutationNotice(mutation, postingRefusal(mutation.error) ?? failure(mutation.error))}
      mutation={mutation}
      dirty={ready}
      onSave={handleSubmit(send)}
      saveLabel={submitLabel}
    >
      {children}
      <FieldGrid>
        {modes.map((mode, index) => (
          <ControlledText key={mode.id} control={control} name={`amounts.${index}.amount`} label={mode.label} hint={hint} placeholder="0" keyboardType="decimal-pad" maxLength={14} />
        ))}
      </FieldGrid>
    </PageForm>
  );
}
