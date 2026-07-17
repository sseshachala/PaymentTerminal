import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const to = (session.user as any).email
  const from = process.env.RESEND_FROM!

  const result = await resend.emails.send({
    from,
    to,
    subject: 'PayTerminal — test email',
    html: '<p>If you see this, email is working.</p>',
  })

  return NextResponse.json({ from, to, result })
}
