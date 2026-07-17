-- Payment Terminal Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_enc      TEXT NOT NULL,
  email_enc     TEXT NOT NULL,
  email_hmac    TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'agent')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_enc    TEXT NOT NULL,
  name_hmac   TEXT NOT NULL,
  email_enc   TEXT,
  email_hmac  TEXT,
  phone_enc   TEXT,
  company_enc TEXT,
  address_enc TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_name_hmac  ON customers (name_hmac);
CREATE INDEX IF NOT EXISTS idx_customers_email_hmac ON customers (email_hmac);

CREATE TABLE IF NOT EXISTS stripe_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  publishable_key  TEXT NOT NULL,
  secret_key_enc   TEXT NOT NULL,
  daily_limit_cents INTEGER NOT NULL DEFAULT 100000 CHECK (daily_limit_cents > 0),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID REFERENCES customers(id),
  stripe_account_id UUID NOT NULL REFERENCES stripe_accounts(id),
  amount_cents      INTEGER NOT NULL CHECK (amount_cents >= 100 AND amount_cents <= 5000000),
  stripe_pi_id      TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
  last4_enc         TEXT,
  card_brand_enc    TEXT,
  notes_enc         TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_customer    ON transactions (customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account     ON transactions (stripe_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at  ON transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_date_status ON transactions (stripe_account_id, status, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id),
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  meta_enc   TEXT,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_ip_action ON audit_log (ip, action, created_at DESC);
