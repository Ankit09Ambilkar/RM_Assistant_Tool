import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { AIBadge, Why } from '../components/ui'
import { FIXED_COUNT, MAX_AI_QUESTIONS, aiPool, buildProfile, interpret, nextFixedQuestion, validateAnswer, type Answers, type Question } from '../lib/discovery'
import { grokStatus } from '../lib/grok'
import { grokNextQuestion } from '../lib/ai'

type Shown = Question & { by?: 'grok' | 'demo' }

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

  const total = FIXED_COUNT + MAX_AI_QUESTIONS
  const step = Math.min(order.length + 1, total)
  const pct = Math.round((order.length / total) * 100)

  function finish(a: Answers) {
    if (saved.current) return
    saved.current = true
    const profile = buildProfile(a)
    addClient({ name: a.name || 'New Client', profile, interpretation: interpret(profile) })
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
          const g = await grokNextQuestion(answers, candidates, required)
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

  if (!q) return null

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <Link to="/dashboard" className="text-sm text-navy/60 hover:text-navy">
          ← Dashboard
        </Link>
        <span className="text-xs font-bold tracking-widest text-navy/60 uppercase">Client Discovery</span>
      </div>

      <div className="mb-2 flex justify-between text-xs font-semibold text-navy/60">
        <span>
          Step {step} of {total}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="mb-8 h-1.5 rounded-full bg-cream-dark">
        <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

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
