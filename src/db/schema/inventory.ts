import { pgTable, text, timestamp, jsonb, uuid, varchar, integer, decimal, date, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { users } from './users';

export const inventoryItems = pgTable('inventory_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  sku: varchar('sku', { length: 255 }).notNull(),
  barcode: text('barcode'),
  quantity: integer('quantity').notNull().default(0),
  minQuantity: integer('min_quantity').notNull().default(0),
  maxQuantity: integer('max_quantity'),
  unit: text('unit').notNull(),
  category: text('category').notNull(),
  subcategory: text('subcategory'),
  location: text('location').notNull(),
  sublocation: text('sublocation'),
  cost: decimal('cost', { precision: 10, scale: 2 }),
  price: decimal('price', { precision: 10, scale: 2 }),
  supplier: text('supplier'),
  metadata: jsonb('metadata'),
  tags: jsonb('tags').notNull().default([]),
  images: jsonb('images').notNull().default([]),
  lastCountedAt: timestamp('last_counted_at'),
  expiryDate: date('expiry_date'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => {
  return {
    orgSkuIdx: index('org_sku_idx').on(table.organizationId, table.sku),
    orgCategoryIdx: index('org_category_idx').on(table.organizationId, table.category),
    orgLocationIdx: index('org_location_idx').on(table.organizationId, table.location),
  };
});

export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  itemId: uuid('item_id').notNull().references(() => inventoryItems.id),
  type: text('type').notNull(), // in, out, adjustment, transfer
  quantity: integer('quantity').notNull(),
  fromLocation: text('from_location'),
  toLocation: text('to_location'),
  reason: text('reason'),
  reference: text('reference'),
  userId: uuid('user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const inventoryCounts = pgTable('inventory_counts', {
  id: uuid('id').primaryKey().defaultRandom(),
  itemId: uuid('item_id').notNull().references(() => inventoryItems.id),
  expectedQuantity: integer('expected_quantity').notNull(),
  actualQuantity: integer('actual_quantity').notNull(),
  variance: integer('variance').notNull(),
  location: text('location').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  parentId: uuid('parent_id'),
  icon: text('icon'),
  color: text('color'),
  sortOrder: integer('sort_order').notNull().default(0),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  code: varchar('code', { length: 50 }).notNull(),
  type: text('type').notNull(), // warehouse, store, storage, other
  address: text('address'),
  parentId: uuid('parent_id'),
  capacity: integer('capacity'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});