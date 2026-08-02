'use client'
import AppShell from '@/components/AppShell'
import CustomerForm, { EMPTY_CUSTOMER, CustomerData } from '@/components/CustomerForm'
import LineItems, { LineItem, EMPTY_LINE_ITEM, calcTotals } from '@/components/LineItems'
import { useState, useEffect, useCallback, useRef } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'

interface CustomerContext { summary: string; avgOrderCents: number; orderCount: number }

interface Customer {
  id: string; name: string; email?: string; phone?: string; company?: string
}

interface AccountInfo {
  accountId: string
  name: string
  location: string
  provider: 'stripe' | 'square'
  remaining: number
  // stripe
  publishableKey?: string
  // square
  applicationId?: string
  locationId?: string
  sandbox?: boolean
}

// ── Stripe charge form ────────────────────────────────────────────────────────

function StripeChargeForm({ customer, accountId, taxRate, customerContext, onSuccess, onReset }: {
  customer: Customer; accountId: string; taxRate: number
  customerContext: CustomerContext | null
  onSuccess: (r: any) => void; onReset: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [items, setItems] = useState<LineItem[]>([{ ...EMPTY_LINE_ITEM }])
  const [taxEnabled, setTaxEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCharge(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setError('')
    const { subtotal, taxAmount, total } = calcTotals(items, taxRate, taxEnabled)
    const cents = Math.round(total * 100)
    if (cents < 100) { setError('Minimum amount is $1.00'); return }
    setLoading(true)
    const cardEl = elements.getElement(CardElement)
    if (!cardEl) return
    const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({ type: 'card', card: cardEl })
    if (pmError || !paymentMethod) { setError(pmError?.message ?? 'Card error'); setLoading(false); return }

    const res = await fetch('/api/payment/charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId, customerId: customer.id, paymentMethodId: paymentMethod.id,
        lineItems: items.map(i => ({ description: i.description, qty: parseFloat(i.qty) || 0, unitPrice: parseFloat(i.unitPrice) || 0 })),
        subtotalCents: Math.round(subtotal * 100),
        taxRate: taxEnabled ? taxRate : 0,
        taxAmountCents: Math.round(taxAmount * 100),
        amountCents: cents,
      }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok || !data.success) { setError(data.error ?? 'Charge failed'); return }
    onSuccess({ ...data, total: total.toFixed(2), customer })
  }

  const { total } = calcTotals(items, taxRate, taxEnabled)
  const isAnomalous = customerContext && customerContext.orderCount >= 3 &&
    customerContext.avgOrderCents > 0 && total > (customerContext.avgOrderCents / 100) * 2

  return (
    <form onSubmit={handleCharge} className="space-y-5">
      <LineItems items={items} onChange={setItems} taxRate={taxRate} taxEnabled={taxEnabled} onTaxToggle={setTaxEnabled} />
      {isAnomalous && (
        <p className="text-yellow-400 text-sm bg-yellow-900/20 border border-yellow-700 rounded-lg px-3 py-2">
          ⚠ This order (${total.toFixed(2)}) is more than 2× the customer&apos;s average (${(customerContext!.avgOrderCents / 100).toFixed(2)}). Confirm before charging.
        </p>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Card Details</label>
        <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-3 focus-within:ring-2 focus-within:ring-blue-500">
          <CardElement options={{ style: { base: { fontSize: '16px', color: '#f9fafb', '::placeholder': { color: '#6b7280' }, iconColor: '#9ca3af' }, invalid: { color: '#f87171' } } }} />
        </div>
      </div>
      {error && <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={loading || !stripe || total < 1}
          className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors text-lg">
          {loading ? 'Processing...' : total > 0 ? `Charge $${total.toFixed(2)}` : 'Charge'}
        </button>
        <button type="button" onClick={onReset}
          className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Square charge form ────────────────────────────────────────────────────────

declare global { interface Window { Square: any } }

function SquareChargeForm({ customer, accountId, applicationId, locationId, sandbox, taxRate, customerContext, onSuccess, onReset }: {
  customer: Customer; accountId: string
  applicationId: string; locationId: string; sandbox: boolean; taxRate: number
  customerContext: CustomerContext | null
  onSuccess: (r: any) => void; onReset: () => void
}) {
  const [items, setItems] = useState<LineItem[]>([{ ...EMPTY_LINE_ITEM }])
  const [taxEnabled, setTaxEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sdkReady, setSdkReady] = useState(false)
  const cardRef = useRef<any>(null)

  useEffect(() => {
    let card: any
    async function init() {
      if (!window.Square) return
      try {
        const payments = window.Square.payments(applicationId, locationId)
        card = await payments.card({ style: {
          '.input-container': { borderColor: '#374151', borderRadius: '8px' },
          '.input-container.is-focus': { borderColor: '#3b82f6' },
          input: { color: '#f9fafb', fontSize: '16px' },
          'input::placeholder': { color: '#6b7280' },
        }})
        await card.attach('#sq-card')
        cardRef.current = card
        setSdkReady(true)
      } catch (e: any) { setError(e.message) }
    }

    if (window.Square) { init(); return }
    const script = document.createElement('script')
    // ponytail: sandbox URL lives in extra.sandbox flag; swap for prod via env if needed
    script.src = sandbox
      ? 'https://sandbox.web.squarecdn.com/v1/square.js'
      : 'https://web.squarecdn.com/v1/square.js'
    script.onload = init
    script.onerror = () => setError('Failed to load Square SDK')
    document.head.appendChild(script)

    return () => { card?.destroy?.() }
  }, [applicationId, locationId])

  async function handleCharge(e: React.FormEvent) {
    e.preventDefault()
    if (!cardRef.current || !sdkReady) return
    setError('')
    const { subtotal, taxAmount, total } = calcTotals(items, taxRate, taxEnabled)
    const cents = Math.round(total * 100)
    if (cents < 100) { setError('Minimum amount is $1.00'); return }
    setLoading(true)

    const result = await cardRef.current.tokenize()
    if (result.status !== 'OK') {
      setError(result.errors?.[0]?.message ?? 'Card tokenization failed')
      setLoading(false)
      return
    }

    const res = await fetch('/api/payment/charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId, customerId: customer.id, sourceId: result.token,
        lineItems: items.map(i => ({ description: i.description, qty: parseFloat(i.qty) || 0, unitPrice: parseFloat(i.unitPrice) || 0 })),
        subtotalCents: Math.round(subtotal * 100),
        taxRate: taxEnabled ? taxRate : 0,
        taxAmountCents: Math.round(taxAmount * 100),
        amountCents: cents,
      }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok || !data.success) { setError(data.error ?? 'Charge failed'); return }
    onSuccess({ ...data, total: total.toFixed(2), customer })
  }

  const { total } = calcTotals(items, taxRate, taxEnabled)
  const isAnomalous = customerContext && customerContext.orderCount >= 3 &&
    customerContext.avgOrderCents > 0 && total > (customerContext.avgOrderCents / 100) * 2

  return (
    <form onSubmit={handleCharge} className="space-y-5">
      <LineItems items={items} onChange={setItems} taxRate={taxRate} taxEnabled={taxEnabled} onTaxToggle={setTaxEnabled} />
      {isAnomalous && (
        <p className="text-yellow-400 text-sm bg-yellow-900/20 border border-yellow-700 rounded-lg px-3 py-2">
          ⚠ This order (${total.toFixed(2)}) is more than 2× the customer&apos;s average (${(customerContext!.avgOrderCents / 100).toFixed(2)}). Confirm before charging.
        </p>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Card Details</label>
        <div id="sq-card" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-3 min-h-[48px]" />
        {!sdkReady && !error && <p className="text-gray-500 text-xs mt-1">Loading card form...</p>}
      </div>
      {error && <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={loading || !sdkReady || total < 1}
          className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors text-lg">
          {loading ? 'Processing...' : total > 0 ? `Charge $${total.toFixed(2)}` : 'Charge'}
        </button>
        <button type="button" onClick={onReset}
          className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Terminal ──────────────────────────────────────────────────────────────────

function Terminal() {
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [availableAccounts, setAvailableAccounts] = useState<AccountInfo[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null)
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null)
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null)
  const [success, setSuccess] = useState<any>(null)
  const [searching, setSearching] = useState(false)
  const [loadingAccount, setLoadingAccount] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [showNewCustomer, setShowNewCustomer] = useState(true)
  const [newCustomer, setNewCustomer] = useState<CustomerData>(EMPTY_CUSTOMER)
  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const [createError, setCreateError] = useState('')
  const [taxRate, setTaxRate] = useState(0.0825)
  const [customerContext, setCustomerContext] = useState<CustomerContext | null>(null)
  const searchTimeout = useRef<NodeJS.Timeout | undefined>(undefined)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => { if (d.tax_rate) setTaxRate(parseFloat(d.tax_rate)) })
  }, [])

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return }
    setSearching(true)
    const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`)
    setSearchResults(await res.json())
    setSearching(false)
  }, [])

  useEffect(() => {
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => doSearch(search), 300)
    return () => clearTimeout(searchTimeout.current)
  }, [search, doSearch])

  async function initPayment(customer: Customer) {
    setSelectedCustomer(customer)
    setAccountError('')
    setCustomerContext(null)
    setAvailableAccounts([])
    setSelectedLocation(null)
    setAccountInfo(null)
    setStripePromise(null)
    setLoadingAccount(true)
    const [res, ctxRes] = await Promise.all([
      fetch('/api/payment/init'),
      fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'customer-context', customerId: customer.id }) }),
    ])
    const data = await res.json()
    setLoadingAccount(false)
    ctxRes.json().then(setCustomerContext).catch(() => {})
    if (!res.ok) { setAccountError(data.error); return }
    setAvailableAccounts(data.accounts)
  }

  function pickLocation(loc: string) {
    setSelectedLocation(loc)
    const inLoc = availableAccounts.filter(a => a.location === loc)
    if (inLoc.length === 1) pickAccount(inLoc[0])
  }

  function pickAccount(a: AccountInfo) {
    setAccountInfo(a)
    if (a.provider === 'stripe' && a.publishableKey) {
      setStripePromise(loadStripe(a.publishableKey))
    }
  }

  async function createCustomer(e: React.FormEvent) {
    e.preventDefault()
    setCreatingCustomer(true); setCreateError('')
    const res = await fetch('/api/customers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCustomer),
    })
    const data = await res.json()
    setCreatingCustomer(false)
    if (res.ok) { setShowNewCustomer(false); setNewCustomer(EMPTY_CUSTOMER); initPayment(data) }
    else setCreateError('Failed to create customer')
  }

  function reset() {
    setSelectedCustomer(null); setAvailableAccounts([]); setSelectedLocation(null)
    setAccountInfo(null); setStripePromise(null)
    setSuccess(null); setSearch(''); setSearchResults([]); setCustomerContext(null)
  }

  if (success) {
    return (
      <div className="p-8 flex items-center justify-center min-h-full">
        <div className="bg-gray-900 rounded-xl p-10 border border-gray-800 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">Payment Approved</h2>
          <p className="text-gray-400 mb-6">Transaction saved successfully</p>
          <div className="bg-gray-800 rounded-lg p-4 text-left space-y-2 mb-6">
            {[
              ['Customer', success.customer.name],
              ['Amount', `$${parseFloat(success.total).toFixed(2)}`],
              ['Card', `${success.cardBrand ?? ''} ••••${success.last4}`],
              ['Ref', success.transactionId],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-gray-400">{label}</span>
                <span className="text-white font-mono text-xs">{value}</span>
              </div>
            ))}
          </div>
          <button onClick={reset}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-lg transition-colors">
            New Transaction
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-white mb-6">Payment Terminal</h2>

      {!selectedCustomer && (
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Step 1 — Select Customer</h3>
          {!showNewCustomer ? (
            <>
              <div className="relative mb-3">
                <input type="text" placeholder="Search by name, email, company or phone..." value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {searching && <span className="absolute right-3 top-3 text-gray-500 text-xs">Searching...</span>}
              </div>
              {searchResults.length > 0 && (
                <ul className="border border-gray-700 rounded-lg overflow-hidden mb-3">
                  {searchResults.map((c) => (
                    <li key={c.id}>
                      <button onClick={() => initPayment(c)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-800 transition-colors border-b border-gray-700 last:border-0">
                        <p className="text-white font-medium">{c.name}</p>
                        <p className="text-gray-400 text-sm">{[c.company, c.email].filter(Boolean).join(' · ')}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button onClick={() => { setShowNewCustomer(true); setCreateError('') }}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                + New customer
              </button>
            </>
          ) : (
            <CustomerForm value={newCustomer} onChange={setNewCustomer} onSubmit={createCustomer}
              saving={creatingCustomer} submitLabel="Create & Continue"
              onCancel={() => setShowNewCustomer(false)} error={createError} />
          )}
        </div>
      )}

      {selectedCustomer && (() => {
        const locations = Array.from(new Set(availableAccounts.map(a => a.location)))
        const inLoc = selectedLocation ? availableAccounts.filter(a => a.location === selectedLocation) : []
        const stage = accountInfo ? 'card' : selectedLocation ? 'provider' : 'location'
        const stepLabel = stage === 'card' ? 'Step 4 — Charge Card'
          : stage === 'provider' ? 'Step 3 — Select Provider'
          : 'Step 2 — Select Location'
        return (
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{stepLabel}</h3>
            <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Change customer</button>
          </div>
          <div className="bg-gray-800 rounded-lg px-4 py-3 mb-5">
            <p className="text-white font-medium">{selectedCustomer.name}</p>
            {selectedCustomer.company && <p className="text-gray-400 text-sm">{selectedCustomer.company}</p>}
            {customerContext && (
              <p className="text-purple-400 text-xs mt-1">{customerContext.summary}</p>
            )}
          </div>
          {loadingAccount && <p className="text-gray-400 text-sm">Loading payment accounts...</p>}
          {accountError && <p className="text-red-400 text-sm">{accountError}</p>}

          {stage === 'location' && locations.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {locations.map((loc) => (
                <button key={loc} type="button" onClick={() => pickLocation(loc)}
                  className="px-4 py-6 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors text-center">
                  <p className="text-white font-semibold text-lg">{loc}</p>
                  <p className="text-gray-400 text-xs mt-1">
                    {availableAccounts.filter(a => a.location === loc).length} account(s)
                  </p>
                </button>
              ))}
            </div>
          )}

          {stage === 'provider' && (
            <div className="space-y-2">
              {inLoc.map((a) => (
                <button key={a.accountId} type="button" onClick={() => pickAccount(a)}
                  className="w-full text-left px-4 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium capitalize">{a.provider} <span className="text-gray-500">·</span> <span className="text-gray-300">{a.name}</span></p>
                    <p className="text-gray-400 text-xs mt-0.5">Remaining today: ${(a.remaining / 100).toFixed(2)}</p>
                  </div>
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${
                    a.provider === 'stripe' ? 'bg-purple-900/40 text-purple-300' : 'bg-blue-900/40 text-blue-300'
                  }`}>{a.provider}</span>
                </button>
              ))}
              <button onClick={() => setSelectedLocation(null)}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors mt-2">← Change location</button>
            </div>
          )}

          {stage === 'card' && accountInfo && (
            <div className="mb-4 flex items-center justify-between text-xs">
              <span className="text-gray-400">Using <span className="text-white">{accountInfo.location} · {accountInfo.name}</span> ({accountInfo.provider})</span>
              <button onClick={() => { setAccountInfo(null); setStripePromise(null); if (inLoc.length <= 1) setSelectedLocation(null) }}
                className="text-gray-500 hover:text-gray-300 transition-colors">Change</button>
            </div>
          )}

          {accountInfo?.provider === 'stripe' && stripePromise && (
            <Elements stripe={stripePromise}>
              <StripeChargeForm customer={selectedCustomer} accountId={accountInfo.accountId}
                taxRate={taxRate} customerContext={customerContext} onSuccess={setSuccess} onReset={reset} />
            </Elements>
          )}

          {accountInfo?.provider === 'square' && accountInfo.applicationId && accountInfo.locationId && (
            <SquareChargeForm customer={selectedCustomer} accountId={accountInfo.accountId}
              applicationId={accountInfo.applicationId} locationId={accountInfo.locationId}
              sandbox={accountInfo.sandbox ?? false}
              taxRate={taxRate} customerContext={customerContext} onSuccess={setSuccess} onReset={reset} />
          )}
        </div>
        )
      })()}
    </div>
  )
}

export default function TerminalPage() {
  return <AppShell><Terminal /></AppShell>
}
