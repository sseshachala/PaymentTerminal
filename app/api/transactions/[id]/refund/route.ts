import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { decrypt, encrypt } from '@/lib/encrypt'
import Stripe from 'stripe'
import { SquareClient, SquareEnvironment } from 'square'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { amountCents } = await req.json().catch(() => ({} as any))
  if (!amountCents || amountCents < 1) return NextResponse.json({ error: 'amountCents required' }, { status: 400 })

  const txRows = await sql`
    SELECT t.id, t.amount_cents, t.provider_tx_id, t.payment_account_id, t.status,
      COALESCE(SUM(r.amount_cents), 0)::int AS refunded_cents
    FROM transactions t
    LEFT JOIN refunds r ON r.transaction_id = t.id
    WHERE t.id = ${id}
    GROUP BY t.id
  ` as any[]

  const tx = txRows[0]
  if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  if (tx.status !== 'succeeded') return NextResponse.json({ error: 'Only succeeded transactions can be refunded' }, { status: 400 })

  const refundable = tx.amount_cents - tx.refunded_cents
  if (amountCents > refundable) return NextResponse.json({ error: `Max refundable is ${refundable} cents` }, { status: 400 })

  const acctRows = await sql`
    SELECT provider, secret_key_enc, extra_enc FROM payment_accounts WHERE id = ${tx.payment_account_id}
  ` as any[]
  if (!acctRows[0]) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const { provider, secret_key_enc, extra_enc } = acctRows[0]
  const secretKey = decrypt(secret_key_enc)
  const extra = extra_enc ? JSON.parse(decrypt(extra_enc)) : {}

  const userId = (session.user as any).id
  let providerRefId: string

  try {
    if (provider === 'stripe') {
      const stripe = new Stripe(secretKey)
      const refund = await stripe.refunds.create({ payment_intent: tx.provider_tx_id, amount: amountCents })
      providerRefId = refund.id
    } else if (provider === 'square') {
      const client = new SquareClient({
        token: secretKey,
        environment: extra.sandbox === 'true' ? SquareEnvironment.Sandbox : SquareEnvironment.Production,
      })
      const res = await client.refunds.refundPayment({
        paymentId: tx.provider_tx_id,
        amountMoney: { amount: BigInt(amountCents), currency: 'USD' },
        idempotencyKey: randomUUID(),
      })
      providerRefId = res.refund?.id ?? randomUUID()
    } else {
      return NextResponse.json({ error: 'Unsupported provider' }, { status: 500 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 402 })
  }

  await sql`
    INSERT INTO refunds (transaction_id, amount_cents, provider_ref_id, refunded_by)
    VALUES (${id}, ${amountCents}, ${providerRefId}, ${userId})
  `

  await sql`
    INSERT INTO audit_log (user_id, action, entity, entity_id, meta_enc, ip)
    VALUES (${userId}, 'refund', 'transaction', ${id},
      ${encrypt(JSON.stringify({ amountCents, providerRefId, provider }))},
      ${req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'})
  `

  return NextResponse.json({ ok: true, providerRefId })
}
