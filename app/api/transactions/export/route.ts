import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { decrypt, decryptMaybe } from '@/lib/encrypt'

type Period = 'today' | 'week' | 'month' | 'quarter'

function dateRange(period: Period): { start: Date; end: Date } {
  const now = new Date()
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)

  if (period === 'week') start.setDate(start.getDate() - start.getDay())
  else if (period === 'month') start.setDate(1)
  else if (period === 'quarter') start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1)

  return { start, end }
}

function csvRow(cells: string[]): string {
  return cells.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')
}

const HEADERS = [
  'Date', 'Transaction ID', 'Customer Name', 'Company', 'Email', 'Phone',
  'Description', 'Qty', 'Unit Price', 'Line Total',
  'Subtotal', 'Tax Rate %', 'Tax Amount', 'Total',
  'Card Brand', 'Last 4', 'Status', 'Account', 'Agent', 'Stripe PI',
]

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const period = (req.nextUrl.searchParams.get('period') ?? 'today') as Period
  if (!['today', 'week', 'month', 'quarter'].includes(period)) {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 })
  }

  const { start, end } = dateRange(period)

  const rows = await sql`
    SELECT
      t.id, t.amount_cents, t.subtotal_cents, t.tax_rate, t.tax_amount_cents,
      t.status, t.stripe_pi_id, t.created_at,
      t.last4_enc, t.card_brand_enc, t.line_items_enc, t.provider_tx_id,
      c.name_enc       AS customer_name_enc,
      c.email_enc      AS customer_email_enc,
      c.phone_enc      AS customer_phone_enc,
      c.company_enc    AS customer_company_enc,
      pa.name          AS account_name,
      u.name_enc       AS agent_name_enc
    FROM transactions t
    LEFT JOIN customers c ON c.id = t.customer_id
    LEFT JOIN payment_accounts pa ON pa.id = t.payment_account_id
    LEFT JOIN users u ON u.id = t.created_by
    WHERE t.created_at >= ${start.toISOString()} AND t.created_at <= ${end.toISOString()}
      AND t.status = 'succeeded'
    ORDER BY t.created_at DESC
  ` as any[]

  const lines: string[] = [csvRow(HEADERS)]

  for (const r of rows) {
    const date = new Date(r.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' })
    const customerName = r.customer_name_enc ? decrypt(r.customer_name_enc) : ''
    const company = r.customer_company_enc ? decryptMaybe(r.customer_company_enc) ?? '' : ''
    const email = r.customer_email_enc ? decryptMaybe(r.customer_email_enc) ?? '' : ''
    const phone = r.customer_phone_enc ? decryptMaybe(r.customer_phone_enc) ?? '' : ''
    const last4 = decryptMaybe(r.last4_enc) ?? '****'
    const cardBrand = decryptMaybe(r.card_brand_enc) ?? ''
    const agentName = r.agent_name_enc ? decrypt(r.agent_name_enc) : ''
    const subtotal = r.subtotal_cents != null ? (r.subtotal_cents / 100).toFixed(2) : (r.amount_cents / 100).toFixed(2)
    const taxRate = r.tax_rate != null ? (parseFloat(r.tax_rate) * 100).toFixed(2) : '0.00'
    const taxAmount = r.tax_amount_cents != null ? (r.tax_amount_cents / 100).toFixed(2) : '0.00'
    const total = (r.amount_cents / 100).toFixed(2)

    let items: { description: string; qty: number; unitPrice: number }[] = []
    try { items = r.line_items_enc ? JSON.parse(decrypt(r.line_items_enc)) : [] } catch {}

    if (items.length === 0) {
      // Legacy row without line items — emit single row
      lines.push(csvRow([
        date, r.id, customerName, company, email, phone,
        '', '', '', '',
        subtotal, taxRate, taxAmount, total,
        cardBrand, last4, r.status, r.account_name ?? '', agentName, r.stripe_pi_id ?? '',
      ]))
      continue
    }

    items.forEach((item, idx) => {
      const lineTotal = (item.qty * item.unitPrice).toFixed(2)
      // Only print transaction-level totals on first line item row
      lines.push(csvRow([
        idx === 0 ? date : '',
        idx === 0 ? r.id : '',
        idx === 0 ? customerName : '',
        idx === 0 ? company : '',
        idx === 0 ? email : '',
        idx === 0 ? phone : '',
        item.description,
        String(item.qty),
        item.unitPrice.toFixed(2),
        lineTotal,
        idx === 0 ? subtotal : '',
        idx === 0 ? taxRate : '',
        idx === 0 ? taxAmount : '',
        idx === 0 ? total : '',
        idx === 0 ? cardBrand : '',
        idx === 0 ? last4 : '',
        idx === 0 ? r.status : '',
        idx === 0 ? (r.account_name ?? '') : '',
        idx === 0 ? agentName : '',
        idx === 0 ? (r.provider_tx_id ?? '') : '',
      ]))
    })
  }

  const periodLabel: Record<Period, string> = {
    today: new Date().toISOString().slice(0, 10),
    week: 'week',
    month: new Date().toISOString().slice(0, 7),
    quarter: `Q${Math.floor(new Date().getMonth() / 3) + 1}-${new Date().getFullYear()}`,
  }

  return new NextResponse(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="transactions-${periodLabel[period]}.csv"`,
    },
  })
}
