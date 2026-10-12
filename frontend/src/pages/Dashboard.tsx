import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { AnalysesTable } from './Analyses'
import { Note, Wallet } from '../components/story/Story'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const { rmName, clients, analyses, resetDemo, isAdmin } = useStore()
  const navigate = useNavigate()
  const [picking, setPicking] = useState(false)

  return (
    <div>
      <section className="card relative -mx-4 overflow-hidden px-6 py-10 sm:mx-0 sm:px-10">
        <div className="relative z-10 max-w-lg">
          <p className="text-xs font-semibold tracking-widest text-navy/55 uppercase">
            {clients.length} clients · {analyses.length} analyses
          </p>
          <h1 className="mt-2 font-serif text-4xl text-navy sm:text-5xl">
            {greeting()},{' '}
            <span className="relative inline-block">
              {rmName.split(' ')[0]}
              <svg aria-hidden="true" viewBox="0 0 200 30" preserveAspectRatio="none" className="absolute -bottom-1 left-0 h-3 w-full">
                <path d="M4 18 C 50 8, 120 6, 196 14" stroke="#8c3a24" strokeWidth="4" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
        </div>
        {/* little wallet doodle from the landing story */}
        <div aria-hidden="true" className="pointer-events-none absolute right-6 bottom-[-18px] hidden h-[190px] w-[230px] md:block">
          <Note style={{ left: 22, top: -52, transform: 'rotate(-6deg) scale(0.62)', transformOrigin: 'bottom left' }} />
          <Note style={{ left: 80, top: -62, transform: 'rotate(4deg) scale(0.62)', transformOrigin: 'bottom left' }} />
          <Wallet style={{ left: 0, top: 70, width: 200, height: 140 }} />
        </div>
      </section>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <button onClick={() => navigate('/discovery')} className="card group cursor-pointer p-6 text-left transition hover:border-mint-dark">
          <div className="mb-4 grid h-10 w-10 place-items-center rounded-full bg-accent stitch text-xl text-[#fbf3e6]">+</div>
          <h2 className="font-serif text-2xl">New client analysis</h2>
          <p className="mt-1 text-sm text-navy/60">Start AI-guided client discovery</p>
        </button>
        <button onClick={() => setPicking(true)} className="card group cursor-pointer p-6 text-left transition hover:border-mint-dark">
          <div className="mb-4 grid h-10 w-10 place-items-center rounded-full border border-navy/30 bg-white text-xl">↗</div>
          <h2 className="font-serif text-2xl">Analyze product</h2>
          <p className="mt-1 text-sm text-navy/60">Skip discovery if a client profile already exists</p>
        </button>
      </div>

      <h2 className="mt-10 mb-3 text-xs font-medium tracking-widest text-navy/60 uppercase">Recent analyses</h2>
      <AnalysesTable limit={5} />
      {isAdmin && (
      <button onClick={resetDemo} className="mt-4 cursor-pointer text-xs text-navy/40 underline hover:text-navy">
        Reset demo data
      </button>
      )}

      {picking && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy/50 px-4" onClick={() => setPicking(false)}>
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-xl font-normal">Choose a client</h3>
            <p className="mb-4 text-sm text-navy/60">Go straight to product configuration</p>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {clients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/configure/${c.id}`)}
                  className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-cream-dark p-3 text-left hover:border-navy"
                >
                  <div>
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-xs text-navy/60">
                      {c.profile.goal} · {c.profile.riskAppetite} · {c.profile.horizon}
                    </div>
                  </div>
                  <span className="text-navy/40">→</span>
                </button>
              ))}
            </div>
            <button onClick={() => setPicking(false)} className="btn-ghost mt-4 w-full">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
