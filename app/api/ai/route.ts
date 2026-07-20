import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAI } from '@/lib/ai'
import { sql } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, ...body } = await req.json()
  const ai = getAI()

  if (action === 'parse-items') {
    const msg = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Parse this into a JSON array of line items. Each item must have: description (string), qty (number), unitPrice (number). Return ONLY a valid JSON array, no markdown, no explanation.\n\n${body.text}`,
      }],
    })
    const text = (msg.content[0] as any).text.trim()
    const items = JSON.parse(text)
    return NextResponse.json({ items })
  }

  if (action === 'customer-context') {
    const { customerId } = body
    const rows = await sql`
      SELECT amount_cents, created_at
      FROM transactions
      WHERE customer_id = ${customerId} AND status = 'succeeded'
      ORDER BY created_at DESC LIMIT 20
    ` as any[]

    if (rows.length === 0) {
      return NextResponse.json({ summary: 'New customer — no prior transactions.', avgOrderCents: 0, orderCount: 0 })
    }

    const avgOrderCents = Math.round(rows.reduce((s: number, r: any) => s + Number(r.amount_cents), 0) / rows.length)
    const lastDate = new Date(rows[0].created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

    const msg = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [{
        role: 'user',
        content: `Write a single concise sentence summarizing this customer for a payment agent. Facts: ${rows.length} successful orders, average order $${(avgOrderCents / 100).toFixed(2)}, most recent order ${lastDate}. No fluff, just the facts.`,
      }],
    })
    const summary = (msg.content[0] as any).text.trim()
    return NextResponse.json({ summary, avgOrderCents, orderCount: rows.length })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
