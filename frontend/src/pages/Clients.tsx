import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { PageHeader } from '../components/ui'
import { getUnderlying } from '../lib/market'
import { formatINR } from '../lib/format'

export default function Clients() {
  const { clients, analyses } = useStore()
  const navigate = useNavigate()

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Client investment profiles captured through discovery"
        right={
          <Link to="/discovery" className="btn-primary">
            + New client
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((c) => {
          const count = analyses.filter((a) => a.clientId === c.id).length
          return (
            <div key={c.id} className="card flex flex-col p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-accent font-semibold text-[#ffffff]">{c.name[0]}</div>
                <div>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-navy/60">{count} {count === 1 ? 'analysis' : 'analyses'}</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-navy/60">Goal</span>
                <span className="font-medium">{c.profile.goal}</span>
                <span className="text-navy/60">Amount</span>
                <span className="font-medium">{formatINR(c.profile.investmentAmount)}</span>
                <span className="text-navy/60">Risk</span>
                <span className="font-medium">{c.profile.riskAppetite}</span>
                <span className="text-navy/60">Max loss</span>
                <span className="font-medium">{c.profile.maxLossPct}%</span>
                <span className="text-navy/60">Interest</span>
                <span className="font-medium">{getUnderlying(c.profile.preferredUnderlying).name}</span>
              </div>
              <div className="mt-5 flex gap-2">
                <button onClick={() => navigate(`/profile/${c.id}`)} className="btn-ghost flex-1 px-3">
                  Profile
                </button>
                <button onClick={() => navigate(`/configure/${c.id}`)} className="btn-primary flex-1 px-3">
                  Configure
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
