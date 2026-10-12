// Landing + mock login: no real auth. The email picks which RM you are (any password).
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/Layout'
import Story from '../components/story/Story'
import { useStore } from '../store'
import { api } from '../lib/api'
import { authConfigured, supabase } from '../lib/supabase'
import type { RM } from '../lib/types'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useStore()
  const [open, setOpen] = useState(false)
  // Real accounts → empty form. Demo mode (no Supabase keys) keeps the pre-filled demo sign-in.
  const [email, setEmail] = useState(authConfigured ? '' : 'priya.sharma@mindsparks.demo')
  const [password, setPassword] = useState(authConfigured ? '' : 'demo')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [rms, setRms] = useState<RM[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!authConfigured) api.rms().then((r) => setRms(r.filter((x) => x.status === 'Active'))).catch(() => {})
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const selected = rms.find((r) => r.email === email)

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    setError('')
    setInfo('')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Enter a valid email address.')
    if (!password) return setError('Password is required.')
    setBusy(true)
    try {
      const rm = await login(email, password)
      if (!rm) return setError('No RM with this email. Pick one of the demo RMs.')
      navigate(rm.id === 'admin' ? '/admin' : '/dashboard')
    } catch (err) {
      const msg = (err as Error).message
      setError(/invalid login credentials/i.test(msg) ? 'Wrong email or password.' : msg)
    } finally {
      setBusy(false)
    }
  }

  async function forgotPassword() {
    setError('')
    setInfo('')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Enter your email above first, then click "Forgot password?".')
    const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` })
    if (error) return setError(error.message)
    setInfo('If an account exists for this email, a reset link is on its way.')
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <section className="relative">
        <header className="relative z-10 flex justify-center px-4 pt-5">
          <nav className="glass flex w-full max-w-3xl items-center justify-between gap-4 rounded-full py-2 pr-2 pl-5">
            <Logo />
            <div className="hidden items-center gap-8 text-sm font-medium text-navy/80 md:flex">
              <a href="#about" className="hover:text-navy">
                About Us
              </a>
              <a href="#features" className="hover:text-navy">
                Features
              </a>
              <a href="#benefits" className="hover:text-navy">
                Benefits
              </a>
              <a href="#faq" className="hover:text-navy">
                FAQ
              </a>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setOpen(true)} className="btn-primary px-6">
                Sign In
              </button>
            </div>
          </nav>
        </header>

        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-6 px-6 pt-10 pb-12 sm:px-10 lg:min-h-[calc(100vh-88px)] lg:grid-cols-[1fr_auto] lg:pt-4">
          <div className="max-w-xl">
            <p className="text-xs font-semibold tracking-widest text-navy/60 uppercase">Structured products · for relationship managers</p>
            <h1 className="mt-4 font-serif text-5xl leading-[1.02] text-navy sm:text-6xl xl:text-7xl">
              Invest in what{' '}
              <span className="relative inline-block">
                fits
                <svg aria-hidden="true" viewBox="0 0 200 30" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-4 w-full">
                  <path d="M4 18 C 50 8, 120 6, 196 14 M 10 25 C 70 16, 130 16, 190 22" stroke="#8c3a24" strokeWidth="4" fill="none" strokeLinecap="round" />
                </svg>
              </span>
              ,
              <br />
              not just what pays.
            </h1>
            <p id="about" className="mt-6 max-w-md text-[15px] leading-relaxed text-navy/80">
              FitWise brings AI client discovery, structured-product payoffs on real market data and clear suitability checks into one
              guided workspace for relationship managers.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => setOpen(true)} className="btn-primary px-8 py-3">
                Get Started
              </button>
              <button onClick={() => navigate('/register')} className="btn-ghost px-6 py-3">
                Register as RM
              </button>
            </div>
          </div>

          {/* the animated story; edges fade into the paper */}
          <Story className="mx-auto aspect-[5/7] w-[min(92vw,calc(min(78vh,760px)*0.714))] [mask-image:radial-gradient(ellipse_80%_82%_at_50%_50%,#000_74%,transparent_100%)]" />
        </div>
      </section>

      <section id="features" className="relative z-10 mx-auto grid max-w-6xl gap-4 px-6 pb-20 sm:grid-cols-3 sm:px-10">
        {[
          ['AI client discovery', 'Adaptive follow-up questions build a structured risk profile in minutes.'],
          ['Payoff on real data', 'Python payoff engine plus live Yahoo Finance history for every underlying.'],
          ['Explainable suitability', 'Four rule-based checks, each with a reason and a next step.'],
        ].map(([t, d]) => (
          <div key={t} className="card p-6">
            <div className="mb-4 h-1 w-10 rounded-full bg-accent" />
            <h3 className="font-serif text-xl text-navy">{t}</h3>
            <p className="mt-2 text-sm text-navy/65">{d}</p>
          </div>
        ))}
      </section>

      <section id="benefits" className="relative z-10 mx-auto max-w-6xl px-6 pb-16 sm:px-10">
        <h2 className="font-serif text-3xl text-navy">Benefits</h2>
        <ul className="mt-4 grid gap-3 text-sm text-navy/75 sm:grid-cols-2">
          {[
            'One flow from client discovery to a client-ready explanation',
            'Deterministic payoff maths in Python, never guessed by AI',
            'Every warning comes with a reason and a next step',
            'Admin review queue so risky proposals get a second look',
          ].map((b) => (
            <li key={b} className="card px-4 py-3">
              {b}
            </li>
          ))}
        </ul>
      </section>

      <section id="faq" className="relative z-10 mx-auto max-w-6xl px-6 pb-20 sm:px-10">
        <h2 className="font-serif text-3xl text-navy">FAQ</h2>
        <div className="mt-4 space-y-3">
          {[
            [
              'What does this platform do?',
              'It helps users configure a structured product, visualize payoff scenarios using market data, check whether the product fits a client profile, and explain the risks in simple language.',
            ],
            [
              'Who is this platform for?',
              'It is designed for Relationship Managers, advisory teams, managers, and financially aware clients who want to understand structured products more clearly.',
            ],
            [
              'Does the platform use real market data?',
              'Yes. Historical price data can be used to visualize the underlying asset, test past market periods, and support scenario analysis.',
            ],
            [
              'How does the suitability check work?',
              'The platform compares the product with client factors such as risk appetite, investment horizon, loss tolerance, and existing portfolio concentration, then highlights possible mismatches.',
            ],
            [
              'Does the AI decide what a client should invest in?',
              'No. The AI helps with client discovery, explanations, and highlighting relevant considerations. Product payoff and suitability calculations should come from defined rules and calculation logic.',
            ],
          ].map(([q, a]) => (
            <details key={q} className="card px-5 py-4">
              <summary className="cursor-pointer font-semibold text-navy">{q}</summary>
              <p className="mt-2 text-sm text-navy/70">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="relative z-10 mx-auto max-w-6xl px-4 pb-5 sm:px-6">
        <div className="bg-accent relative overflow-hidden rounded-2xl px-6 py-6 text-[#fbf3e6] shadow-[0_20px_34px_-22px_rgba(40,14,6,0.9)] sm:px-9">
          {/* stitched edge, like the wallet */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-2 rounded-[12px] border-2 border-dashed border-[#efc79c]/60" />

          <div className="relative grid gap-6 sm:grid-cols-[1.2fr_0.8fr_1.6fr] sm:items-start">
            <div>
              <Logo light />
              <p className="mt-2 font-[Caveat] text-2xl leading-none text-[#fbf3e6]">Invest in what fits.</p>
            </div>

            <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm sm:grid sm:grid-cols-2">
              {[
                ['About Us', '#about'],
                ['Features', '#features'],
                ['Benefits', '#benefits'],
                ['FAQ', '#faq'],
              ].map(([label, href]) => (
                <a key={href} href={href} className="text-[#fbf3e6]/85 hover:text-[#ffffff] hover:underline">
                  {label}
                </a>
              ))}
            </nav>

            <p className="text-xs leading-relaxed text-[#fbf3e6]/75">
              Market data: Yahoo Finance via yfinance. Scenarios are illustrative, not predictions. Not investment advice; the relationship
              manager makes the final suitability decision.
            </p>
          </div>

          <div className="relative mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-[#efc79c]/40 pt-3 text-xs text-[#fbf3e6]/70">
            <span>© {new Date().getFullYear()} FitWise</span>
            <a href="#top" onClick={(e) => (e.preventDefault(), window.scrollTo({ top: 0, behavior: 'smooth' }))} className="hover:text-[#ffffff]">
              Back to top ↑
            </a>
          </div>
        </div>
      </footer>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#0d1f24]/55 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="glass w-full max-w-md rounded-3xl p-7">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-serif text-2xl text-navy">Sign in</h2>
                <p className="mt-1 text-sm text-navy/60">{selected ? `${selected.designation} · ${selected.branch.split(' – ')[0]}` : 'Relationship Manager workspace'}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="cursor-pointer text-xl text-navy/40 hover:text-navy">
                ✕
              </button>
            </div>

            {rms.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {rms.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => setEmail(r.email)}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition ${
                      email === r.email ? 'border-transparent bg-accent text-[#ffffff]' : 'border-navy/30 text-navy/70 hover:border-mint-dark hover:text-navy'
                    }`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}

            <label className="label mt-5" htmlFor="email">
              Email
            </label>
            <input id="email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            <div className="mt-4 flex items-baseline justify-between">
              <label className="label" htmlFor="pw">
                Password
              </label>
              {authConfigured && (
                <button type="button" onClick={forgotPassword} className="cursor-pointer text-xs font-medium text-mint hover:underline">
                  Forgot password?
                </button>
              )}
            </div>
            <input id="pw" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p className="mt-3 text-sm text-bad">{error}</p>}
            {info && <p className="mt-3 text-sm text-match">{info}</p>}

            <button disabled={busy} className="btn-primary mt-6 w-full py-3">
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
            <p className="mt-2 text-center text-sm text-navy/70">
              New RM?{' '}
              <button type="button" onClick={() => navigate('/register')} className="cursor-pointer font-semibold text-mint underline">
                Register here
              </button>
            </p>
          </form>
        </div>
      )}
    </div>
  )
}
