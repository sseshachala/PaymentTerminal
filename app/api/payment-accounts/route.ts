import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { encrypt } from '@/lib/encrypt'

const StripeSchema = z.object({
  provider: z.literal('stripe'),
  name: z.string().min(1).max(100),
  publishableKey: z.string().startsWith('pk_'),
  secretKey: z.string().startsWith('sk_'),
  dailyLimitCents: z.number().int().min(10000).max(500000),
})

const SquareSchema = z.object({
  provider: z.literal('square'),
  name: z.string().min(1).max(100),
  applicationId: z.string().min(1),
  accessToken: z.string().min(1),
  locationId: z.string().min(1),
  sandbox: z.boolean().default(false),
  dailyLimitCents: z.number().int().min(10000).max(500000),
})

const AccountSchema = z.discriminatedUnion('provider', [StripeSchema, SquareSchema])

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === 'admin'
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rows = await sql`
    SELECT pa.id, pa.name, pa.provider, pa.publishable_key, pa.daily_limit_cents, pa.is_active, pa.created_at,
      COALESCE((
        SELECT SUM(amount_cents) FROM transactions
        WHERE payment_account_id = pa.id AND status = 'succeeded' AND created_at::date = CURRENT_DATE
      ), 0)::int AS used_today_cents
    FROM payment_accounts pa
    ORDER BY pa.created_at ASC
  ` as any[]

  return NextResponse.json(rows.map((r) => ({
    id: r.id,
    name: r.name,
    provider: r.provider,
    publishableKey: r.publishable_key,
    dailyLimitCents: r.daily_limit_cents,
    isActive: r.is_active,
    usedTodayCents: r.used_today_cents,
  })))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const parsed = AccountSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const d = parsed.data

  if (d.provider === 'stripe') {
    const rows = await sql`
      INSERT INTO payment_accounts (name, provider, publishable_key, secret_key_enc, daily_limit_cents)
      VALUES (${d.name}, 'stripe', ${d.publishableKey}, ${encrypt(d.secretKey)}, ${d.dailyLimitCents})
      RETURNING id
    ` as any[]
    return NextResponse.json({ id: rows[0].id }, { status: 201 })
  }

  // Square — applicationId stored as publishable_key (it's public), accessToken encrypted as secret_key_enc
  // locationId + sandbox stored in extra_enc
  const extra = JSON.stringify({ locationId: d.locationId, sandbox: String(d.sandbox) })
  const rows = await sql`
    INSERT INTO payment_accounts (name, provider, publishable_key, secret_key_enc, extra_enc, daily_limit_cents)
    VALUES (${d.name}, 'square', ${d.applicationId}, ${encrypt(d.accessToken)}, ${encrypt(extra)}, ${d.dailyLimitCents})
    RETURNING id
  ` as any[]
  return NextResponse.json({ id: rows[0].id }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, isActive, name, dailyLimitCents } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  if (isActive !== undefined) {
    await sql`UPDATE payment_accounts SET is_active = ${isActive} WHERE id = ${id}`
  }
  if (name !== undefined) {
    await sql`UPDATE payment_accounts SET name = ${name} WHERE id = ${id}`
  }
  if (dailyLimitCents !== undefined) {
    await sql`UPDATE payment_accounts SET daily_limit_cents = ${dailyLimitCents} WHERE id = ${id}`
  }
  return NextResponse.json({ ok: true })
}
