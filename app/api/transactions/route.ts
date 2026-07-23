import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { decrypt, decryptMaybe } from '@/lib/encrypt'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? 1))
  const limit = 25
  const offset = (page - 1) * limit

  const rows = await sql`
    SELECT
      t.id, t.amount_cents, t.status, t.provider_tx_id, t.created_at,
      t.last4_enc, t.card_brand_enc,
      COALESCE(SUM(r.amount_cents), 0)::int AS refunded_cents,
      c.name_enc  AS customer_name_enc,
      pa.name     AS account_name,
      pa.provider AS account_provider,
      u.name_enc  AS agent_name_enc
    FROM transactions t
    LEFT JOIN refunds r ON r.transaction_id = t.id
    LEFT JOIN customers c ON c.id = t.customer_id
    LEFT JOIN payment_accounts pa ON pa.id = t.payment_account_id
    LEFT JOIN users u ON u.id = t.created_by
    GROUP BY t.id, c.name_enc, pa.name, pa.provider, u.name_enc
    ORDER BY t.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  ` as any[]

  const total = await sql`SELECT COUNT(*) AS n FROM transactions` as any[]

  const data = rows.map((r) => ({
    id: r.id,
    amountCents: r.amount_cents,
    amountDisplay: `$${(r.amount_cents / 100).toFixed(2)}`,
    refundedCents: r.refunded_cents,
    status: r.status,
    providerTxId: r.provider_tx_id,
    createdAt: r.created_at,
    last4: decryptMaybe(r.last4_enc) ?? '****',
    cardBrand: decryptMaybe(r.card_brand_enc) ?? '',
    accountProvider: r.account_provider,
    customerName: r.customer_name_enc ? decrypt(r.customer_name_enc) : 'Unknown',
    accountName: r.account_name,
    agentName: r.agent_name_enc ? decrypt(r.agent_name_enc) : '',
  }))

  return NextResponse.json({ data, total: Number(total[0].n), page, limit })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await sql`DELETE FROM transactions WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}
