import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import LogoMark from './LogoMark'

const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/clients', label: 'Clients' },
  { to: '/analyses', label: 'Analyses' },
  { to: '/reports', label: 'Reports' },
]

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      {light ? (
        // On dark/leather backgrounds the brown wave would disappear, so the mark sits on a cream tile.
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#f8f4ea]">
          <LogoMark className="h-8 w-8" />
        </div>
      ) : (
        <LogoMark className="h-11 w-11 -my-1" />
      )}
      <span
        className={`font-brand text-[24px] leading-none font-extrabold tracking-[-0.01em] ${light ? 'text-[#fbf3e6]' : 'text-navy'}`}
      >
        FitWise
      </span>
    </div>
  )
}

const navCls = (isActive: boolean) =>
  `rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition ${
    isActive ? 'bg-accent text-[#ffffff] stitch shadow-[0_6px_14px_-6px_rgba(60,20,8,0.7)]' : 'text-navy/75 hover:text-navy'
  }`

export default function Layout() {
  const { rmName, rm, online, logout } = useStore()
  const nav = NAV
  const navigate = useNavigate()
  const initials = rmName
    .split(' ')
    .map((p) => p[0])
    .join('')

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-40 px-4 pt-4">
        <div className="glass mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-full py-2 pr-2 pl-5">
          <button onClick={() => navigate('/dashboard')} className="cursor-pointer">
            <Logo />
          </button>
          <nav className="hidden gap-1 md:flex">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => navCls(isActive)}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {online === false && (
              <span title="Start the FastAPI backend on port 8000" className="hidden rounded-full bg-warn/10 px-2.5 py-1 text-[11px] text-warn sm:inline">
                Backend offline
              </span>
            )}
            <div className="hidden text-right text-xs sm:block">
              <div className="font-semibold text-navy">{rmName}</div>
              <div className="text-[11px] text-navy/55">{rm ? `${rm.designation.replace('Relationship Manager', 'RM')} · ${rm.branch.split(' – ')[0]}` : 'Relationship Manager'}</div>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-accent text-sm font-semibold text-[#ffffff] ring-2 ring-[#ffffff]/10">{initials}</div>
            <button onClick={async () => (await logout(), navigate('/'))} className="mr-2 cursor-pointer text-xs text-navy/55 hover:text-navy">
              Log out
            </button>
          </div>
        </div>
        <nav className="mx-auto mt-2 flex max-w-6xl gap-1 overflow-x-auto md:hidden">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => navCls(isActive)}>
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
