'use client'

export interface LineItem {
  description: string
  qty: string
  unitPrice: string
}

export const EMPTY_LINE_ITEM: LineItem = { description: '', qty: '1', unitPrice: '' }

interface Props {
  items: LineItem[]
  onChange: (items: LineItem[]) => void
  taxRate: number
  taxEnabled: boolean
  onTaxToggle: (v: boolean) => void
}

function rowTotal(item: LineItem) {
  const qty = parseFloat(item.qty) || 0
  const price = parseFloat(item.unitPrice) || 0
  return qty * price
}

export function calcTotals(items: LineItem[], taxRate: number, taxEnabled: boolean) {
  const subtotal = items.reduce((s, i) => s + rowTotal(i), 0)
  const taxAmount = taxEnabled ? subtotal * taxRate : 0
  return { subtotal, taxAmount, total: subtotal + taxAmount }
}

const inputCls = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm w-full'

export default function LineItems({ items, onChange, taxRate, taxEnabled, onTaxToggle }: Props) {
  function set(i: number, field: keyof LineItem, v: string) {
    const next = [...items]
    next[i] = { ...next[i], [field]: v }
    onChange(next)
  }

  function add() { onChange([...items, { ...EMPTY_LINE_ITEM }]) }

  function remove(i: number) {
    if (items.length === 1) return
    onChange(items.filter((_, idx) => idx !== i))
  }

  const { subtotal, taxAmount, total } = calcTotals(items, taxRate, taxEnabled)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-gray-300">Line Items</label>
        <button type="button" onClick={add}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add item
        </button>
      </div>

      {/* Header */}
      <div className="grid grid-cols-12 gap-2 px-1">
        <span className="col-span-6 text-xs text-gray-500 uppercase tracking-wide">Description</span>
        <span className="col-span-2 text-xs text-gray-500 uppercase tracking-wide">Qty</span>
        <span className="col-span-3 text-xs text-gray-500 uppercase tracking-wide">Unit Price</span>
        <span className="col-span-1" />
      </div>

      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-center">
          <input required value={item.description} onChange={(e) => set(i, 'description', e.target.value)}
            placeholder="Description" className={`${inputCls} col-span-6`} />
          <input required type="number" min="0.01" step="any" value={item.qty}
            onChange={(e) => set(i, 'qty', e.target.value)}
            placeholder="1" className={`${inputCls} col-span-2`} />
          <div className="col-span-3 relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input required type="number" min="0.01" step="0.01" value={item.unitPrice}
              onChange={(e) => set(i, 'unitPrice', e.target.value)}
              placeholder="0.00" className={`${inputCls} pl-6`} />
          </div>
          <button type="button" onClick={() => remove(i)}
            className="col-span-1 text-gray-600 hover:text-red-400 transition-colors flex justify-center"
            disabled={items.length === 1}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {rowTotal(item) > 0 && (
            <div className="col-span-11 text-right text-xs text-gray-500 pr-1">
              ${rowTotal(item).toFixed(2)}
            </div>
          )}
        </div>
      ))}

      {/* Totals */}
      <div className="border-t border-gray-700 pt-3 space-y-1.5">
        <div className="flex justify-between text-sm text-gray-400">
          <span>Subtotal</span>
          <span className="font-mono">${subtotal.toFixed(2)}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 cursor-pointer text-gray-400">
            <input type="checkbox" checked={taxEnabled} onChange={(e) => onTaxToggle(e.target.checked)}
              className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500" />
            Tax ({(taxRate * 100).toFixed(2)}%)
          </label>
          <span className="font-mono text-gray-400">${taxAmount.toFixed(2)}</span>
        </div>

        <div className="flex justify-between text-base font-semibold text-white pt-1 border-t border-gray-700">
          <span>Total</span>
          <span className="font-mono">${total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}
