// Manager-only sign-in for the admin panel. RM accounts are refused here (and by the backend).
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../../components/Layout'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../store'

export default function AdminLogin() {
  const { signedIn, rmName, refresh } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!supabase) return setError('Manager sign-in needs Supabase to be configured.')
    if (!email.trim() || !password) return setError('Enter the manager email and password.')
    setBusy(true)
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (authError) throw new Error(/invalid login credentials/i.test(authError.message) ? 'Wrong email or password.' : authError.message)
      const me = await api.me()
      if (!me.isAdmin) {
        // An RM used their own login here: refuse and sign them back out.
        await supabase.auth.signOut()
        throw new Error('Only the manager account can open the admin panel.')
      }
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="card w-full max-w-md p-8">
        <div className="flex items-center justify-between">
          <Logo />
          <span className="rounded-full border border-warn/40 bg-warn/10 px-2.5 py-0.5 text-[10px] font-bold tracking-widest text-warn uppercase">Admin</span>
        </div>
        <h1 className="mt-6 font-serif text-3xl text-navy">Manager sign in</h1>
        <p className="mt-1 text-sm text-navy/65">The admin panel is restricted to the manager account.</p>
        {signedIn && (
          <p className="mt-3 rounded-lg bg-cream px-3 py-2 text-xs text-navy/70">
            You're signed in as {rmName}. Signing in here switches to the manager account.
          </p>
        )}

        <label className="label mt-6" htmlFor="mgr-email">
          Manager email
        </label>
        <input id="mgr-email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="label mt-4" htmlFor="mgr-pw">
          Password
        </label>
        <input id="mgr-pw" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}

        <button disabled={busy} className="btn-primary mt-6 w-full py-3">
          {busy ? 'Signing in…' : 'Sign in to admin'}
        </button>
        <Link to="/" className="mt-5 block text-center text-sm text-navy/60 hover:text-navy">
          ← Back to FitWise
        </Link>
      </form>
    </div>
  )
}
