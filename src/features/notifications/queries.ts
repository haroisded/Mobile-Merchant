import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { invalidateAccessCodes } from '../access-codes/queries';
import { invalidateAccessRequests } from '../access-requests/queries';
import { invalidateMembers } from '../members/queries';
import { invalidateMerchants } from '../merchants/queries';
import { invalidatePermissions } from '../role-permissions/queries';

// The signed-in person's notifications. Written only by the database's triggers
// (supabase/migrations/20261013213537_access_codes.sql); a person reads, marks and clears their own. The only file
// that knows the table is called `notifications` (.claude/instruction_mds/data-layer.md rules 2-3).
const notificationsKey = {
  all: ['notifications'],
  lists: () => [...notificationsKey.all, 'list'],
  unread: () => [...notificationsKey.all, 'unread'],
};

export function useNotificationsQuery() {
  return useQuery({
    queryKey: notificationsKey.lists(),
    queryFn: async () => {
      // ponytail: the newest 100. Older ones need paging, when anyone keeps that many.
      const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100).throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.ONE,
    refetchOnWindowFocus: true,
  });
}

export type Notification = NonNullable<ReturnType<typeof useNotificationsQuery>['data']>[number];

/**
 * The unread ones: the tab's badge and the bells. Nothing pushes them (no Realtime), so they are asked for every minute
 * and on coming back to the app. A new one means someone acted — an owner let the caller in, changed what they may do
 * or removed them, someone used a code — so whatever it is about is fetched again: the systems list, the caller's
 * permissions, requests, codes, members. Checked against
 * the last answer here, in the fetch, so the tab bar and each bell reading this do not each set it off.
 */
export function useUnreadNotificationsQuery() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: notificationsKey.unread(),
    queryFn: async () => {
      const { data } = await supabase.from('notifications').select('id').is('read_at', null).order('created_at', { ascending: false }).throwOnError();
      const before = queryClient.getQueryData<typeof data>(notificationsKey.unread());
      if (before && data.some((row) => !before.some((old) => old.id === row.id))) {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: notificationsKey.lists() }),
          invalidateMerchants(queryClient),
          invalidatePermissions(queryClient),
          invalidateAccessRequests(queryClient),
          invalidateAccessCodes(queryClient),
          invalidateMembers(queryClient),
        ]);
      }
      return data;
    },
    staleTime: STALE.MINUTES.ONE,
    refetchInterval: STALE.MINUTES.ONE,
    refetchOnWindowFocus: true,
  });
}

/** Mark some read, or every unread one with `all`. */
export function useMarkNotificationsReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: readonly string[] | 'all') => {
      const unread = supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
      await (ids === 'all' ? unread : unread.in('id', ids)).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationsKey.all });
    },
  });
}
