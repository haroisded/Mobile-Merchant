import { router } from 'expo-router';
import { useState } from 'react';

import { MenuSelect } from '../../components/menu-select';
import { SupplierDialog } from '../../components/supplier-dialog';
import { useSuppliersQuery } from '../../features/suppliers/queries';
import { useShellWide } from '../../lib/columns';
import { useSheetResult } from '../../Store/sheet-result';

type Props = {
  merchantId: string;
  value: string;
  onChange: (id: string) => void;
  accessibilityLabel: string;
};

/**
 * Supplier select with inline create. Optional, so "None" is offered.
 *
 * The create dialog mounts here on a wide shell and is a formSheet route on a narrow one, whose row
 * comes back through the sheet-result slot (src/Store/sheet-result.ts).
 */
export function SupplierPicker({ merchantId, value, onChange, accessibilityLabel }: Props) {
  const wide = useShellWide();
  const suppliers = useSuppliersQuery({ merchantId });
  const [creating, setCreating] = useState(false);
  useSheetResult('supplier', onChange);

  const create = () => {
    if (wide) {
      setCreating(true);
      return;
    }
    router.push({ pathname: '/sheets/supplier', params: { merchantId, resultKey: 'supplier' } });
  };

  return (
    <>
      <MenuSelect
        value={value}
        options={[
          { value: '', label: 'None' },
          ...(suppliers.data ?? []).map((supplier) => ({ value: supplier.id, label: supplier.name })),
        ]}
        onChange={onChange}
        placeholder={suppliers.isError ? "Couldn't load suppliers" : suppliers.isPending ? 'Loading…' : 'None'}
        accessibilityLabel={accessibilityLabel}
        createLabel="New supplier"
        onCreate={create}
      />
      {creating ? (
        <SupplierDialog
          merchantId={merchantId}
          onDismiss={() => setCreating(false)}
          onCreated={(supplier) => onChange(supplier.id)}
        />
      ) : null}
    </>
  );
}
