// What public.my_permissions answers, and what the screens and the Employees editors decide from it. Import-free:
// asserted in tools/check-logic.mjs. The database decides (private.my_permission_keys() and
// private.permitted_merchant_ids(), 20261014034106_employees_and_permissions.sql); this mirrors it.

/**
 * ERPNext's permission types. `select` is a lookup a screen needs — a field's options, a price — and `read`
 * what a person may open; submit and cancel mean something on a document only.
 */
export type Ptype = 'select' | 'read' | 'write' | 'create' | 'delete' | 'submit' | 'cancel';

export type DoctypePermissions = Record<Ptype, boolean>;

/** What public.my_permissions returns: who owns the system, what the caller may do per doctype, and the keys they hold. */
export type Permissions = {
  is_owner: boolean;
  owner_email: string | null;
  owner_name: string | null;
  perms: Record<string, DoctypePermissions>;
  permissions: string[];
};

type Loaded = Permissions | null | undefined;

/** Whether `permissions` allow `ptype` on `doctype`. False while they load: a control appears, never vanishes. */
export function can(permissions: Loaded, doctype: string, ptype: Ptype) {
  if (!permissions) return false;
  if (permissions.is_owner) return true;
  return permissions.perms[doctype]?.[ptype] ?? false;
}

/** Whether the caller holds the permission `key` (public.permissions). The owner holds every one. */
export function has(permissions: Loaded, key: string) {
  if (!permissions) return false;
  return permissions.is_owner || permissions.permissions.includes(key);
}

/** A row of an index: the doctype whose permission shows it — Read, unless the row is an action. */
export type IndexRule = { doctype: string; ptype?: Ptype };

/** Whether these permissions may open `entry`'s page. */
export const opens = (entry: IndexRule, permissions: Loaded) => can(permissions, entry.doctype, entry.ptype ?? 'read');

/** Whether these permissions may open any row of an index. */
export const readsAny = (sections: { entries: IndexRule[] }[], permissions: Loaded) =>
  sections.some((section) => section.entries.some((entry) => opens(entry, permissions)));

/**
 * A rail destination's rule: an index whose rows someone may open, permissions one of which they hold, or the
 * owner's alone. With none of them — Home — it always shows.
 */
export type DestinationRule = { sections?: { entries: IndexRule[] }[]; permissions?: string[]; ownerOnly?: boolean };

export function showsDestination(rule: DestinationRule, permissions: Loaded) {
  if (permissions?.is_owner) return true;
  if (rule.ownerOnly) return false;
  if (!rule.sections && !rule.permissions) return true;
  return (rule.sections !== undefined && readsAny(rule.sections, permissions)) || (rule.permissions ?? []).some((key) => has(permissions, key));
}

/** A permission as the editors need it: its key and the one it requires (public.permissions.requires). */
export type Requirement = { key: string; requires: string | null };

/**
 * `keys` less every permission whose requirement is not kept, all the way down — a permission counts only with
 * the one it requires. Catalog order out.
 */
function withRequirements(catalog: Requirement[], keys: Set<string>) {
  const kept = new Set<string>();
  // The catalog may list a permission before the one it requires: go round until nothing more is kept.
  for (let grew = true; grew; ) {
    grew = false;
    for (const entry of catalog) {
      if (keys.has(entry.key) && !kept.has(entry.key) && (!entry.requires || kept.has(entry.requires))) {
        kept.add(entry.key);
        grew = true;
      }
    }
  }
  return catalog.filter((entry) => kept.has(entry.key)).map((entry) => entry.key);
}

/**
 * A switch turned on brings every permission it requires; turned off, it takes every permission that requires
 * it — the sets save_role and save_member_access accept.
 */
export function toggle(catalog: Requirement[], keys: string[], key: string, on: boolean) {
  const next = new Set(keys);
  if (on) {
    const requires = new Map(catalog.map((entry) => [entry.key, entry.requires]));
    for (let current: string | null | undefined = key; current; current = requires.get(current)) next.add(current);
  } else {
    next.delete(key);
  }
  return withRequirements(catalog, next);
}

/** One employee's exception to their role (public.member_overrides). */
export type Override = { permission: string; allowed: boolean };

/** What an employee holds: their role's permissions, less what an exception turns off, plus what one turns on. */
export function effective(catalog: Requirement[], roleKeys: string[], overrides: Override[]) {
  const keys = new Set(roleKeys);
  for (const override of overrides) {
    if (override.allowed) keys.add(override.permission);
    else keys.delete(override.permission);
  }
  return withRequirements(catalog, keys);
}

/** The exceptions that turn the role's permissions into `wanted`: one only where they differ. */
export function overridesFor(catalog: Requirement[], roleKeys: string[], wanted: string[]): Override[] {
  return catalog
    .filter((entry) => roleKeys.includes(entry.key) !== wanted.includes(entry.key))
    .map((entry) => ({ permission: entry.key, allowed: wanted.includes(entry.key) }));
}
