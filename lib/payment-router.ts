import { sql } from './db'
import { decrypt } from './encrypt'

export type Provider = 'stripe' | 'square'

export interface ActiveAccount {
  id: string
  name: string
  location: string
  provider: Provider
  dailyLimitCents: number
  usedTodayCents: number
  // Stripe
  publishableKey?: string
  // Square
  applicationId?: string
  locationId?: string
  sandbox?: boolean
}

export async function listActiveAccounts(): Promise<ActiveAccount[]> {
  const rows = await sql`
    SELECT
      pa.id, pa.name, pa.location, pa.provider,
      pa.publishable_key, pa.extra_enc,
      pa.daily_limit_cents,
      COALESCE(SUM(t.amount_cents) FILTER (
        WHERE t.status = 'succeeded' AND t.created_at::date = CURRENT_DATE
      ), 0)::int AS used_today_cents
    FROM payment_accounts pa
    LEFT JOIN transactions t ON t.payment_account_id = pa.id
    WHERE pa.is_active = true
    GROUP BY pa.id
    ORDER BY pa.location ASC, pa.name ASC
  ` as any[]

  return rows.map((r) => {
    const base = {
      id: r.id,
      name: r.name,
      location: r.location,
      provider: r.provider as Provider,
      dailyLimitCents: r.daily_limit_cents,
      usedTodayCents: r.used_today_cents,
    }
    if (r.provider === 'square') {
      const extra = r.extra_enc ? JSON.parse(decrypt(r.extra_enc)) : {}
      return { ...base, applicationId: r.publishable_key, locationId: extra.locationId, sandbox: extra.sandbox === 'true' }
    }
    return { ...base, publishableKey: r.publishable_key }
  })
}

export async function getAccountCredentials(accountId: string): Promise<{
  provider: Provider; secretKey: string; extra: Record<string, string>
} | null> {
  const rows = await sql`
    SELECT provider, secret_key_enc, extra_enc
    FROM payment_accounts WHERE id = ${accountId} AND is_active = true
  ` as any[]
  if (!rows[0]) return null
  const r = rows[0]
  const extra = r.extra_enc ? JSON.parse(decrypt(r.extra_enc)) : {}
  return { provider: r.provider as Provider, secretKey: decrypt(r.secret_key_enc), extra }
}
