import { useMembersQuery } from '../../features/members/queries';
import { usePermissionCatalogQuery } from '../../features/permissions/queries';
import { useRolesQuery } from '../../features/roles/queries';

/**
 * The three lists every Employees screen reads — the employees, the roles and the permission catalog — as one
 * query for QueryState: loaded once all three are, failed if any one did.
 */
export function useEmployees(merchantId: string) {
  const members = useMembersQuery({ merchantId });
  const roles = useRolesQuery({ merchantId });
  const catalog = usePermissionCatalogQuery();
  const queries = [members, roles, catalog];

  return {
    data: members.data && roles.data && catalog.data ? { members: members.data, roles: roles.data, catalog: catalog.data } : undefined,
    isPaused: queries.some((query) => query.isPaused),
    isPending: queries.some((query) => query.isPending),
    isError: queries.some((query) => query.isError),
    refetch: () => {
      for (const query of queries) if (query.isError) void query.refetch();
    },
  };
}

export type EmployeesData = NonNullable<ReturnType<typeof useEmployees>['data']>;
