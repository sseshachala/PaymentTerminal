import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getActiveAccount } from '@/lib/payment-router'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await getActiveAccount()
  if (!account) {
    return NextResponse.json({ error: 'All payment accounts have reached their daily limit' }, { status: 503 })
  }

  const base = {
    accountId: account.id,
    provider: account.provider,
    remaining: account.dailyLimitCents - account.usedTodayCents,
  }

  if (account.provider === 'square') {
    return NextResponse.json({ ...base, applicationId: account.applicationId, locationId: account.locationId, sandbox: account.sandbox ?? false })
  }

  return NextResponse.json({ ...base, publishableKey: account.publishableKey })
}
