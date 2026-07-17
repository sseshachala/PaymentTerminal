import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'

export async function GET() {
  const rows = await sql`SELECT key, value FROM settings` as any[]
  const obj: Record<string, string> = {}
  for (const r of rows) obj[r.key] = r.value
  return NextResponse.json(obj)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as any
  if (!session || session.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  for (const [key, value] of Object.entries(body)) {
    await sql`
      INSERT INTO settings (key, value, updated_at) VALUES (${key}, ${String(value)}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
  }
  return NextResponse.json({ ok: true })
}
