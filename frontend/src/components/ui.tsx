import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { SuitStatus } from '../lib/types'

export function PageHeader({ title, subtitle, back, right }: { title: string; subtitle?: string; back?: { to: string; label: string }; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {back && (
          <Link to={back.to} className="no-print mb-2 inline-block text-sm text-navy/60 hover:text-navy">
            ← {back.label}
          </Link>
        )}
        <h1 className="font-serif text-3xl font-normal">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-navy/60">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

const STATUS_STYLE: Record<SuitStatus, { icon: string; cls: string }> = {
  MATCH: { icon: '✓', cls: 'bg-match/10 text-match' },
  WARNING: { icon: '⚠', cls: 'bg-warn/10 text-warn' },
  MISMATCH: { icon: '✕', cls: 'bg-bad/10 text-bad' },
}

export function StatusBadge({ status }: { status: SuitStatus }) {
  const s = STATUS_STYLE[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide ${s.cls}`}>
      {s.icon} {status}
    </span>
  )
}

export function StatusIcon({ status }: { status: SuitStatus }) {
  const s = STATUS_STYLE[status]
  return <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${s.cls}`}>{s.icon}</span>
}

export function ConcernPill({ count }: { count: number }) {
  return count === 0 ? (
    <span className="rounded-full bg-match/10 px-2.5 py-0.5 text-xs font-semibold text-match">Complete</span>
  ) : (
    <span className="rounded-full bg-warn/10 px-2.5 py-0.5 text-xs font-semibold text-warn">
      {count} {count === 1 ? 'Concern' : 'Concerns'}
    </span>
  )
}

export function Why({ text, label = 'Why am I seeing this?' }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="cursor-pointer text-xs font-semibold tracking-wide text-navy/50 uppercase hover:text-navy">
        {open ? '▾' : '▸'} {label}
      </button>
      {open && <p className="mt-1 rounded-md bg-cream px-3 py-2 text-xs text-navy/70">{text}</p>}
    </div>
  )
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-cream-dark py-2 text-sm last:border-0">
      <span className="text-navy/60">{k}</span>
      <span className="text-right font-semibold">{v}</span>
    </div>
  )
}

export function AIBadge({ source }: { source?: 'grok' | 'demo' }) {
  const label = source === 'grok' ? 'AI · LIVE' : source === 'demo' ? 'AI · DEMO' : 'AI'
  return (
    <span
      title={source === 'demo' ? 'Rule-based demo output. Add XAI_API_KEY to use Grok.' : undefined}
      className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider ${source === 'demo' ? 'bg-cream-dark text-navy' : 'bg-accent text-[#ffffff]'}`}
    >
      {label}
    </span>
  )
}

export function Spinner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-navy/50">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-navy/20 border-t-navy" />
      {text}
    </div>
  )
}

export function PageLoading() {
  return (
    <div className="grid place-items-center py-24">
      <Spinner text="Loading…" />
    </div>
  )
}

const REVIEW_STYLE = {
  Pending: 'bg-navy/10 text-navy',
  Approved: 'bg-match/10 text-match',
  Flagged: 'bg-bad/10 text-bad',
} as const

export function ReviewBadge({ status }: { status: keyof typeof REVIEW_STYLE }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${REVIEW_STYLE[status]}`}>{status}</span>
}
