// Admin panel shell. No auth (prototype): anyone can open /admin.
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useStore } from '../../store'
import { Logo } from '../../components/Layout'

const navCls = (isActive: boolean) =>
  `rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition ${
    isActive ? 'bg-accent text-[#ffffff] stitch shadow-[0_6px_14px_-6px_rgba(60,20,8,0.7)]' : 'text-navy/75 hover:text-navy'
  }`

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/rms', label: 'RM Management' },
  { to: '/admin/reviews', label: 'Analysis Review' },
]

export default function AdminLayout() {
  const { logout } = useStore()
  const navigate = useNavigate()
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="glass mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-full py-2 pr-2 pl-5">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="rounded-full border border-warn/40 bg-warn/10 px-2.5 py-0.5 text-[10px] font-bold tracking-widest text-warn uppercase">Admin</span>
          </div>
          <nav className="hidden gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => navCls(isActive)}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-navy/60 sm:inline">Manager</span>
            <button onClick={async () => (await logout(), navigate('/admin'))} className="btn-ghost px-4 py-2 text-xs">
              Log out
            </button>
          </div>
        </div>
        <nav className="mx-auto mt-2 flex max-w-6xl gap-1 overflow-x-auto md:hidden">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => navCls(isActive)}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}

export function BackendDown({ error }: { error: string }) {
  return (
    <div className="card mx-auto max-w-lg p-6 text-center">
      <h2 className="font-serif text-xl font-normal">Backend not reachable</h2>
      <p className="mt-2 text-sm text-navy/60">The admin panel needs the FastAPI server. Start it with:</p>
      <pre className="mt-3 rounded-lg bg-cream p-3 text-left text-xs text-navy">cd backend && .venv/bin/uvicorn main:app --reload --port 8000</pre>
      <p className="mt-3 text-xs text-navy/40">{error}</p>
    </div>
  )
}
