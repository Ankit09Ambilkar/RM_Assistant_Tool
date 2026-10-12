// Landing page for Supabase "reset password" email links: the link signs the user in for recovery,
// then they choose a new password here.
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Layout'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session))
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setBusy(true)
    const { error } = await supabase!.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(error.message)
    navigate('/dashboard')
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="card w-full max-w-md p-8">
        <Logo />
        <h1 className="mt-6 font-serif text-3xl text-navy">Set a new password</h1>
        {!supabase ? (
          <p className="mt-3 text-sm text-navy/70">Password reset isn't available in demo mode.</p>
        ) : !ready ? (
          <p className="mt-3 text-sm text-navy/70">Open this page from the reset link in your email. The link signs you in for the reset.</p>
        ) : (
          <>
            <label className="label mt-6" htmlFor="np">
              New password
            </label>
            <input id="np" type="password" autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
            <label className="label mt-4" htmlFor="npc">
              Confirm password
            </label>
            <input id="npc" type="password" autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {error && <p className="mt-3 text-sm text-bad">{error}</p>}
            <button disabled={busy} className="btn-primary mt-6 w-full py-3">
              {busy ? 'Saving…' : 'Save password'}
            </button>
          </>
        )}
        <Link to="/" className="mt-5 block text-center text-sm text-navy/60 hover:text-navy">
          ← Back to sign in
        </Link>
      </form>
    </div>
  )
}
