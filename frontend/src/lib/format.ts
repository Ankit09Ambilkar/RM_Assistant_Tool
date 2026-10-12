const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export const formatINR = (n: number) => inr.format(Math.round(n))

export const formatLakh = (n: number) => `₹${(n / 100000).toFixed(2)}L`

export const formatSignedINR = (n: number) => (n >= 0 ? '+' : '−') + inr.format(Math.abs(Math.round(n)))

export const formatPct = (n: number, signed = false) =>
  `${signed && n > 0 ? '+' : ''}${n < 0 ? '−' : ''}${Math.abs(Math.round(n * 10) / 10)}%`

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export const uid = () => Math.random().toString(36).slice(2, 10)
