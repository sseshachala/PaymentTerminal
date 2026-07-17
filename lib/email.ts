import { Resend } from 'resend'
import { sql } from './db'
import { decrypt } from './encrypt'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM!

async function getAdminEmails(): Promise<string[]> {
  const rows = await sql`SELECT email_enc FROM users WHERE role = 'admin'` as any[]
  return rows.map((r) => decrypt(r.email_enc))
}

interface CompanyInfo {
  logo_url: string
  company_name: string
  company_address1: string
  company_address2: string
  company_city: string
  company_state: string
  company_zip: string
  company_phone: string
  company_email: string
}

async function getCompanyInfo(): Promise<CompanyInfo> {
  const rows = await sql`
    SELECT key, value FROM settings
    WHERE key IN ('logo_url','company_name','company_address1','company_address2',
                  'company_city','company_state','company_zip','company_phone','company_email')
  ` as any[]
  const m: Record<string, string> = {}
  for (const r of rows) m[r.key] = r.value
  return {
    logo_url: m.logo_url ?? '',
    company_name: m.company_name ?? '',
    company_address1: m.company_address1 ?? '',
    company_address2: m.company_address2 ?? '',
    company_city: m.company_city ?? '',
    company_state: m.company_state ?? '',
    company_zip: m.company_zip ?? '',
    company_phone: m.company_phone ?? '',
    company_email: m.company_email ?? '',
  }
}

interface LineItem { description: string; qty: number; unitPrice: number }

interface SuccessDetails {
  customerName: string
  customerEmail?: string | null
  agentEmail: string
  amountDisplay: string
  last4: string
  cardBrand: string
  transactionId: string
  lineItems: LineItem[]
  subtotalCents: number
  taxRate: number
  taxAmountCents: number
  amountCents: number
  timestamp: string
}

interface FailureDetails {
  customerName: string
  agentEmail: string
  amountDisplay: string
  transactionId: string
  timestamp: string
  error: string
  lineItems?: LineItem[]
}

export async function sendSuccessEmails(details: SuccessDetails) {
  const [adminEmails, co] = await Promise.all([getAdminEmails(), getCompanyInfo()])
  const logoUrl = co.logo_url

  const subject = `Payment Received — ${details.amountDisplay}`
  const sends: Promise<any>[] = []

  if (details.customerEmail) {
    sends.push(resend.emails.send({
      from: FROM, to: details.customerEmail, subject,
      html: successHtml(details, co, true),
    }))
  }

  const internalRecipients = [...new Set([details.agentEmail, ...adminEmails])]
  sends.push(resend.emails.send({
    from: FROM, to: internalRecipients,
    subject: `[Terminal] ${subject}`,
    html: successHtml(details, co, false),
  }))

  await Promise.allSettled(sends)
}

export async function sendFailureEmails(details: FailureDetails) {
  const [adminEmails, co] = await Promise.all([getAdminEmails(), getCompanyInfo()])
  const internalRecipients = [...new Set([details.agentEmail, ...adminEmails])]
  await resend.emails.send({
    from: FROM, to: internalRecipients,
    subject: `[Terminal] Payment Failed — ${details.amountDisplay}`,
    html: failureHtml(details, co),
  }).catch(() => {})
}

function fmt(cents: number) { return `$${(cents / 100).toFixed(2)}` }

