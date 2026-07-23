'use client'
import AppShell from '@/components/AppShell'
import { useState, useEffect, useRef } from 'react'

interface Transaction {
  id: string; amountCents: number; amountDisplay: string; refundedCents: number; status: string
  createdAt: string; last4: string; cardBrand: string
  customerName: string; accountName: string; accountProvider: string; agentName: string
}

type Period = 'today' | 'week' | 'month' | 'quarter'
const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
]

function TransactionList() {
  const [data, setData] = useState<Transaction[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [exportOpen, setExportOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [refundTarget, setRefundTarget] = useState<string | null>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [refunding, setRefunding] = useState(false)
  const [refundError, setRefundError] = useState('')
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function close(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  function loadPage() {
    setLoading(true)
    fetch(`/api/transactions?page=${page}`)
      .then((r) => r.json())
      .then((d) => { setData(d.data ?? []); setTotal(d.total ?? 0); setLoading(false) })
  }

  useEffect(() => { loadPage() }, [page])

  function doExport(period: Period) {
    setExportOpen(false)
    window.location.href = `/api/transactions/export?period=${period}`
  }

  async function deleteTransaction(id: string) {
    await fetch('/api/transactions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setConfirmDelete(null)
    loadPage()
  }

  function openRefund(tx: Transaction) {
    const refundable = tx.amountCents - tx.refundedCents
    setRefundTarget(tx.id)
    setRefundAmount((refundable / 100).toFixed(2))
    setRefundError('')
  }

  async function doRefund(id: string) {
    setRefunding(true)
    setRefundError('')
    const amountCents = Math.round(parseFloat(refundAmount) * 100)
    const res = await fetch(`/api/transactions/${id}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountCents }),
    })
    const json = await res.json()
    setRefunding(false)
    if (!res.ok) { setRefundError(json.error ?? 'Refund failed'); return }
    setRefundTarget(null)
    loadPage()
  }

  const totalPages = Math.ceil(total / 25)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Transactions</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{total.toLocaleString()} total</span>
          <div className="relative" ref={exportRef}>
            <button onClick={() => setExportOpen(o => !o)}
              className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </button>
            {exportOpen && (
              <div className="absolute right-0 mt-1 w-40 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 overflow-hidden">
                {PERIODS.map(p => (
                  <button key={p.value} onClick={() => doExport(p.value)}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors">
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No transactions yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Date', 'Customer', 'Amount', 'Card', 'Status', 'Account', 'Agent', '', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((tx) => (
                <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap font-mono text-xs">
                    {new Date(tx.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-white">{tx.customerName}</td>
                  <td className="px-4 py-3">
                    <span className="text-white font-semibold">{tx.amountDisplay}</span>
                    {tx.refundedCents > 0 && (
                      <span className={`ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        tx.refundedCents >= tx.amountCents
                          ? 'bg-orange-900/40 text-orange-400 border border-orange-800'
                          : 'bg-yellow-900/40 text-yellow-400 border border-yellow-800'
                      }`}>
                        {tx.refundedCents >= tx.amountCents ? 'refunded' : `-$${(tx.refundedCents / 100).toFixed(2)}`}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-300 capitalize">{tx.cardBrand} ••••{tx.last4}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      tx.status === 'succeeded' ? 'bg-green-900/40 text-green-400 border border-green-800'
                        : tx.status === 'failed' ? 'bg-red-900/40 text-red-400 border border-red-800'
                        : 'bg-yellow-900/40 text-yellow-400 border border-yellow-800'
                    }`}>{tx.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    <span>{tx.accountName}</span>
                    {tx.accountProvider && (
                      <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${tx.accountProvider === 'stripe' ? 'bg-purple-900/50 text-purple-300' : 'bg-blue-900/50 text-blue-300'}`}>
                        {tx.accountProvider}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{tx.agentName}</td>
                  <td className="px-4 py-3 text-right">
                    {refundTarget === tx.id ? (
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-xs text-gray-400">$</span>
                        <input
                          type="number" step="0.01" min="0.01"
                          value={refundAmount}
                          onChange={e => setRefundAmount(e.target.value)}
                          className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-xs text-white text-right focus:outline-none focus:border-blue-500"
                        />
                        {refundError && <span className="text-xs text-red-400">{refundError}</span>}
                        <button onClick={() => doRefund(tx.id)} disabled={refunding}
                          className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors disabled:opacity-40">
                          {refunding ? '...' : 'Refund'}
                        </button>
                        <button onClick={() => setRefundTarget(null)}
                          className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Cancel</button>
                      </div>
                    ) : tx.status === 'succeeded' && tx.refundedCents < tx.amountCents ? (
                      <button onClick={() => openRefund(tx)}
                        className="text-xs text-gray-500 hover:text-blue-400 font-medium transition-colors">
                        Refund
                      </button>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {confirmDelete === tx.id ? (
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-xs text-gray-400">Delete?</span>
                        <button onClick={() => deleteTransaction(tx.id)}
                          className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors">Yes</button>
                        <button onClick={() => setConfirmDelete(null)}
                          className="text-xs text-gray-500 hover:text-gray-300 transition-colors">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(tx.id)}
                        className="text-gray-600 hover:text-red-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded-lg text-sm text-gray-300 transition-colors">
              Previous
            </button>
            <span className="text-sm text-gray-400">Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded-lg text-sm text-gray-300 transition-colors">
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function TransactionsPage() {
  return <AppShell><TransactionList /></AppShell>
}
