import { accountLabel, useAccountsQuery } from '../../features/accounts/queries';
import { costCenterLabel, useCostCentersQuery } from '../../features/cost-centers/queries';
import { useFiscalYearsQuery } from '../../features/fiscal-years/queries';
import { useMerchantsQuery } from '../../features/merchants/queries';
import type { PickOption } from '../../Store/picker';

/**
 * The records a User Permission may name, by restrictable doctype: the For Value choices in the form, and
 * the names in the list. Every restrictable doctype's list is loaded — each is short — so the hooks run
 * unconditionally whichever doctype is picked.
 */
export function useRestrictableRecords({ merchantId }: { merchantId: string }) {
  const fiscalYears = useFiscalYearsQuery({ merchantId });
  const accounts = useAccountsQuery({ merchantId });
  const costCenters = useCostCentersQuery({ merchantId });
  const abbr = useMerchantsQuery().data?.find((merchant) => merchant.id === merchantId)?.abbr ?? '';

  // Keyed by doctype name, as public.doctypes names them.
  const options = new Map<string, PickOption[]>([
    ['Fiscal Year', (fiscalYears.data ?? []).map((year) => ({ value: year.id, label: year.year }))],
    ['Account', (accounts.data ?? []).map((account) => ({ value: account.id, label: accountLabel(account, abbr), hint: account.root_type }))],
    ['Cost Center', (costCenters.data ?? []).map((costCenter) => ({ value: costCenter.id, label: costCenterLabel(costCenter, abbr) }))],
  ]);

  const names = new Map([...options.values()].flatMap((list) => list.map((option) => [option.value, option.label] as const)));

  return {
    options,
    /** A record's name, or a placeholder while its doctype's list loads. */
    label: (id: string) => names.get(id) ?? '…',
  };
}
