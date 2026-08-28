import type { DatabaseSync } from "node:sqlite";

export function applySchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_profile_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','member')),
      is_active INTEGER NOT NULL DEFAULT 1,
      color TEXT NOT NULL DEFAULT '#2456e6',
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      owner_profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      scope TEXT NOT NULL CHECK (scope IN ('personal','shared'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('income','expense','both')),
      is_default INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('income','expense','credit_card_settlement')),
      source TEXT NOT NULL DEFAULT 'manual',
      amount INTEGER NOT NULL,
      category_id TEXT,
      wallet_id TEXT,
      payment_method TEXT,
      credit_card_id TEXT,
      occurred_at TEXT NOT NULL,
      merchant TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      owner_profile_id TEXT,
      created_by TEXT,
      bill_id TEXT,
      installment_id TEXT,
      attachment_json TEXT,
      items_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('regular','recurring','debt','receivable','installment','credit_card_statement')),
      amount INTEGER NOT NULL,
      paid_amount INTEGER NOT NULL DEFAULT 0,
      category_id TEXT,
      wallet_id TEXT,
      credit_card_id TEXT,
      counterparty TEXT,
      frequency TEXT,
      due_day INTEGER,
      due_date TEXT,
      last_paid_period TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      owner_profile_id TEXT,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS installments (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      bill_id TEXT REFERENCES bills(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      total_amount INTEGER NOT NULL,
      installment_amount INTEGER NOT NULL,
      tenor INTEGER NOT NULL,
      paid_count INTEGER NOT NULL DEFAULT 0,
      start_date TEXT NOT NULL,
      due_day INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_cards (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      issuer TEXT NOT NULL,
      last_four TEXT NOT NULL,
      statement_day INTEGER NOT NULL,
      due_day INTEGER NOT NULL,
      credit_limit INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS statements (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      credit_card_id TEXT REFERENCES credit_cards(id) ON DELETE CASCADE,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      statement_amount INTEGER NOT NULL,
      official_amount INTEGER,
      paid_amount INTEGER NOT NULL DEFAULT 0,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','issued','overdue','paid'))
    );

    CREATE TABLE IF NOT EXISTS credit_card_statement_items (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      statement_id TEXT NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
      transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
      amount INTEGER NOT NULL,
      item_type TEXT NOT NULL CHECK (item_type IN ('purchase','installment','fee','interest','refund','adjustment')),
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(statement_id, transaction_id)
    );

    CREATE INDEX IF NOT EXISTS idx_stmt_items_statement ON credit_card_statement_items(statement_id);
    CREATE INDEX IF NOT EXISTS idx_stmt_items_transaction ON credit_card_statement_items(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_stmt_items_group ON credit_card_statement_items(group_id);

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      category_id TEXT,
      amount INTEGER NOT NULL,
      owner_profile_id TEXT
    );

    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('receipt_ocr','telegram','whatsapp','hermes')),
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income','expense')),
      amount INTEGER NOT NULL,
      category_id TEXT,
      wallet_id TEXT,
      occurred_at TEXT,
      merchant TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      items_json TEXT NOT NULL DEFAULT '[]',
      attachment_json TEXT,
      uncertain_fields_json TEXT NOT NULL DEFAULT '[]',
      validation_messages_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','rejected')),
      owner_profile_id TEXT,
      created_at TEXT NOT NULL,
      reviewed_by TEXT,
      reviewed_at TEXT,
      approved_by TEXT,
      approved_at TEXT,
      rejected_reason TEXT,
      transaction_id TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('due','overdue','draft','system')),
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      link_to TEXT NOT NULL DEFAULT '',
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS telegram_chat_links (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      chat_id TEXT NOT NULL UNIQUE,
      profile_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value_json TEXT NOT NULL DEFAULT '{}',
      UNIQUE (group_id, key)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      group_id TEXT,
      profile_id TEXT,
      action TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_pending (
      chat_id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      context TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_group ON transactions(group_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_bills_group ON bills(group_id);
    CREATE INDEX IF NOT EXISTS idx_drafts_group ON drafts(group_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_group ON notifications(group_id);
  `);
}
