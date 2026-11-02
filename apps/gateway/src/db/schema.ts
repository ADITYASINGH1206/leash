import {
  pgTable,
  varchar,
  text,
  numeric,
  timestamp,
  serial,
  real,
  jsonb,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: varchar('id', { length: 64 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  paypalVaultId: varchar('paypal_vault_id', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const merchants = pgTable('merchants', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  domain: varchar('domain', { length: 255 }).notNull(),
  paypalPayeeEmail: varchar('paypal_payee_email', { length: 255 }),
  reputationScore: real('reputation_score').default(1.0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const mandates = pgTable('mandates', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 })
    .references(() => users.id)
    .notNull(),
  publicKey: text('public_key'),
  intentText: varchar('intent_text', { length: 500 }).notNull(),
  maxAmount: numeric('max_amount', { precision: 10, scale: 2 }).notNull(),
  spentAmount: numeric('spent_amount', { precision: 10, scale: 2 }).default('0.00').notNull(),
  currency: varchar('currency', { length: 3 }).default('USD').notNull(),
  validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 32 }).default('ACTIVE').notNull(), // ACTIVE, EXHAUSTED, REVOKED
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const carts = pgTable('carts', {
  id: varchar('id', { length: 64 }).primaryKey(),
  merchantId: varchar('merchant_id', { length: 64 })
    .references(() => merchants.id)
    .notNull(),
  itemsJson: text('items_json').notNull(),
  rawHash: varchar('raw_hash', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const transactions = pgTable('transactions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  mandateId: varchar('mandate_id', { length: 64 })
    .references(() => mandates.id)
    .notNull(),
  merchantId: varchar('merchant_id', { length: 64 })
    .references(() => merchants.id)
    .notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('USD').notNull(),
  verdict: varchar('verdict', { length: 16 }).notNull(), // ALLOW, HOLD, DENY
  status: varchar('status', { length: 32 }).default('PENDING').notNull(), // PENDING, HELD, AUTHORIZED, CAPTURED, VOIDED, REFUNDED
  paypalOrderId: varchar('paypal_order_id', { length: 64 }),
  paypalAuthId: varchar('paypal_auth_id', { length: 64 }),
  paypalCaptureId: varchar('paypal_capture_id', { length: 64 }),
  holdReason: text('hold_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const ledger = pgTable('ledger', {
  seq: serial('seq').primaryKey(),
  ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
  kind: varchar('kind', { length: 64 }).notNull(),
  refId: varchar('ref_id', { length: 64 }).notNull(),
  payload: jsonb('payload').notNull(),
  prevHash: varchar('prev_hash', { length: 64 }).notNull(),
  hash: varchar('hash', { length: 64 }).notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type MerchantRow = typeof merchants.$inferSelect;
export type MandateRow = typeof mandates.$inferSelect;
export type CartRow = typeof carts.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type DbLedgerRow = typeof ledger.$inferSelect;
