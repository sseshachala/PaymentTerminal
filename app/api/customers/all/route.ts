import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { decrypt, decryptMaybe } from '@/lib/encrypt'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await sql`
    SELECT id, name_enc, email_enc, phone_enc, company_enc, created_at
    FROM customers ORDER BY created_at DESC
  ` as any[]

  return NextResponse.json(rows.map((r) => ({
    id: r.id,
    name: decrypt(r.name_enc),
    email: decryptMaybe(r.email_enc),
    phone: decryptMaybe(r.phone_enc),
    company: decryptMaybe(r.company_enc),
    createdAt: r.created_at,
  })))
}
