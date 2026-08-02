import { SquareClient, SquareEnvironment } from 'square'
import { randomUUID } from 'crypto'

export interface SquareChargeParams {
  secretKey: string
  locationId: string
  sandbox: boolean
  amountCents: number
  sourceId: string
  txId: string
}

export interface ChargeResult {
  providerTxId: string
  last4: string | null
  cardBrand: string | null
  status: 'succeeded' | 'failed'
}

export async function squareCharge(p: SquareChargeParams): Promise<ChargeResult> {
  const client = new SquareClient({
    token: p.secretKey,
    environment: p.sandbox ? SquareEnvironment.Sandbox : SquareEnvironment.Production,
  })

  const response = await client.payments.create({
    sourceId: p.sourceId,
    idempotencyKey: randomUUID(),
    amountMoney: { amount: BigInt(p.amountCents), currency: 'USD' },
    locationId: p.locationId,
    referenceId: p.txId,
    // ponytail: MOTO flag — agent keyed card over the phone, not customer-initiated. Fixes Capital One fraud declines.
    customerDetails: { customerInitiated: false, sellerKeyedIn: true },
  })

  const payment = response.payment
  const card = payment?.cardDetails?.card

  return {
    providerTxId: payment?.id ?? p.txId,
    last4: card?.last4 ?? null,
    cardBrand: card?.cardBrand?.toLowerCase() ?? null,
    status: payment?.status === 'COMPLETED' ? 'succeeded' : 'failed',
  }
}
