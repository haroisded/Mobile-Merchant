import { router } from 'expo-router';
import { useState } from 'react';

import { MenuSelect } from '../../components/menu-select';
import { TaxClassDialog } from '../../components/tax-class-dialog';
import { taxClassLabel, useTaxClassesQuery } from '../../features/tax-classes/queries';
import { useShellWide } from '../../lib/columns';
import { useSheetResult } from '../../Store/sheet-result';

type Props = {
  merchantId: string;
  value: string;
  onChange: (id: string) => void;
  accessibilityLabel: string;
  error?: boolean;
};

/**
 * Tax class select with inline create. "None" is offered: a product with no class is untaxed.
 *
 * The create dialog mounts here on a wide shell and is a formSheet route on a narrow one, whose row
 * comes back through the sheet-result slot (src/Store/sheet-result.ts).
 */
export function TaxClassPicker({ merchantId, value, onChange, accessibilityLabel, error }: Props) {
  const wide = useShellWide();
  const taxClasses = useTaxClassesQuery({ merchantId });
  const [creating, setCreating] = useState(false);
  useSheetResult('tax-class', onChange);

  const create = () => {
    if (wide) {
      setCreating(true);
      return;
    }
    router.push({ pathname: '/sheets/tax-class', params: { merchantId, resultKey: 'tax-class' } });
  };

  return (
    <>
      <MenuSelect
        value={value}
        options={[
          { value: '', label: 'None' },
          ...(taxClasses.data ?? []).map((taxClass) => ({ value: taxClass.id, label: taxClassLabel(taxClass) })),
        ]}
        onChange={onChange}
        placeholder={taxClasses.isError ? "Couldn't load tax classes" : taxClasses.isPending ? 'Loading…' : 'None'}
        accessibilityLabel={accessibilityLabel}
        error={error}
        createLabel="New tax class"
        onCreate={create}
      />
      {creating ? (
        <TaxClassDialog
          merchantId={merchantId}
          onDismiss={() => setCreating(false)}
          onCreated={(taxClass) => onChange(taxClass.id)}
        />
      ) : null}
    </>
  );
}
