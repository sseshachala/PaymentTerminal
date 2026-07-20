import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { sql } from '@/lib/db'
import { encrypt, hmac } from '@/lib/encrypt'

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json()
    if (!name || !email || !password) return NextResponse.json({ error: 'All fields required' }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })

    const emailHmac = hmac(email)
    const existing = await sql`SELECT id FROM users WHERE email_hmac = ${emailHmac}` as any[]
    if (existing.length) return NextResponse.json({ error: 'Email already registered' }, { status: 409 })

    const passwordHash = await bcrypt.hash(password, 12)
    await sql`
      INSERT INTO users (name_enc, email_enc, email_hmac, password_hash, role)
      VALUES (${encrypt(name)}, ${encrypt(email)}, ${emailHmac}, ${passwordHash}, 'agent')
    `
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('Register error:', e?.message ?? e)
    return NextResponse.json({ error: e?.message ?? 'Internal error' }, { status: 500 })
  }
}
