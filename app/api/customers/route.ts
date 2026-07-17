import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { encrypt, encryptMaybe, decrypt, decryptMaybe, hmac } from '@/lib/encrypt'

const usPhone = z.string().refine(
  (v) => v.replace(/\D/g, '').length === 10,
  { message: 'Must be a 10-digit US phone number' }
)

const CreateSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  email: z.string().email(),
  phone: usPhone,
  company: z.string().max(200).optional(),
  address1: z.string().min(1).max(300),
  address2: z.string().max(300).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(2).max(2),
  zip: z.string().min(5).max(5),
  notes: z.string().max(2000).optional(),
})

// GET /api/customers?q=search
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim().toLowerCase()
  if (!q || q.length < 2) return NextResponse.json([])

  // Decrypt all, filter in-memory — works fine for <10K customers
  const rows = await sql`
    SELECT id, name_enc, email_enc, phone_enc, company_enc
    FROM customers ORDER BY created_at DESC
  ` as any[]

  const customers = rows
    .map((r) => ({
      id: r.id,
      name: decrypt(r.name_enc),
      email: decryptMaybe(r.email_enc),
      phone: decryptMaybe(r.phone_enc),
      company: decryptMaybe(r.company_enc),
    }))
    .filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    )
    .slice(0, 10)

  return NextResponse.json(customers)
}

// POST /api/customers
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { name, email, phone, company, address1, address2, city, state, zip, notes } = parsed.data

  const addressJson = JSON.stringify({ address1, address2, city, state, zip })

  const rows = await sql`
    INSERT INTO customers (name_enc, name_hmac, email_enc, email_hmac, phone_enc, company_enc, address_enc, notes_enc)
    VALUES (
      ${encrypt(name)},
      ${hmac(name)},
      ${encrypt(email)},
      ${hmac(email)},
      ${encrypt(phone)},
      ${encryptMaybe(company)},
      ${encrypt(addressJson)},
      ${encryptMaybe(notes)}
    )
    RETURNING id
  ` as any[]

  return NextResponse.json({ id: rows[0].id, name, email, phone, company, address1, city, state, zip }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Deletes customer only — transactions remain with customer_id set to null (FK is nullable)
  await sql`DELETE FROM customers WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}
