import type { Enums } from '../../lib/database.types';
import type { MeasureUnit, ProductType } from './schema';

/**
 * The Resources split. One shell destination became three, and each of them owns
 * the product types, categories, units and Setup lists that belong to it:
 *
 *   Products    flat services                     — a delivery fee, an installation
 *   Rentables   rental assets, bookable services  — a bike, a meeting room
 *   Inventory   stock and consumables             — a shelf item, a kitchen ingredient
 *
 * `scope` is a column on both products and product_categories, written by the database from the
 * product's type, so a Rentables product cannot point at an Inventory category. This file is the
 * client's half of the same fact, and the only place the three screens differ: the list, the form, the
 * detail and Setup are one implementation each, parameterised by what is below (instruction_mds/structure.md §3).
 */
export type ResourceScope = Enums<'category_scope'>;

export type SetupList = 'categories' | 'taxClasses' | 'suppliers';

type ResourceMeta = {
  /** The page header's title, and the drawer label. */
  title: string;
  /** Singular, for "Add a rentable", "This product is …". */
  item: string;
  /** The types this screen creates. More than one means the merchant picks before the form opens. */
  types: ProductType[];
  /**
   * The units this screen offers. A value stored before the split still renders — UNIT_META reads
   * every unit — it is simply no longer offered here.
   */
  units: MeasureUnit[];
  /** Which lists its Setup screen manages. */
  setup: SetupList[];
};

export const RESOURCE_META = {
  products: {
    title: 'Products',
    item: 'product',
    types: ['flat'],
    units: ['piece', 'hour', 'session'],
    setup: ['categories', 'taxClasses'],
  },
  rentables: {
    title: 'Rentables',
    item: 'rentable',
    types: ['rental', 'bookable'],
    units: ['hour', 'day', 'week', 'month', 'night', 'session', 'piece'],
    setup: ['categories', 'taxClasses'],
  },
  inventory: {
    title: 'Inventory',
    item: 'item',
    types: ['stock'],
    units: ['piece', 'box', 'pack', 'kg', 'g', 'l', 'ml'],
    setup: ['categories', 'suppliers'],
  },
} satisfies Record<ResourceScope, ResourceMeta>;

/**
 * A route param is a string anyone can put in a URL, so a scope read from one is checked against the
 * three that exist rather than trusted — an unknown one would otherwise reach an insert as a bad enum.
 */
export function isResourceScope(raw: string | undefined): raw is ResourceScope {
  return raw !== undefined && Object.hasOwn(RESOURCE_META, raw);
}

/** Which screen a saved product belongs to. The same mapping the database writes into products.scope. */
export function scopeOfType(type: ProductType): ResourceScope {
  if (type === 'stock') return 'inventory';
  if (type === 'rental' || type === 'bookable') return 'rentables';
  return 'products';
}

/**
 * The route base for a screen. Written out per scope rather than built from a template literal: these
 * are expo-router's typed route strings, and a built string is just `string` to it.
 */
export const RESOURCE_ROUTE = {
  products: {
    list: '/systems/[id]/products',
    new: '/systems/[id]/products/new',
    setup: '/systems/[id]/products/setup',
    detail: '/systems/[id]/products/[productId]',
    edit: '/systems/[id]/products/[productId]/edit',
  },
  rentables: {
    list: '/systems/[id]/rentables',
    new: '/systems/[id]/rentables/new',
    setup: '/systems/[id]/rentables/setup',
    detail: '/systems/[id]/rentables/[productId]',
    edit: '/systems/[id]/rentables/[productId]/edit',
  },
  inventory: {
    list: '/systems/[id]/inventory',
    new: '/systems/[id]/inventory/new',
    setup: '/systems/[id]/inventory/setup',
    detail: '/systems/[id]/inventory/[productId]',
    edit: '/systems/[id]/inventory/[productId]/edit',
  },
} as const;
