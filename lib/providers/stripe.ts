import Stripe from 'stripe'

export interface StripeChargeParams {
  secretKey: string
  amountCents: number
  paymentMethodId: string
  txId: string
  agentId: string
}

export interface ChargeResult {
  providerTxId: string
  last4: string | null
  cardBrand: string | null
  status: 'succeeded' | 'failed'
}

export async function stripeCharge(p: StripeChargeParams): Promise<ChargeResult> {
  const stripe = new Stripe(p.secretKey)

  const pi = await stripe.paymentIntents.create({
    amount: p.amountCents,
    currency: 'usd',
    payment_method: p.paymentMethodId,
    confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    payment_method_options: { card: { request_three_d_secure: 'automatic' } },
    metadata: { tx_id: p.txId, agent: p.agentId },
  })

  const card = pi.payment_method && typeof pi.payment_method === 'object'
    ? (pi.payment_method as any).card : null

  return {
    providerTxId: pi.id,
    last4: card?.last4 ?? null,
    cardBrand: card?.brand ?? null,
    status: pi.status === 'succeeded' ? 'succeeded' : 'failed',
  }
}
