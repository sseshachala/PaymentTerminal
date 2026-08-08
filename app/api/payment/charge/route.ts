import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { getAccountCredentials } from '@/lib/payment-router'
import { stripeCharge } from '@/lib/providers/stripe'
import { squareCharge } from '@/lib/providers/square'
import { encrypt, encryptMaybe, decrypt, decryptMaybe } from '@/lib/encrypt'
import { sendSuccessEmails, sendFailureEmails } from '@/lib/email'

const ChargeSchema = z.object({
  accountId: z.string().uuid(),
  customerId: z.string().uuid(),
  amountCents: z.number().int().min(100).max(5_000_000),
  note: z.string().max(500).optional(),
  paymentMethodId: z.string().startsWith('pm_').optional(),
  sourceId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = ChargeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { accountId, customerId, amountCents, note, paymentMethodId, sourceId } = parsed.data
  const description = note?.trim() || 'Payment'
  const lineItems = [{ description, qty: 1, unitPrice: amountCents / 100 }]
  const subtotalCents = amountCents
  const taxRate = 0
  const taxAmountCents = 0
  const amountDisplay = `$${(amountCents / 100).toFixed(2)}`
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })

  // Validate account has headroom
  const accountRows = await sql`
    SELECT pa.id, pa.daily_limit_cents,
      COALESCE(SUM(t.amount_cents) FILTER (
        WHERE t.status = 'succeeded' AND t.created_at::date = CURRENT_DATE
      ), 0)::int AS used_today
    FROM payment_accounts pa
    LEFT JOIN transactions t ON t.payment_account_id = pa.id
    WHERE pa.id = ${accountId} AND pa.is_active = true
    GROUP BY pa.id
  ` as any[]
  if (!accountRows[0]) return NextResponse.json({ error: 'Invalid account' }, { status: 400 })

  const { daily_limit_cents, used_today } = accountRows[0]
  if (used_today + amountCents > daily_limit_cents) {
    return NextResponse.json({ error: 'Account daily limit exceeded' }, { status: 422 })
  }

  const customerRows = await sql`
    SELECT id, name_enc, email_enc FROM customers WHERE id = ${customerId}
  ` as any[]
  if (!customerRows[0]) return NextResponse.json({ error: 'Customer not found' }, { status: 400 })
  const customerName = decrypt(customerRows[0].name_enc)
  const customerEmail = decryptMaybe(customerRows[0].email_enc)

  const userId = (session.user as any).id
  const agentRows = await sql`SELECT email_enc FROM users WHERE id = ${userId}` as any[]
  const agentEmail = decrypt(agentRows[0].email_enc)

  const creds = await getAccountCredentials(accountId)
  if (!creds) return NextResponse.json({ error: 'Account unavailable' }, { status: 503 })

  // Insert pending transaction
  const txRows = await sql`
    INSERT INTO transactions (customer_id, payment_account_id, amount_cents, provider_tx_id, status, created_by,
      line_items_enc, subtotal_cents, tax_rate, tax_amount_cents, notes_enc)
    VALUES (${customerId}, ${accountId}, ${amountCents}, 'pending_init', 'pending', ${userId},
      ${encrypt(JSON.stringify(lineItems))}, ${subtotalCents}, ${taxRate}, ${taxAmountCents},
      ${encryptMaybe(note?.trim() || null)})
    RETURNING id
  ` as any[]
  const txId = txRows[0].id

  let result
  try {
    if (creds.provider === 'stripe') {
      if (!paymentMethodId) return NextResponse.json({ error: 'paymentMethodId required for Stripe' }, { status: 400 })
      result = await stripeCharge({ secretKey: creds.secretKey, amountCents, paymentMethodId, txId, agentId: userId })
    } else if (creds.provider === 'square') {
      if (!sourceId) return NextResponse.json({ error: 'sourceId required for Square' }, { status: 400 })
      result = await squareCharge({
        secretKey: creds.secretKey,
        locationId: creds.extra.locationId,
        sandbox: creds.extra.sandbox === 'true',
        amountCents,
        sourceId,
        txId,
      })
    } else {
      return NextResponse.json({ error: 'Unsupported provider' }, { status: 500 })
    }
  } catch (err: any) {
    await sql`UPDATE transactions SET status = 'failed', provider_tx_id = ${'err_' + txId} WHERE id = ${txId}`
    await sql`
      INSERT INTO audit_log (user_id, action, entity, entity_id, meta_enc, ip)
      VALUES (${userId}, 'charge_fail', 'transaction', ${txId},
        ${encrypt(JSON.stringify({ error: err.message, accountId, provider: creds.provider }))},
        ${req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'})
    `
    sendFailureEmails({ customerName, agentEmail, amountDisplay, transactionId: txId, timestamp, error: err.message, lineItems }).catch(() => {})
    return NextResponse.json({ error: err.message }, { status: 402 })
  }

  await sql`
    UPDATE transactions
    SET provider_tx_id = ${result.providerTxId}, status = ${result.status},
        last4_enc = ${encryptMaybe(result.last4)}, card_brand_enc = ${encryptMaybe(result.cardBrand)}
    WHERE id = ${txId}
  `

  await sql`
    INSERT INTO audit_log (user_id, action, entity, entity_id, meta_enc, ip)
    VALUES (${userId}, 'charge_' || ${result.status}, 'transaction', ${txId},
      ${encrypt(JSON.stringify({ amountCents, accountId, provider: creds.provider, providerTxId: result.providerTxId }))},
      ${req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'})
  `

  if (result.status === 'succeeded') {
    sendSuccessEmails({
      customerName, customerEmail, agentEmail, amountDisplay,
      last4: result.last4 ?? '****', cardBrand: result.cardBrand ?? '',
      transactionId: txId, lineItems, subtotalCents, taxRate, taxAmountCents, amountCents, timestamp,
    }).catch(() => {})
  } else {
    sendFailureEmails({ customerName, agentEmail, amountDisplay, transactionId: txId, timestamp, error: 'Payment not completed', lineItems }).catch(() => {})
  }

  return NextResponse.json({
    success: result.status === 'succeeded',
    transactionId: txId,
    last4: result.last4 ?? '****',
    cardBrand: result.cardBrand,
  })
}
