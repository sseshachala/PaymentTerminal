'use client'
import { useState } from 'react'

export interface CustomerData {
  name: string
  email: string
  phone: string
}

export const EMPTY_CUSTOMER: CustomerData = { name: '', email: '', phone: '' }

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

const validPhone = (p: string) => p.replace(/\D/g, '').length === 10
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

interface Props {
  value: CustomerData
  onChange: (v: CustomerData) => void
  onSubmit: (e: React.FormEvent) => void
  saving: boolean
  submitLabel: string
  onCancel: () => void
  error?: string
}

export default function CustomerForm({ value, onChange, onSubmit, saving, submitLabel, onCancel, error }: Props) {
  const [phoneError, setPhoneError] = useState('')
  const [emailError, setEmailError] = useState('')

  const set = (field: keyof CustomerData) => (v: string) => onChange({ ...value, [field]: v })

  function handlePhone(raw: string) {
    const formatted = formatPhone(raw)
    set('phone')(formatted)
    setPhoneError(formatted && !validPhone(formatted) ? 'Enter a valid 10-digit US phone number' : '')
  }

  function handleEmail(v: string) {
    set('email')(v)
    setEmailError(v && !validEmail(v) ? 'Enter a valid email address' : '')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    let valid = true
    if (value.phone && !validPhone(value.phone)) { setPhoneError('Enter a valid 10-digit US phone number'); valid = false }
    if (value.email && !validEmail(value.email)) { setEmailError('Enter a valid email address'); valid = false }
    if (!valid) return
    onSubmit(e)
  }

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm'
  const errCls = 'text-red-400 text-xs mt-1'
  const req = <span className="text-red-400 ml-0.5">*</span>

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Full Name {req}</label>
        <input required value={value.name} onChange={(e) => set('name')(e.target.value)}
          placeholder="John Smith" className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
          <input type="email" value={value.email} onChange={(e) => handleEmail(e.target.value)}
            placeholder="john@example.com (optional)"
            className={`${inputCls} ${emailError ? 'border-red-500 focus:ring-red-500' : ''}`} />
          {emailError && <p className={errCls}>{emailError}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Phone</label>
          <input type="tel" value={value.phone} onChange={(e) => handlePhone(e.target.value)}
            placeholder="(555) 555-5555 (optional)"
            className={`${inputCls} ${phoneError ? 'border-red-500 focus:ring-red-500' : ''}`} />
          {phoneError && <p className={errCls}>{phoneError}</p>}
        </div>
      </div>

      {error && (
        <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving || !!phoneError || !!emailError}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors">
          {saving ? 'Saving...' : submitLabel}
        </button>
        <button type="button" onClick={onCancel}
          className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}
