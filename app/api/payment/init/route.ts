import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listActiveAccounts } from '@/lib/payment-router'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accounts = await listActiveAccounts()
  const withHeadroom = accounts.filter((a) => a.dailyLimitCents > a.usedTodayCents)
  if (withHeadroom.length === 0) {
    return NextResponse.json({ error: 'All payment accounts have reached their daily limit' }, { status: 503 })
  }

  return NextResponse.json({
    accounts: withHeadroom.map((a) => ({
      accountId: a.id,
      name: a.name,
      location: a.location,
      provider: a.provider,
      remaining: a.dailyLimitCents - a.usedTodayCents,
      ...(a.provider === 'stripe'
        ? { publishableKey: a.publishableKey }
        : { applicationId: a.applicationId, locationId: a.locationId, sandbox: a.sandbox ?? false }),
    })),
  })
}
