import { useEffect, useState } from 'react'
import { Layout } from '../components/Layout'
import api from '../api/client'

const TODAY = new Date().toISOString().split('T')[0]

interface PeriodStats {
  pendente: number
  confirmada: number
}

interface DashStats {
  manha: PeriodStats
  tarde: PeriodStats
  noite: PeriodStats
  ocorrencias_hoje: number
  trocas_hoje: number
}

async function fetchCount(params: Record<string, string | undefined>): Promise<number> {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<string, string>
  const res = await api.get('/schedule/lines/count', { params: clean })
  return res.data.total
}

export function Dashboard() {
  const [stats, setStats] = useState<DashStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const base = { schedule_date: TODAY }

    Promise.all([
      // manhã: 05:00–11:59
      fetchCount({ ...base, status: 'pendente', start_time_gte: '05:00', start_time_lt: '12:00' }),
      fetchCount({ ...base, status: 'confirmada', start_time_gte: '05:00', start_time_lt: '12:00' }),
      // tarde: 12:00–17:59
      fetchCount({ ...base, status: 'pendente', start_time_gte: '12:00', start_time_lt: '18:00' }),
      fetchCount({ ...base, status: 'confirmada', start_time_gte: '12:00', start_time_lt: '18:00' }),
      // noite: 18:00–04:59 (total - manhã - tarde)
      fetchCount({ ...base, status: 'pendente' }),
      fetchCount({ ...base, status: 'confirmada' }),
      // ocorrências e trocas do dia
      api.get('/incidents/count', { params: { today: 'true' } }),
      api.get('/swaps/count'),
    ]).then(([mp, mc, tp, tc, totP, totC, inc, swp]) => {
      const noitePend = (totP as number) - (mp as number) - (tp as number)
      const noiteConf = (totC as number) - (mc as number) - (tc as number)
      setStats({
        manha: { pendente: mp as number, confirmada: mc as number },
        tarde: { pendente: tp as number, confirmada: tc as number },
        noite: { pendente: Math.max(0, noitePend), confirmada: Math.max(0, noiteConf) },
        ocorrencias_hoje: (inc as any).data.total,
        trocas_hoje: (swp as any).data.total,
      })
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-sm text-gray-500 capitalize">{today}</p>
      </div>

      {loading ? (
        <p className="text-gray-500">Carregando...</p>
      ) : stats ? (
        <div className="space-y-6">
          {/* Confirmações por período */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Confirmações de linhas — hoje</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {([
                { label: 'Manhã', sub: '05h – 11h', data: stats.manha, color: 'border-amber-400' },
                { label: 'Tarde', sub: '12h – 17h', data: stats.tarde, color: 'border-brand-600' },
                { label: 'Noite', sub: '18h – 04h', data: stats.noite, color: 'border-indigo-400' },
              ] as const).map(({ label, sub, data, color }) => {
                const total = data.pendente + data.confirmada
                const pct = total > 0 ? Math.round((data.confirmada / total) * 100) : 0
                return (
                  <div key={label} className={`bg-white rounded-lg shadow p-5 border-l-4 ${color}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-semibold text-gray-800">{label}</p>
                        <p className="text-xs text-gray-400">{sub}</p>
                      </div>
                      <span className="text-2xl font-bold text-gray-700">{total}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span className="text-green-600 font-medium">{data.confirmada} confirmadas</span>
                      <span className="text-yellow-600 font-medium">{data.pendente} pendentes</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Ocorrências e trocas do dia */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Registros do dia</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
              <a href="/incidents" className="bg-white rounded-lg shadow p-5 border-l-4 border-red-400 hover:shadow-md transition-shadow block">
                <p className="text-sm text-gray-500">Ocorrências registradas</p>
                <p className="text-3xl font-bold mt-1 text-red-600">{stats.ocorrencias_hoje}</p>
                <p className="text-xs text-gray-400 mt-1">somente hoje</p>
              </a>
              <a href="/on-call" className="bg-white rounded-lg shadow p-5 border-l-4 border-brand-600 hover:shadow-md transition-shadow block">
                <p className="text-sm text-gray-500">Trocas realizadas</p>
                <p className="text-3xl font-bold mt-1 text-brand-700">{stats.trocas_hoje}</p>
                <p className="text-xs text-gray-400 mt-1">acumulado do dia</p>
              </a>
            </div>
          </section>
        </div>
      ) : (
        <p className="text-red-500 text-sm">Não foi possível carregar os dados.</p>
      )}
    </Layout>
  )
}
