#!/usr/bin/env npx ts-node
/**
 * Usage: npx ts-node scripts/seed-admin.ts
 * Creates the first admin user. Set ADMIN_EMAIL and ADMIN_PASSWORD env vars.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import bcrypt from 'bcryptjs'
import { sql } from '../lib/db'
import { encrypt, hmac } from '../lib/encrypt'

async function main() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  const name = process.env.ADMIN_NAME ?? 'Admin'

  if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD env vars')
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await sql`
    INSERT INTO users (name_enc, email_enc, email_hmac, password_hash, role)
    VALUES (
      ${encrypt(name)},
      ${encrypt(email)},
      ${hmac(email)},
      ${passwordHash},
      'admin'
    )
    ON CONFLICT (email_hmac) DO NOTHING
  `

  console.log(`Admin user created: ${email}`)
}

main().catch(console.error)
