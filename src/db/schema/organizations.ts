import { pgTable, text, timestamp, jsonb, boolean, uuid, varchar } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  industry: text('industry').notNull(),
  plan: text('plan').notNull().default('free'),
  settings: jsonb('settings').notNull().default({
    inventory: {
      lowStockThreshold: 20,
      autoReorderEnabled: false,
      barcodeFormat: 'CODE128',
      enableExpiryTracking: false,
      enableBatchTracking: false,
    },
    notifications: {
      email: true,
      sms: false,
      push: true,
      lowStockAlerts: true,
      orderUpdates: true,
    },
    integrations: {
      ai: {
        enabled: false,
        providers: [],
      },
    },
    customFields: [],
  }),
  features: jsonb('features').notNull().default([]),
  logo: text('logo'),
  timezone: text('timezone').notNull().default('UTC'),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  locale: text('locale').notNull().default('en-US'),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});