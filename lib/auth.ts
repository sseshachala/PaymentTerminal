import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { sql } from './db'
import { decrypt, hmac } from './encrypt'

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8h
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null

        const ip = (req?.headers?.['x-forwarded-for'] as string)?.split(',')[0] ?? 'unknown'

        // Rate limit: max 5 failed logins per IP in 15 min
        const recent = await sql`
          SELECT COUNT(*) as count FROM audit_log
          WHERE action = 'login_fail' AND ip = ${ip}
            AND created_at > NOW() - INTERVAL '15 minutes'
        ` as any[]
        if (Number(recent[0].count) >= 5) return null

        const users = await sql`
          SELECT * FROM users WHERE email_hmac = ${hmac(credentials.email)}
        ` as any[]
        const user = users[0]
        if (!user) {
          await sql`INSERT INTO audit_log (action, ip) VALUES ('login_fail', ${ip})`
          return null
        }

        const valid = await bcrypt.compare(credentials.password, user.password_hash)
        if (!valid) {
          await sql`INSERT INTO audit_log (action, entity, entity_id, ip) VALUES ('login_fail', 'user', ${user.id}, ${ip})`
          return null
        }

        await sql`INSERT INTO audit_log (user_id, action, ip) VALUES (${user.id}, 'login', ${ip})`

        return {
          id: user.id,
          email: decrypt(user.email_enc),
          name: decrypt(user.name_enc),
          role: user.role,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id
        ;(session.user as any).role = token.role
      }
      return session
    },
  },
}
