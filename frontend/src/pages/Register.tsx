// RM self-registration: the backend creates the Supabase login + RM profile together (POST /api/v1/auth/register),
// then we sign in with the same password. In demo mode (no Supabase keys) only the RM profile is created.
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Layout'
import { api } from '../lib/api'
import { useStore } from '../store'
import type { RM } from '../lib/types'

const REGIONS: RM['region'][] = ['North', 'South', 'East', 'West']

interface Form {
  name: string
  email: string
  phone: string
  employee_id: string
  designation: string
  branch: string
  region: RM['region']
  certifications: string
  password: string
  confirm: string
  agree: boolean
}

const EMPTY: Form = {
  name: '',
  email: '',
  phone: '',
  employee_id: '',
  designation: 'Relationship Manager',
  branch: '',
  region: 'West',
  certifications: '',
  password: '',
  confirm: '',
  agree: false,
}

function validate(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {}
  if (f.name.trim().length < 2 || f.name.trim().length > 100 || !/\p{L}/u.test(f.name)) e.name = 'Enter your full name (2–100 characters).'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) e.email = 'Enter a valid work email.'
  if (f.phone && !/^[0-9+\-\s()]{7,20}$/.test(f.phone.trim())) e.phone = 'Use digits, spaces, +, - or brackets (7–20 characters).'
  if (!f.employee_id.trim()) e.employee_id = 'Employee ID is required.'
  else if (f.employee_id.trim().length > 30) e.employee_id = 'Max 30 characters.'
  if (!f.branch.trim()) e.branch = 'Branch is required.'
  if (f.password.length < 8) e.password = 'At least 8 characters.'
  if (f.confirm !== f.password) e.confirm = 'Passwords do not match.'
  if (!f.agree) e.agree = 'Please confirm the details are correct.'
  return e
}

export default function Register() {
  const navigate = useNavigate()
  const { login } = useStore()
  const [f, setF] = useState<Form>(EMPTY)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState('')

  const errors = validate(f)
  const show = (k: keyof Form) => (touched ? errors[k] : undefined)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((prev) => ({ ...prev, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    setServerError('')
    if (Object.keys(errors).length) return
    setBusy(true)
    try {
      await api.register({
        name: f.name.trim(),
        email: f.email.trim(),
        password: f.password,
        phone: f.phone.trim(),
        employee_id: f.employee_id.trim(),
        designation: f.designation,
        branch: f.branch.trim(),
        region: f.region,
        certifications: f.certifications
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
      })
      await login(f.email.trim(), f.password)
      navigate('/dashboard')
    } catch (err) {
      const msg = (err as Error).message
      setServerError(/Failed to fetch|NetworkError/.test(msg) ? 'The server is offline. Start the backend and try again.' : msg)
      setBusy(false)
    }
  }

  const field = (k: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={`reg-${k}`}>
        {label}
      </label>
      <input
        id={`reg-${k}`}
        className={`input ${show(k) ? 'border-bad' : ''}`}
        value={String(f[k])}
        onChange={(e) => set(k, e.target.value as never)}
        {...props}
      />
      {show(k) && <p className="mt-1 text-xs text-bad">{show(k)}</p>}
    </div>
  )

  return (
    <div className="min-h-screen px-4 py-6">
      <header className="flex justify-center">
        <nav className="glass flex w-full max-w-3xl items-center justify-between gap-4 rounded-full py-2 pr-2 pl-5">
          <Link to="/">
            <Logo />
          </Link>
          <span className="text-sm text-navy/70">
            Already registered?{' '}
            <Link to="/" className="font-semibold text-mint underline">
              Sign in
            </Link>
          </span>
        </nav>
      </header>

      <main className="mx-auto mt-10 max-w-2xl">
        <h1 className="font-serif text-4xl text-navy sm:text-5xl">Register as an RM</h1>
        <p className="mt-2 text-sm text-navy/75">Create your relationship manager workspace. Your profile appears in the admin panel for review.</p>

        <form onSubmit={submit} noValidate className="card mt-6 p-6 sm:p-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{field('name', 'Full name', { autoComplete: 'name', maxLength: 100, placeholder: 'e.g. Meera Iyer' })}</div>
            {field('email', 'Work email', { type: 'email', autoComplete: 'email', placeholder: 'name@bank.com' })}
            {field('phone', 'Phone (optional)', { type: 'tel', autoComplete: 'tel', placeholder: '+91 98xxx xxxxx' })}
            {field('employee_id', 'Employee ID', { maxLength: 30, placeholder: 'EMP-1234' })}
            {field('branch', 'Branch', { maxLength: 100, placeholder: 'e.g. Pune – Koregaon Park' })}
            <div>
              <label className="label" htmlFor="reg-region">
                Region
              </label>
              <select id="reg-region" className="input" value={f.region} onChange={(e) => set('region', e.target.value as RM['region'])}>
                {REGIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>{field('certifications', 'Certifications (optional)', { placeholder: 'NISM Series XV, CFP' })}</div>
            {field('password', 'Password', { type: 'password', autoComplete: 'new-password' })}
            {field('confirm', 'Confirm password', { type: 'password', autoComplete: 'new-password' })}
          </div>


          <label className="mt-4 flex items-start gap-2 text-sm text-navy/80">
            <input type="checkbox" className="mt-1 accent-[#8c3a24]" checked={f.agree} onChange={(e) => set('agree', e.target.checked)} />
            I confirm these details are correct.
          </label>
          {show('agree') && <p className="mt-1 text-xs text-bad">{show('agree')}</p>}

          {serverError && <p className="mt-4 text-sm text-bad">Could not register: {serverError}</p>}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Link to="/" className="text-sm text-navy/60 hover:text-navy">
              ← Back
            </Link>
            <button disabled={busy} className="btn-primary px-8 py-3">
              {busy ? 'Creating account…' : 'Create account'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
