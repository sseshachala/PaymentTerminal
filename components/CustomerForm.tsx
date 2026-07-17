'use client'
import { useEffect, useRef, useState } from 'react'

export interface CustomerData {
  name: string
  company: string
  email: string
  phone: string
  address1: string
  address2: string
  city: string
  state: string
  zip: string
  notes: string
}

export const EMPTY_CUSTOMER: CustomerData = {
  name: '', company: '', email: '', phone: '',
  address1: '', address2: '', city: '', state: '', zip: '',
  notes: '',
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function validatePhone(p: string) {
  return p.replace(/\D/g, '').length === 10
}

function validateEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

declare global {
  interface Window { google: any; initGooglePlaces: () => void }
}

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
  const address1Ref = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<any>(null)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const [phoneError, setPhoneError] = useState('')
  const [emailError, setEmailError] = useState('')

  useEffect(() => { valueRef.current = value }, [value])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const set = (field: keyof CustomerData) => (v: any) => onChange({ ...value, [field]: v })

  // Google Places
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    if (!key || typeof window === 'undefined') return
    if (window.google?.maps?.places) { initAutocomplete(); return }
    window.initGooglePlaces = initAutocomplete
    if (!document.querySelector('#google-maps-script')) {
      const s = document.createElement('script')
      s.id = 'google-maps-script'
      s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&callback=initGooglePlaces`
      s.async = true
      document.head.appendChild(s)
    }
  }, [])

  useEffect(() => {
    if (window.google?.maps?.places && address1Ref.current) initAutocomplete()
  }, [address1Ref.current])

  function initAutocomplete() {
    if (!address1Ref.current || !window.google?.maps?.places) return
    autocompleteRef.current = new window.google.maps.places.Autocomplete(address1Ref.current, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['address_components'],
    })
    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current.getPlace()
      if (!place.address_components) return
      let address1 = '', city = '', state = '', zip = ''
      for (const c of place.address_components) {
        const t = c.types[0]
        if (t === 'street_number') address1 = c.long_name + ' '
        if (t === 'route') address1 += c.long_name
        if (t === 'locality') city = c.long_name
        if (t === 'administrative_area_level_1') state = c.short_name
        if (t === 'postal_code') zip = c.long_name
      }
      onChangeRef.current({ ...valueRef.current, address1: address1.trim(), city, state, zip })
    })
  }

  function handlePhone(raw: string) {
    const formatted = formatPhone(raw)
    set('phone')(formatted)
    setPhoneError(formatted && !validatePhone(formatted) ? 'Enter a valid 10-digit US phone number' : '')
  }

  function handleEmail(v: string) {
    set('email')(v)
    setEmailError(v && !validateEmail(v) ? 'Enter a valid email address' : '')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    let valid = true
    if (!validatePhone(value.phone)) { setPhoneError('Enter a valid 10-digit US phone number'); valid = false }
    if (!validateEmail(value.email)) { setEmailError('Enter a valid email address'); valid = false }
    if (!valid) return
    onSubmit(e)
  }

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm'
  const errCls = 'text-red-400 text-xs mt-1'
  const req = <span className="text-red-400 ml-0.5">*</span>

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Full Name {req}</label>
        <input required value={value.name} onChange={(e) => set('name')(e.target.value)}
          placeholder="John Smith" className={inputCls} />
      </div>

      {/* Company */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Company</label>
        <input value={value.company} onChange={(e) => set('company')(e.target.value)}
          placeholder="Acme Auto Parts" className={inputCls} />
      </div>

      {/* Email + Phone */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Email {req}</label>
          <input required type="email" value={value.email} onChange={(e) => handleEmail(e.target.value)}
            placeholder="john@example.com"
            className={`${inputCls} ${emailError ? 'border-red-500 focus:ring-red-500' : ''}`} />
          {emailError && <p className={errCls}>{emailError}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Phone {req}</label>
          <input required type="tel" value={value.phone} onChange={(e) => handlePhone(e.target.value)}
            placeholder="(555) 555-5555"
            className={`${inputCls} ${phoneError ? 'border-red-500 focus:ring-red-500' : ''}`} />
          {phoneError && <p className={errCls}>{phoneError}</p>}
        </div>
      </div>

      {/* Address 1 */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Address 1 {req}</label>
        <input ref={address1Ref} required value={value.address1}
          onChange={(e) => set('address1')(e.target.value)}
          placeholder="123 Main St" className={inputCls} autoComplete="off" />
      </div>

      {/* Address 2 */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Address 2</label>
        <input value={value.address2} onChange={(e) => set('address2')(e.target.value)}
          placeholder="Suite 100, Unit B..." className={inputCls} />
      </div>

      {/* City / State / ZIP */}
      <div className="grid grid-cols-6 gap-3">
        <div className="col-span-3">
          <label className="block text-sm font-medium text-gray-300 mb-1">City {req}</label>
          <input required value={value.city} onChange={(e) => set('city')(e.target.value)}
            placeholder="New York" className={inputCls} />
        </div>
        <div className="col-span-1">
          <label className="block text-sm font-medium text-gray-300 mb-1">State {req}</label>
          <input required value={value.state}
            onChange={(e) => set('state')(e.target.value.toUpperCase().slice(0, 2))}
            placeholder="NY" maxLength={2} className={inputCls} />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-300 mb-1">ZIP {req}</label>
          <input required value={value.zip}
            onChange={(e) => set('zip')(e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="10001" maxLength={5} className={inputCls} />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
        <textarea value={value.notes} onChange={(e) => set('notes')(e.target.value)}
          placeholder="Preferences, payment terms, special instructions..."
          rows={3}
          className={`${inputCls} resize-none`} />
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
