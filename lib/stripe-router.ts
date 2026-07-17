import Stripe from 'stripe'
import { sql } from './db'
import { decrypt } from './encrypt'

export interface ActiveAccount {
  id: string
  name: string
  publishableKey: string
  dailyLimitCents: number
  usedTodayCents: number
}

// Returns the account with the most remaining daily headroom
export async function getActiveAccount(): Promise<ActiveAccount | null> {
  const rows = await sql`
    SELECT
      sa.id,
      sa.name,
      sa.publishable_key,
      sa.secret_key_enc,
      sa.daily_limit_cents,
      COALESCE(SUM(t.amount_cents) FILTER (
        WHERE t.status = 'succeeded' AND t.created_at::date = CURRENT_DATE
      ), 0)::int AS used_today_cents
    FROM stripe_accounts sa
    LEFT JOIN transactions t ON t.stripe_account_id = sa.id
    WHERE sa.is_active = true
    GROUP BY sa.id
    HAVING sa.daily_limit_cents > COALESCE(SUM(t.amount_cents) FILTER (
      WHERE t.status = 'succeeded' AND t.created_at::date = CURRENT_DATE
    ), 0)
    ORDER BY used_today_cents ASC
    LIMIT 1
  ` as any[]

  if (!rows[0]) return null

  const row = rows[0]
  return {
    id: row.id,
    name: row.name,
    publishableKey: row.publishable_key,
    dailyLimitCents: row.daily_limit_cents,
    usedTodayCents: row.used_today_cents,
  }
}

export async function getStripeClient(accountId: string): Promise<Stripe | null> {
  const rows = await sql`
    SELECT secret_key_enc FROM stripe_accounts WHERE id = ${accountId} AND is_active = true
  ` as any[]
  if (!rows[0]) return null
  const secretKey = decrypt(rows[0].secret_key_enc)
  return new Stripe(secretKey)
}