function lineItemsTable(items: LineItem[]): string {
  const rows = items.map(i => {
    const total = (i.qty * i.unitPrice).toFixed(2)
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6">${i.description}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:center">${i.qty}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right">$${i.unitPrice.toFixed(2)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right">$${total}</td>
    </tr>`
  }).join('')
  return `
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:6px 8px;text-align:left;color:#6b7280;font-weight:600">Description</th>
          <th style="padding:6px 8px;text-align:center;color:#6b7280;font-weight:600">Qty</th>
          <th style="padding:6px 8px;text-align:right;color:#6b7280;font-weight:600">Unit Price</th>
          <th style="padding:6px 8px;text-align:right;color:#6b7280;font-weight:600">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

function emailHeader(co: CompanyInfo): string {
  const logo = co.logo_url
    ? `<img src="${co.logo_url}" alt="${co.company_name}" style="max-height:52px;max-width:220px;display:block;margin-bottom:8px" />`
    : ''
  const name = co.company_name
    ? `<p style="font-size:18px;font-weight:700;color:#111827;margin:0 0 4px">${co.company_name}</p>`
    : ''
  if (!logo && !name) return ''
  return `<div style="margin-bottom:24px">${logo}${name}</div>`
}

function emailFooter(co: CompanyInfo): string {
  const parts: string[] = []
  const addr = [co.company_address1, co.company_address2].filter(Boolean).join(', ')
  const cityLine = [co.company_city, co.company_state, co.company_zip].filter(Boolean).join(' ')
  if (addr) parts.push(addr)
  if (cityLine) parts.push(cityLine)
  if (co.company_phone) parts.push(co.company_phone)
  if (co.company_email) parts.push(`<a href="mailto:${co.company_email}" style="color:#6b7280">${co.company_email}</a>`)
  if (!parts.length && !co.company_name) return `<p style="color:#9ca3af;font-size:12px;margin-top:24px;text-align:center">PayTerminal</p>`
  return `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #f3f4f6;text-align:center">
    ${parts.map(p => `<p style="color:#9ca3af;font-size:12px;margin:2px 0">${p}</p>`).join('')}
  </div>`
}

function successHtml(d: SuccessDetails, co: CompanyInfo, isCustomer: boolean): string {
  const taxRow = d.taxRate > 0 && d.taxAmountCents > 0
    ? `<tr><td style="padding:4px 0;color:#6b7280">Tax (${(d.taxRate * 100).toFixed(2)}%)</td>
       <td style="padding:4px 0;text-align:right">${fmt(d.taxAmountCents)}</td></tr>`
    : ''

  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f9fafb;padding:32px;margin:0">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">
    ${emailHeader(co)}
    <div style="background:#16a34a;border-radius:8px;padding:16px;text-align:center;margin-bottom:24px">
      <p style="color:#fff;font-size:18px;font-weight:700;margin:0">Payment Confirmed</p>
    </div>
    ${lineItemsTable(d.lineItems)}
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:4px 0;color:#6b7280">Subtotal</td>
          <td style="padding:4px 0;text-align:right">${fmt(d.subtotalCents)}</td></tr>
      ${taxRow}
      <tr><td style="padding:8px 0;font-weight:700;font-size:16px;border-top:2px solid #e5e7eb">Total</td>
          <td style="padding:8px 0;font-weight:700;font-size:16px;text-align:right;border-top:2px solid #e5e7eb">${fmt(d.amountCents)}</td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px">
      <tr><td style="padding:6px 0;color:#6b7280;border-bottom:1px solid #f3f4f6">Customer</td>
          <td style="padding:6px 0;text-align:right;border-bottom:1px solid #f3f4f6">${d.customerName}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;border-bottom:1px solid #f3f4f6">Card</td>
          <td style="padding:6px 0;text-align:right;border-bottom:1px solid #f3f4f6;text-transform:capitalize">${d.cardBrand} ••••${d.last4}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;border-bottom:1px solid #f3f4f6">Date</td>
          <td style="padding:6px 0;text-align:right;border-bottom:1px solid #f3f4f6">${d.timestamp}</td></tr>
      ${!isCustomer ? `<tr><td style="padding:6px 0;color:#6b7280">Ref ID</td>
          <td style="padding:6px 0;text-align:right;font-family:monospace;font-size:11px">${d.transactionId}</td></tr>` : ''}
    </table>
    <p style="color:#9ca3af;font-size:12px;margin-top:16px;text-align:center">
      ${isCustomer ? 'Thank you for your payment.' : 'PayTerminal · Internal receipt'}
    </p>
    ${emailFooter(co)}
  </div>
</body></html>`
}

function failureHtml(d: FailureDetails, co: CompanyInfo): string {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f9fafb;padding:32px;margin:0">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">
    ${emailHeader(co)}
    <div style="background:#dc2626;border-radius:8px;padding:16px;text-align:center;margin-bottom:24px">
      <p style="color:#fff;font-size:18px;font-weight:700;margin:0">Payment Failed</p>
    </div>
    ${d.lineItems ? lineItemsTable(d.lineItems) : ''}
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #f3f4f6">Amount</td>
          <td style="padding:8px 0;font-weight:700;text-align:right;border-bottom:1px solid #f3f4f6">${d.amountDisplay}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #f3f4f6">Customer</td>
          <td style="padding:8px 0;text-align:right;border-bottom:1px solid #f3f4f6">${d.customerName}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #f3f4f6">Error</td>
          <td style="padding:8px 0;text-align:right;color:#dc2626;border-bottom:1px solid #f3f4f6">${d.error}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Ref ID</td>
          <td style="padding:8px 0;text-align:right;font-family:monospace;font-size:11px">${d.transactionId}</td></tr>
    </table>
    ${emailFooter(co)}
  </div>
</body></html>`
}
