import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { CostCenterValues } from './schema';

export type CostCenter = Tables<'cost_centers'>;

/**
 * "Main - CC": ERPNext's cost center name, number first when set. The root is the company itself, so it
 * carries no abbreviation.
 */
export const costCenterLabel = (costCenter: CostCenter, abbr: string) =>
  costCenter.parent_id === null
    ? costCenter.cost_center_name
    : `${costCenter.cost_center_number ? `${costCenter.cost_center_number} - ` : ''}${costCenter.cost_center_name} - ${abbr}`;

/** Enabled ledger cost centers as picker options, None first; `keep` as in accounts' ledgerOptions. */
export const costCenterOptions = (costCenters: CostCenter[], abbr: string, keep?: string | null) => [
  { value: '', label: 'None' },
  ...costCenters
    .filter((costCenter) => costCenter.id === keep || (!costCenter.is_group && !costCenter.disabled))
    .map((costCenter) => ({ value: costCenter.id, label: costCenterLabel(costCenter, abbr) })),
];

// The only file that knows the table is called `cost_centers` (.claude/instruction_mds/data-layer.md
// rules 2-3).
const costCentersKey = {
  all: ['cost-centers'],
  lists: () => [...costCentersKey.all, 'list'],
  list: (args: { merchantId: string }) => [...costCentersKey.lists(), args],
};

/** A system's whole Cost Center tree, flat; the screens walk it with src/lib/tree.ts. */
export function useCostCentersQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: costCentersKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase
        .from('cost_centers')
        .select('*')
        .eq('merchant_id', merchantId)
        .order('cost_center_number', { nullsFirst: false })
        .order('cost_center_name')
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

const row = (values: CostCenterValues) => ({
  ...values,
  cost_center_number: values.cost_center_number || null,
  parent_id: values.parent_id || null,
});

/** Create a cost center, or edit one when `costCenterId` is given. */
export function useSaveCostCenterMutation({ merchantId, costCenterId }: { merchantId: string; costCenterId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: CostCenterValues) => {
      if (costCenterId) {
        await supabase.from('cost_centers').update(row(values)).eq('id', costCenterId).throwOnError();
      } else {
        await supabase.from('cost_centers').insert({ merchant_id: merchantId, ...row(values) }).throwOnError();
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: costCentersKey.lists() });
    },
  });
}

/** Refused with 23503 while cost centers sit under it, and for the root (private.validate_tree). */
export function useDeleteCostCenterMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('cost_centers').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: costCentersKey.lists() });
    },
  });
}
