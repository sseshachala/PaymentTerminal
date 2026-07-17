import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { encrypt } from '@/lib/encrypt'

const AccountSchema = z.object({
  name: z.string().min(1).max(100),
  publishableKey: z.string().startsWith('pk_'),
  secretKey: z.string().startsWith('sk_'),
  dailyLimitCents: z.number().int().min(10000).max(500000),
})

// Admin only
async function requireAdmin(session: any) {
  return session?.user && (session.user as any).role === 'admin'
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !(await requireAdmin(session)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rows = await sql`
    SELECT id, name, publishable_key, daily_limit_cents, is_active, created_at,
      COALESCE((
        SELECT SUM(amount_cents) FROM transactions
        WHERE stripe_account_id = sa.id
          AND status = 'succeeded'
          AND created_at::date = CURRENT_DATE
      ), 0)::int AS used_today_cents
    FROM stripe_accounts sa
    ORDER BY created_at ASC
  ` as any[]

  return NextResponse.json(rows.map((r) => ({
    id: r.id,
    name: r.name,
    publishableKey: r.publishable_key,
    dailyLimitCents: r.daily_limit_cents,
    isActive: r.is_active,
    usedTodayCents: r.used_today_cents,
  })))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !(await requireAdmin(session)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const parsed = AccountSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { name, publishableKey, secretKey, dailyLimitCents } = parsed.data

  const rows = await sql`
    INSERT INTO stripe_accounts (name, publishable_key, secret_key_enc, daily_limit_cents)
    VALUES (${name}, ${publishableKey}, ${encrypt(secretKey)}, ${dailyLimitCents})
    RETURNING id
  ` as any[]

  return NextResponse.json({ id: rows[0].id }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !(await requireAdmin(session)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, isActive } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await sql`UPDATE stripe_accounts SET is_active = ${isActive} WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}
