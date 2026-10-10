// The tree masters (Chart of Accounts, Cost Centers, Warehouses, Item Groups) are flat rows with a parent_id; these are the walks their
// folder screens and forms need. Import-free, so tools/check-logic.mjs asserts them under Node. The database
// keeps the trees acyclic (private.validate_tree), so the walks need no cycle guard.

export type TreeRow = { id: string; parent_id: string | null };

/**
 * The rows directly under `parent`. Null asks for the top: the roots, and any row whose parent is not in
 * `rows` — a User Permission can hold someone to one branch, and its parents are then hidden from them.
 */
export function childrenOf<T extends TreeRow>(rows: T[], parent: string | null) {
  if (parent !== null) return rows.filter((row) => row.parent_id === parent);
  const ids = new Set(rows.map((row) => row.id));
  return rows.filter((row) => row.parent_id === null || !ids.has(row.parent_id));
}

/** The path from a root down to `id`, `id` last. Empty for no id, or one not in `rows`. */
export function pathTo<T extends TreeRow>(rows: T[], id: string | undefined) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const path: T[] = [];
  for (let row = id ? byId.get(id) : undefined; row; row = row.parent_id ? byId.get(row.parent_id) : undefined) path.unshift(row);
  return path;
}

/** `id` and every row under it, at any depth: the rows it cannot be moved under. */
export function subtree(rows: TreeRow[], id: string) {
  const ids = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const row of rows) {
      if (row.parent_id && ids.has(row.parent_id) && !ids.has(row.id)) {
        ids.add(row.id);
        grew = true;
      }
    }
  }
  return ids;
}
