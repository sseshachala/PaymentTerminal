'use client'
import AppShell from '@/components/AppShell'
import CustomerForm, { EMPTY_CUSTOMER, CustomerData } from '@/components/CustomerForm'
import { useState, useEffect } from 'react'

interface Customer {
  id: string
  name: string
  email?: string
  phone?: string
  company?: string
  createdAt?: string
}

function CustomersContent() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CustomerData>(EMPTY_CUSTOMER)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  async function load(q = '') {
    setLoading(true)
    const url = q.length >= 2 ? `/api/customers?q=${encodeURIComponent(q)}` : '/api/customers/all'
    const res = await fetch(url)
    if (res.ok) setCustomers(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const t = setTimeout(() => load(search), 300)
    return () => clearTimeout(t)
  }, [search])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError('Failed to save customer'); return }
    setShowForm(false)
    setForm(EMPTY_CUSTOMER)
    load(search)
  }

  async function deleteCustomer(id: string) {
    await fetch('/api/customers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setConfirmDelete(null)
    load(search)
  }

  function openNew() {
    setForm(EMPTY_CUSTOMER)
    setEditId(null)
    setShowForm(true)
    setError('')
  }

  const displayed = customers

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Customers</h2>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Customer
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search by name, email, company or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : displayed.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-400 mb-3">{search ? 'No customers found.' : 'No customers yet.'}</p>
            <button onClick={openNew} className="text-blue-400 hover:text-blue-300 text-sm transition-colors">
              + Add your first customer
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Name', 'Company', 'Email', 'Phone', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((c) => (
                <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-gray-300">{c.company ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-300">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-300">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {confirmDelete === c.id ? (
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-xs text-gray-400">Delete?</span>
                        <button onClick={() => deleteCustomer(c.id)}
                          className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors">Yes</button>
                        <button onClick={() => setConfirmDelete(null)}
                          className="text-xs text-gray-500 hover:text-gray-300 transition-colors">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(c.id)}
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
        {displayed.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-800 text-xs text-gray-500">
            {displayed.length} customer{displayed.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* New Customer slide-over */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/50" onClick={() => setShowForm(false)} />

          {/* Panel */}
          <div className="w-full max-w-md bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h3 className="text-white font-semibold text-lg">New Customer</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <CustomerForm
                value={form}
                onChange={setForm}
                onSubmit={handleSave}
                saving={saving}
                submitLabel="Save Customer"
                onCancel={() => setShowForm(false)}
                error={error}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


export default function CustomersPage() {
  return <AppShell><CustomersContent /></AppShell>
}
