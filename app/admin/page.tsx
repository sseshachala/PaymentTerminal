'use client'
import AppShell from '@/components/AppShell'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface PaymentAccount {
  id: string; name: string; location: string; provider: string; publishableKey: string
  dailyLimitCents: number; usedTodayCents: number; isActive: boolean
}

interface Settings {
  tax_rate: string
  logo_url: string
  locations: string
  company_name: string
  company_address1: string
  company_address2: string
  company_city: string
  company_state: string
  company_zip: string
  company_phone: string
  company_email: string
}

const EMPTY_SETTINGS: Settings = {
  tax_rate: '8.25', logo_url: '', locations: 'Main',
  company_name: '', company_address1: '', company_address2: '',
  company_city: '', company_state: '', company_zip: '',
  company_phone: '', company_email: '',
}

function parseLocations(csv: string): string[] {
  return csv.split(',').map(s => s.trim()).filter(Boolean)
}

function AdminContent() {
  const { data: session } = useSession()
  const router = useRouter()
  const user = session?.user as any

  useEffect(() => {
    if (session && user?.role !== 'admin') router.push('/')
  }, [session, user, router])

  const [accounts, setAccounts] = useState<PaymentAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [provider, setProvider] = useState<'stripe' | 'square'>('stripe')
  const [form, setForm] = useState({
    name: '', location: 'Main', dailyLimitCents: 100000,
    // stripe
    publishableKey: '', secretKey: '',
    // square
    applicationId: '', accessToken: '', locationId: '', sandbox: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState('')

  async function load() {
    const res = await fetch('/api/payment-accounts')
    if (res.ok) setAccounts(await res.json())
    setLoading(false)
  }

  async function loadSettings() {
    const res = await fetch('/api/settings')
    if (!res.ok) return
    const d = await res.json()
    setSettings({
      tax_rate: d.tax_rate ? String(parseFloat(d.tax_rate) * 100) : '8.25',
      logo_url: d.logo_url ?? '',
      locations: d.locations ?? 'Main',
      company_name: d.company_name ?? '',
      company_address1: d.company_address1 ?? '',
      company_address2: d.company_address2 ?? '',
      company_city: d.company_city ?? '',
      company_state: d.company_state ?? '',
      company_zip: d.company_zip ?? '',
      company_phone: d.company_phone ?? '',
      company_email: d.company_email ?? '',
    })
  }

  useEffect(() => { load(); loadSettings() }, [])

  const locationOptions = parseLocations(settings.locations)

  useEffect(() => {
    if (locationOptions.length && !locationOptions.includes(form.location)) {
      setForm(p => ({ ...p, location: locationOptions[0] }))
    }
  }, [settings.locations])

  async function addAccount(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const payload = provider === 'stripe'
      ? { provider, name: form.name, location: form.location, publishableKey: form.publishableKey, secretKey: form.secretKey, dailyLimitCents: form.dailyLimitCents }
      : { provider, name: form.name, location: form.location, applicationId: form.applicationId, accessToken: form.accessToken, locationId: form.locationId, sandbox: form.sandbox, dailyLimitCents: form.dailyLimitCents }
    const res = await fetch('/api/payment-accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(JSON.stringify(data.error)); return }
    setForm({ name: '', location: 'Main', dailyLimitCents: 100000, publishableKey: '', secretKey: '', applicationId: '', accessToken: '', locationId: '', sandbox: false })
    load()
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    setSettingsSaving(true); setSettingsMsg('')
    const payload = {
      ...settings,
      tax_rate: String(parseFloat(settings.tax_rate) / 100),
    }
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSettingsSaving(false)
    setSettingsMsg(res.ok ? 'Saved.' : 'Error saving settings.')
    setTimeout(() => setSettingsMsg(''), 3000)
  }

  async function toggleAccount(id: string, isActive: boolean) {
    await fetch('/api/payment-accounts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive }),
    })
    load()
  }

  async function updateAccount(id: string, patch: { name?: string; location?: string; dailyLimitCents?: number }) {
    await fetch('/api/payment-accounts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
    load()
  }

  const set = (k: keyof Settings) => (v: string) => setSettings(p => ({ ...p, [k]: v }))

  if (user?.role !== 'admin') return null

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <h2 className="text-xl font-bold text-white">Admin Settings</h2>

      {/* Stripe Accounts list */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Payment Accounts</h3>
        </div>
        {loading ? <div className="p-6 text-gray-400 text-sm">Loading...</div> :
          accounts.length === 0 ? <div className="p-6 text-gray-400 text-sm">No accounts yet.</div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Name', 'Location', 'Provider', 'Daily Limit', 'Used Today', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const pct = Math.round((a.usedTodayCents / a.dailyLimitCents) * 100)
                return (
                  <tr key={a.id} className={`border-b border-gray-800/50 ${!a.isActive ? 'opacity-50' : ''}`}>
                    {/* Inline-editable name */}
                    <td className="px-4 py-3">
                      <input
                        defaultValue={a.name}
                        onBlur={(e) => { if (e.target.value !== a.name) updateAccount(a.id, { name: e.target.value }) }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        className="bg-transparent text-white font-medium w-full focus:outline-none focus:bg-gray-800 focus:px-2 rounded transition-all"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={locationOptions.includes(a.location) ? a.location : ''}
                        onChange={(e) => updateAccount(a.id, { location: e.target.value })}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {!locationOptions.includes(a.location) && <option value="">{a.location}</option>}
                        {locationOptions.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        a.provider === 'stripe' ? 'bg-purple-900/40 text-purple-300' : 'bg-blue-900/40 text-blue-300'
                      }`}>{a.provider}</span>
                    </td>
                    {/* Inline-editable daily limit */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400">$</span>
                        <input
                          type="number"
                          defaultValue={a.dailyLimitCents / 100}
                          onBlur={(e) => {
                            const cents = Math.round(parseFloat(e.target.value) * 100)
                            if (cents !== a.dailyLimitCents) updateAccount(a.id, { dailyLimitCents: cents })
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                          className="bg-transparent text-gray-300 w-20 focus:outline-none focus:bg-gray-800 focus:px-2 rounded transition-all"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-700 rounded-full h-1.5 w-20">
                          <div className={`h-1.5 rounded-full ${pct > 80 ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <span className="text-gray-400 text-xs">${(a.usedTodayCents / 100).toFixed(0)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.isActive ? 'bg-green-900/40 text-green-400 border border-green-800' : 'bg-gray-700 text-gray-400'
                      }`}>{a.isActive ? 'Active' : 'Paused'}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => toggleAccount(a.id, !a.isActive)}
                        className={`text-xs transition-colors ${a.isActive ? 'text-gray-400 hover:text-red-400' : 'text-blue-400 hover:text-blue-300'}`}>
                        {a.isActive ? 'Pause' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Payment Account */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Add Payment Account</h3>
        <form onSubmit={addAccount} className="space-y-4">
          {/* Provider toggle */}
          <div className="flex gap-2 p-1 bg-gray-800 rounded-lg w-fit">
            {(['stripe', 'square'] as const).map(p => (
              <button key={p} type="button" onClick={() => setProvider(p)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                  provider === p ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}>{p}</button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Account Name" required value={form.name} onChange={(v) => setForm(p => ({ ...p, name: v }))} placeholder="Account A" />
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Location</label>
              <select value={form.location} onChange={(e) => setForm(p => ({ ...p, location: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {locationOptions.length === 0 && <option value="">Add locations in Settings</option>}
                {locationOptions.map(loc => <option key={loc} value={loc}>{loc}</option>)}
              </select>
            </div>
            <Field label="Daily Limit ($)" type="number" required
              value={String(form.dailyLimitCents / 100)}
              onChange={(v) => setForm(p => ({ ...p, dailyLimitCents: Math.round(parseFloat(v) * 100) }))}
              placeholder="1000" />
          </div>

          {provider === 'stripe' && (<>
            <Field label="Publishable Key (pk_...)" required value={form.publishableKey}
              onChange={(v) => setForm(p => ({ ...p, publishableKey: v }))} placeholder="pk_live_..." />
            <Field label="Secret Key — stored encrypted" required type="password" value={form.secretKey}
              onChange={(v) => setForm(p => ({ ...p, secretKey: v }))} placeholder="sk_live_..." />
          </>)}

          {provider === 'square' && (<>
            <Field label="Application ID" required value={form.applicationId}
              onChange={(v) => setForm(p => ({ ...p, applicationId: v }))} placeholder="sq0idp-..." />
            <Field label="Location ID" required value={form.locationId}
              onChange={(v) => setForm(p => ({ ...p, locationId: v }))} placeholder="L..." />
            <Field label="Access Token — stored encrypted" required type="password" value={form.accessToken}
              onChange={(v) => setForm(p => ({ ...p, accessToken: v }))} placeholder="EAAAl..." />
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input type="checkbox" checked={form.sandbox} onChange={e => setForm(p => ({ ...p, sandbox: e.target.checked }))}
                className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500" />
              Sandbox / test mode
            </label>
          </>)}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={saving}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-6 py-2 rounded-lg transition-colors text-sm">
            {saving ? 'Saving...' : 'Add Account'}
          </button>
        </form>
      </div>

      {/* Company & Email Settings */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Company &amp; Email Settings</h3>
        <form onSubmit={saveSettings} className="space-y-4">

          {/* Company identity */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Company Name" value={settings.company_name} onChange={set('company_name')} placeholder="Acme Auto Parts" />
            <Field label="Company Phone" value={settings.company_phone} onChange={set('company_phone')} placeholder="(555) 555-5555" />
          </div>
          <Field label="Company Email" type="email" value={settings.company_email} onChange={set('company_email')} placeholder="billing@yourcompany.com" />

          {/* Address */}
          <Field label="Address Line 1" value={settings.company_address1} onChange={set('company_address1')} placeholder="123 Main St" />
          <Field label="Address Line 2" value={settings.company_address2} onChange={set('company_address2')} placeholder="Suite 100" />
          <div className="grid grid-cols-6 gap-3">
            <div className="col-span-3">
              <Field label="City" value={settings.company_city} onChange={set('company_city')} placeholder="Dallas" />
            </div>
            <div className="col-span-1">
              <Field label="State" value={settings.company_state} onChange={(v) => set('company_state')(v.toUpperCase().slice(0, 2))} placeholder="TX" />
            </div>
            <div className="col-span-2">
              <Field label="ZIP" value={settings.company_zip} onChange={(v) => set('company_zip')(v.replace(/\D/g, '').slice(0, 5))} placeholder="75001" />
            </div>
          </div>

          <div className="border-t border-gray-800 pt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Tax Rate (%)</label>
              <input type="number" step="0.01" min="0" max="100" value={settings.tax_rate}
                onChange={(e) => setSettings(p => ({ ...p, tax_rate: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <Field label="Logo URL" value={settings.logo_url} onChange={set('logo_url')} placeholder="https://..." />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Locations (comma-separated)</label>
            <input type="text" value={settings.locations} onChange={(e) => set('locations')(e.target.value)}
              placeholder="Main, LA"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-gray-500 mt-1">Agents pick from this list at checkout. Each payment account is assigned to one.</p>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button type="submit" disabled={settingsSaving}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-6 py-2 rounded-lg transition-colors text-sm">
              {settingsSaving ? 'Saving...' : 'Save Settings'}
            </button>
            {settingsMsg && <span className="text-sm text-green-400">{settingsMsg}</span>}
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, required, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void
  required?: boolean; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1">{label}</label>
      <input type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  )
}

export default function AdminPage() {
  return <AppShell><AdminContent /></AppShell>
}
