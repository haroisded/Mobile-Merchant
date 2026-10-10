import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { pathTo } from '../../lib/tree';
import type { WarehouseValues } from './schema';

export type Warehouse = Tables<'warehouses'>;

/** "Stores - CC": ERPNext's warehouse name, the company's abbreviation after. The root is every warehouse's, so it carries none. */
export const warehouseLabel = (warehouse: Warehouse, abbr: string) =>
  warehouse.parent_id === null ? warehouse.warehouse_name : `${warehouse.warehouse_name} - ${abbr}`;

/** Enabled ledger warehouses as picker options, None first; `keep` as in accounts' ledgerOptions. */
export const warehouseOptions = (warehouses: Warehouse[], abbr: string, keep?: string | null) => [
  { value: '', label: 'None' },
  ...warehouses
    .filter((warehouse) => warehouse.id === keep || (!warehouse.is_group && !warehouse.disabled))
    .map((warehouse) => ({ value: warehouse.id, label: warehouseLabel(warehouse, abbr) })),
];

/**
 * The Stock ledger a warehouse's stock value posts to (docs "Linking stock warehouse and accounts"): its own
 * account, else the nearest parent's, else the Company's Default Inventory Account. `from` is the warehouse
 * that set it — undefined when it is the Company's. Null when none of them names one.
 */
export function inventoryAccount(warehouses: Warehouse[], warehouseId: string, companyDefault: string | null) {
  const from = pathTo(warehouses, warehouseId).findLast((warehouse) => warehouse.account !== null);
  if (from?.account) return { account: from.account, from };
  return companyDefault ? { account: companyDefault, from: undefined } : null;
}

// The only file that knows the table is called `warehouses` (.claude/instruction_mds/data-layer.md rules 2-3).
const warehousesKey = {
  all: ['warehouses'],
  lists: () => [...warehousesKey.all, 'list'],
  list: (args: { merchantId: string }) => [...warehousesKey.lists(), args],
};

/** A system's whole Warehouse tree, flat; the screens walk it with src/lib/tree.ts. */
export function useWarehousesQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: warehousesKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('warehouses').select('*').eq('merchant_id', merchantId).order('warehouse_name').throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

const row = (values: WarehouseValues) => ({ ...values, parent_id: values.parent_id || null, account: values.account || null });

/** Create a warehouse, or edit one when `warehouseId` is given. */
export function useSaveWarehouseMutation({ merchantId, warehouseId }: { merchantId: string; warehouseId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: WarehouseValues) => {
      if (warehouseId) {
        await supabase.from('warehouses').update(row(values)).eq('id', warehouseId).throwOnError();
      } else {
        await supabase.from('warehouses').insert({ merchant_id: merchantId, ...row(values) }).throwOnError();
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: warehousesKey.lists() });
    },
  });
}

/** Refused with 23503 while warehouses sit under it (warehouses_parent_fk) or a brand names it. */
export function useDeleteWarehouseMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('warehouses').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: warehousesKey.lists() });
    },
  });
}
