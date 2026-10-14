import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { AIBadge, Spinner, Why } from '../components/ui'
import {
  FIXED_COUNT,
  MAX_AI_QUESTIONS,
  aiPool,
  buildProfile,
  interpret,
  nextFixedQuestion,
  validateAnswer,
  type Answers,
  type Question,
} from '../lib/discovery'
import { grokStatus } from '../lib/grok'
import { extractClientFacts, grokNextQuestion } from '../lib/ai'
import { UNDERLYINGS } from '../lib/market'
import type { ExtractedFact, ExtractionResult } from '../lib/types'

type Shown = Question & { by?: 'grok' | 'demo' }

const FIELD_OPTIONS: Record<string, string[]> = {
  goal: ['Regular Income', 'Growth', 'Preserve Capital', 'Combination'],
  horizon: ['< 1 Year', '1–3 Years', '3–5 Years', '5+ Years'],
  riskAppetite: ['Conservative', 'Moderate', 'Aggressive'],
  maxLoss: ['5%', '10%', '15%', '20%', '30% or more'],
  underlying: UNDERLYINGS.map((u) => `${u.name} (${u.ticker})`),
  liquidity: ['Low', 'Medium', 'High'],
  experience: ['None', 'Some', 'Experienced'],
}

export default function Discovery() {
  const navigate = useNavigate()
  const { addClient } = useStore()
  const [answers, setAnswers] = useState<Answers>({})
  const [order, setOrder] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState<Shown | null>(nextFixedQuestion({}))
  const [thinking, setThinking] = useState(false)
  const [aiError, setAiError] = useState('')
  const [saveError, setSaveError] = useState('')
  const saved = useRef(false)
  const restore = useRef<string | null>(null) // previous answer to pre-fill after Back
  const asked = useRef(new Map<string, Shown | null>()) // cache Grok questions so Back doesn't re-call

  // Phase 3: Notes & RM Confirmation State
  const [clientNotes, setClientNotes] = useState('')
  const [showNotesPanel, setShowNotesPanel] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null)
  const [factsToReview, setFactsToReview] = useState<ExtractedFact[]>([])
  const [confirmedFacts, setConfirmedFacts] = useState<ExtractedFact[]>([])
  const [reviewMode, setReviewMode] = useState(false)
  const [extractionMsg, setExtractionMsg] = useState('')

  const total = FIXED_COUNT + MAX_AI_QUESTIONS
  const step = Math.min(order.length + 1, total)
  const pct = Math.round((order.length / total) * 100)

  function finish(a: Answers) {
    if (saved.current) return
    saved.current = true
    const profile = buildProfile(a)
    if (clientNotes.trim()) {
      profile.notes = clientNotes.trim()
    }
    if (confirmedFacts.length > 0) {
      profile.extractedFacts = confirmedFacts
    }
    addClient({
      name: a.name || 'New Client',
      profile,
      interpretation: interpret(profile),
      notes: clientNotes.trim() || undefined,
      extractedFacts: confirmedFacts.length > 0 ? confirmedFacts : undefined,
    })
      .then((client) => navigate(`/profile/${client.id}?new=1`, { replace: true }))
      .catch((e) => {
        saved.current = false
        setAiError('')
        setSaveError(e.message)
      })
  }

  // Work out the next question whenever the answers change.
  useEffect(() => {
    let alive = true
    const fixed = nextFixedQuestion(answers)
    if (fixed) {
      setQ(fixed)
      return
    }
    const { candidates, required } = aiPool(answers)
    if (candidates.length === 0) return finish(answers)

    const cacheKey = JSON.stringify(answers)
    if (asked.current.has(cacheKey)) {
      const hit = asked.current.get(cacheKey)!
      hit ? setQ(hit) : finish(answers)
      return
    }

    setThinking(true)
    ;(async () => {
      let next: Shown | null = { ...candidates[0], by: 'demo' }
      const st = await grokStatus()
      if (st.configured) {
        try {
          const g = await grokNextQuestion(answers, candidates, required, clientNotes)
          next = g ? { ...g, by: 'grok' } : null
          setAiError('')
        } catch (e) {
          setAiError(String((e as Error).message ?? e))
        }
      } else {
        await new Promise((r) => setTimeout(r, 600))
      }
      if (!alive) return
      asked.current.set(cacheKey, next)
      setThinking(false)
      next ? setQ(next) : finish(answers)
    })()
    return () => {
      alive = false
    }
  }, [answers])

  useEffect(() => {
    setDraft(restore.current ?? (q?.type === 'select' ? q.options![0] : ''))
    restore.current = null
  }, [q?.id])

  const draftError = q && draft.trim() ? validateAnswer(q, draft) : null

  function answer(value: string) {
    if (!q || validateAnswer(q, value)) return
    setAnswers({ ...answers, [q.id]: value.trim() })
    setOrder([...order, q.id])
  }

  function back() {
    if (order.length === 0) return navigate('/dashboard')
    const last = order[order.length - 1]
    const { [last]: prev, ...rest } = answers
    setAnswers(rest)
    setOrder(order.slice(0, -1))
    restore.current = prev ?? null
  }

  // ---------- Fact Confirmation Actions ----------
  async function handleExtractFacts() {
    if (!clientNotes.trim()) return
    setExtracting(true)
    setExtractionMsg('')
    try {
      const res = await extractClientFacts(clientNotes, answers)
      setExtraction(res)
      // ENFORCE: All extracted facts start as unconfirmed (confirmed === false)
      setFactsToReview(res.facts.map((f) => ({ ...f, confirmed: false })))
      setReviewMode(true)
    } catch (e) {
      setExtractionMsg(`Extraction failed: ${(e as Error).message ?? e}`)
    } finally {
      setExtracting(false)
    }
  }

  function toggleFactConfirm(field: string) {
    setFactsToReview((prev) =>
      prev.map((f) => (f.field === field ? { ...f, confirmed: !f.confirmed } : f))
    )
  }

  function updateFactValue(field: string, val: string | number) {
    setFactsToReview((prev) =>
      prev.map((f) => (f.field === field ? { ...f, value: val, displayValue: String(val) } : f))
    )
  }

  function rejectFact(field: string) {
    setFactsToReview((prev) => prev.filter((f) => f.field !== field))
  }

  function confirmAllFacts() {
    setFactsToReview((prev) => prev.map((f) => ({ ...f, confirmed: true })))
  }

  function deselectAllFacts() {
    setFactsToReview((prev) => prev.map((f) => ({ ...f, confirmed: false })))
  }

  function applyConfirmedFacts() {
    const confirmed = factsToReview.filter((f) => f.confirmed)
    if (confirmed.length === 0) {
      setExtractionMsg('No facts are confirmed yet. Check the facts you want to apply, or click "Cancel".')
      return
    }
    setConfirmedFacts(confirmed)
    const nextAnswers = { ...answers }
    const newOrder = [...order]
    for (const f of confirmed) {
      nextAnswers[f.field] = String(f.value)
      if (!newOrder.includes(f.field)) newOrder.push(f.field)
    }
    setAnswers(nextAnswers)
    setOrder(newOrder)
    setReviewMode(false)
    setShowNotesPanel(false)
    setExtractionMsg('')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <Link to="/dashboard" className="text-sm text-navy/60 hover:text-navy">
          ← Dashboard
        </Link>
        <span className="text-xs font-bold tracking-widest text-navy/60 uppercase">Client Discovery</span>
      </div>

      {/* Top Banner: Meeting Notes Indicator / Toggle */}
      {clientNotes && confirmedFacts.length > 0 && !showNotesPanel && !reviewMode && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-accent/20 bg-accent/5 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-base">📝</span>
            <span className="text-navy/80">
              <strong>Meeting Notes Active</strong> · {confirmedFacts.length} fact{confirmedFacts.length === 1 ? '' : 's'} confirmed
            </span>
          </div>
          <button
            onClick={() => { setShowNotesPanel(true); setReviewMode(true) }}
            className="cursor-pointer font-semibold text-accent hover:underline"
          >
            Review Notes & Facts ▾
          </button>
        </div>
      )}

      {/* Optional Client Notes Input Card */}
      {showNotesPanel && !reviewMode && (
        <div className="card mb-6 border-navy/15 bg-cream/50 p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-navy/70 uppercase">
                <span>📝 Client Meeting Notes</span>
                <span className="rounded bg-cream-dark px-1.5 py-0.5 text-[10px] font-normal text-navy/60">Optional</span>
              </div>
              <p className="mt-1 text-xs text-navy/60">
                Paste conversational notes, email summaries, or client background. AI will extract structured facts for your review.
              </p>
            </div>
            <button
              onClick={() => setShowNotesPanel(false)}
              className="cursor-pointer text-xs text-navy/40 hover:text-navy"
              title="Hide notes box"
            >
              ✕
            </button>
          </div>

          <textarea
            rows={4}
            className="input mt-3 text-sm"
            placeholder="e.g. Client is Dr. Ananya Roy. Looking for regular income from a ₹25 Lakhs investment over 1–3 years in Reliance Industries. She is conservative, uncomfortable with more than 10% loss, and needs high liquidity."
            value={clientNotes}
            onChange={(e) => setClientNotes(e.target.value)}
          />

          {extractionMsg && <p className="mt-2 text-xs text-bad">{extractionMsg}</p>}

          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={() => setShowNotesPanel(false)}
              className="cursor-pointer text-xs text-navy/60 hover:text-navy"
            >
              Skip and answer step-by-step →
            </button>
            <button
              onClick={handleExtractFacts}
              disabled={!clientNotes.trim() || extracting}
              className="btn-primary text-xs"
            >
              {extracting ? <Spinner text="Extracting facts with AI…" /> : '✨ Extract Facts with AI'}
            </button>
          </div>
        </div>
      )}

      {/* Interactive RM Confirmation Panel */}
      {reviewMode && extraction && (
        <div className="card mb-6 border-accent/30 bg-cream/80 p-6 sm:p-7 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-widest text-navy uppercase">
                AI-Extracted Facts for RM Review
              </span>
              <AIBadge source={extraction.source} />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={confirmAllFacts}
                className="cursor-pointer rounded border border-navy/20 px-2 py-1 text-xs font-semibold text-navy/70 hover:bg-cream-dark"
              >
                Confirm All
              </button>
              <button
                onClick={deselectAllFacts}
                className="cursor-pointer rounded border border-navy/20 px-2 py-1 text-xs font-semibold text-navy/70 hover:bg-cream-dark"
              >
                Deselect All
              </button>
            </div>
          </div>

          <p className="text-xs text-navy/70 leading-relaxed">{extraction.summary}</p>
          <p className="mt-1 text-[11px] font-semibold text-navy/50">
            {factsToReview.filter((f) => f.confirmed).length} of {factsToReview.length} facts confirmed. Unconfirmed or rejected facts will be asked as questions below.
          </p>

          {extractionMsg && <p className="mt-2 text-xs text-bad">{extractionMsg}</p>}

          {/* List of Extracted Facts for RM Review */}
          <div className="mt-4 divide-y divide-cream-dark rounded-lg border border-navy/15 bg-white">
            {factsToReview.length === 0 ? (
              <p className="p-4 text-center text-xs text-navy/50">No candidate facts extracted from notes.</p>
            ) : (
              factsToReview.map((f) => (
                <div key={f.field} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-navy">{f.label}</span>
                      {f.confidence && (
                        <span className={`rounded px-1.5 py-0.2 text-[9px] font-semibold ${
                          f.confidence === 'high' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {f.confidence.toUpperCase()} CONFIDENCE
                        </span>
                      )}
                    </div>

                    {/* Inline Editor for RM to tweak values */}
                    <div className="mt-1">
                      {FIELD_OPTIONS[f.field] ? (
                        <select
                          className="input py-1 text-xs font-semibold"
                          value={String(f.value)}
                          onChange={(e) => updateFactValue(f.field, e.target.value)}
                        >
                          {FIELD_OPTIONS[f.field].map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : typeof f.value === 'number' ? (
                        <input
                          type="number"
                          className="input py-1 text-xs font-semibold"
                          value={f.value}
                          onChange={(e) => updateFactValue(f.field, Number(e.target.value))}
                        />
                      ) : (
                        <input
                          type="text"
                          className="input py-1 text-xs font-semibold"
                          value={String(f.value)}
                          onChange={(e) => updateFactValue(f.field, e.target.value)}
                        />
                      )}
                    </div>

                    {f.sourceText && (
                      <p className="mt-1 text-[11px] text-navy/50 italic">
                        Found in notes: "{f.sourceText}"
                      </p>
                    )}
                  </div>

                  {/* Confirmation / Rejection Buttons */}
                  <div className="flex items-center gap-2 sm:ml-4">
                    <button
                      onClick={() => toggleFactConfirm(f.field)}
                      className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                        f.confirmed
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'border border-navy/20 text-navy hover:bg-cream-dark'
                      }`}
                    >
                      {f.confirmed ? '✓ Confirmed' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => rejectFact(f.field)}
                      className="cursor-pointer text-xs text-bad/70 hover:text-bad hover:underline px-1"
                      title="Reject this fact"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Missing Fields Notice */}
          {extraction.missingFields.length > 0 && (
            <div className="mt-3 rounded-md bg-cream/70 p-2.5 text-xs text-navy/70 border border-cream-dark">
              <span className="font-semibold text-navy">Missing dimensions: </span>
              {extraction.missingFields.map((m) => m.label).join(', ')}.
              <span className="text-navy/50 block mt-0.5">These will be asked as follow-up questions.</span>
            </div>
          )}

          {/* Review Panel Footer Actions */}
          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              onClick={() => setReviewMode(false)}
              className="btn-ghost text-xs"
            >
              ← Edit Notes
            </button>
            <button
              onClick={applyConfirmedFacts}
              className="btn-primary text-xs"
            >
              Apply Confirmed Facts & Continue →
            </button>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="mb-2 flex justify-between text-xs font-semibold text-navy/60">
        <span>
          Step {step} of {total}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="mb-8 h-1.5 rounded-full bg-cream-dark">
        <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      {/* Main Question Card */}
      {q && (
        <div className="card p-6 sm:p-8">
          {thinking ? (
            <div className="flex items-center gap-3 py-10 text-sm text-navy/60">
              <AIBadge />
              <span className="animate-pulse">Choosing the next most relevant question…</span>
            </div>
          ) : (
            <>
              {q.source === 'ai' && (
                <div className="mb-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold tracking-widest text-navy/60 uppercase">
                    <AIBadge source={q.by} /> AI guided question
                  </div>
                  {aiError && <p className="mb-1 text-xs text-warn">Grok unavailable ({aiError}). Using demo logic.</p>}
                  {q.context && <p className="text-sm text-navy/60">{q.context}</p>}
                </div>
              )}
              <h2 className="font-serif text-2xl font-normal">{q.text}</h2>

              <div className="mt-6">
                {q.type === 'single' && (
                  <div className={`grid gap-2 ${q.options!.length > 4 || q.options!.some((o) => o.length > 20) ? '' : 'sm:grid-cols-2'}`}>
                    {q.options!.map((o) => (
                      <button
                        key={o}
                        onClick={() => setDraft(o)}
                        className={`cursor-pointer rounded-lg border px-4 py-3 text-left text-sm font-medium transition ${
                          draft === o ? 'border-navy bg-accent text-[#ffffff]' : 'border-navy/15 hover:border-navy/50'
                        }`}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                )}
                {q.type === 'select' && (
                  <select className="input" value={draft} onChange={(e) => setDraft(e.target.value)}>
                    {q.options!.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                )}
                {(q.type === 'text' || q.type === 'number') && (
                  <div className="relative">
                    {q.suffix === '₹' && <span className="absolute top-1/2 left-3 -translate-y-1/2 text-navy/50">₹</span>}
                    <input
                      autoFocus
                      type={q.type}
                      min={0}
                      max={q.suffix === '%' ? 100 : undefined}
                      maxLength={q.type === 'text' ? 100 : undefined}
                      className={`input text-base ${q.suffix === '₹' ? 'pl-7' : ''}`}
                      placeholder={q.placeholder}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && answer(draft)}
                    />
                    {q.suffix === '%' && <span className="absolute top-1/2 right-3 -translate-y-1/2 text-navy/50">%</span>}
                  </div>
                )}
                {draftError && <p className="mt-2 text-sm text-bad">{draftError}</p>}
              </div>

              {q.why && <Why text={q.why} label="Why am I being asked this?" />}

              <div className="mt-8 flex justify-between">
                <button onClick={back} className="btn-ghost">
                  Back
                </button>
                <button onClick={() => answer(draft)} disabled={!draft.trim() || !!draftError} className="btn-primary">
                  Continue
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {saveError && (
        <div className="card mt-4 border-bad/40 p-4 text-sm">
          <p className="text-bad">Could not save the client: {saveError}</p>
          <button onClick={() => { setSaveError(''); finish(answers) }} className="btn-ghost mt-3">
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
