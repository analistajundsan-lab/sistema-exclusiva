import { useEffect, useState } from 'react'
import { Layout } from '../components/Layout'
import api from '../api/client'
import { Sunrise, Sun, Moon, AlertTriangle, ArrowLeftRight, RefreshCw, TrendingUp } from 'lucide-react'

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
  const [refreshing, setRefreshing] = useState(false)

  const loadStats = () => {
    const base = { schedule_date: TODAY }
    return Promise.all([
      fetchCount({ ...base, status: 'pendente', start_time_gte: '05:00', start_time_lt: '12:00' }),
      fetchCount({ ...base, status: 'confirmada', start_time_gte: '05:00', start_time_lt: '12:00' }),
      fetchCount({ ...base, status: 'pendente', start_time_gte: '12:00', start_time_lt: '18:00' }),
      fetchCount({ ...base, status: 'confirmada', start_time_gte: '12:00', start_time_lt: '18:00' }),
      fetchCount({ ...base, status: 'pendente' }),
      fetchCount({ ...base, status: 'confirmada' }),
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
    }).catch(() => {})
  }

  useEffect(() => {
    loadStats().finally(() => setLoading(false))
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadStats().finally(() => setRefreshing(false))
  }

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

  const periods = stats ? [
    {
      label: 'Manhã',
      sub: '05h – 11h',
      data: stats.manha,
      Icon: Sunrise,
      gradient: 'from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/10',
      accent: 'border-amber-400',
      iconColor: 'text-amber-500',
      barColor: 'bg-amber-500',
      badgeBg: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
    },
    {
      label: 'Tarde',
      sub: '12h – 17h',
      data: stats.tarde,
      Icon: Sun,
      gradient: 'from-brand-50 to-emerald-50 dark:from-brand-900/20 dark:to-emerald-900/10',
      accent: 'border-brand-500',
      iconColor: 'text-brand-600 dark:text-brand-400',
      barColor: 'bg-brand-600 dark:bg-brand-500',
      badgeBg: 'bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300',
    },
    {
      label: 'Noite',
      sub: '18h – 04h',
      data: stats.noite,
      Icon: Moon,
      gradient: 'from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/10',
      accent: 'border-indigo-400',
      iconColor: 'text-indigo-500 dark:text-indigo-400',
      barColor: 'bg-indigo-500',
      badgeBg: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
    },
  ] : []

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <TrendingUp size={22} className="text-brand-600 dark:text-brand-400" />
            Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 capitalize mt-0.5">{today}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-50"
          title="Atualizar dados"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw size={24} className="animate-spin text-brand-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Carregando dados...</p>
          </div>
        </div>
      ) : stats ? (
        <div className="space-y-6">
          {/* Confirmações por período */}
          <section>
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Confirmações de linhas — hoje
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {periods.map(({ label, sub, data, Icon, gradient, accent, iconColor, barColor, badgeBg }) => {
                const total = data.pendente + data.confirmada
                const pct = total > 0 ? Math.round((data.confirmada / total) * 100) : 0
                return (
                  <div
                    key={label}
                    className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 border-l-4 ${accent} p-5 bg-gradient-to-br ${gradient} transition-shadow hover:shadow-md`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-xl bg-white/70 dark:bg-gray-800/70 ${iconColor}`}>
                          <Icon size={18} />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">{label}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{sub}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-3xl font-bold text-gray-800 dark:text-gray-100">{total}</span>
                        <p className="text-xs text-gray-400 dark:text-gray-500">linhas</p>
                      </div>
                    </div>

                    {/* Barra de progresso */}
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                        <span>{pct}% confirmadas</span>
                        <span>{total - data.confirmada} restantes</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`${barColor} h-2.5 rounded-full transition-all duration-700 ease-out`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeBg}`}>
                        {data.confirmada} confirm.
                      </span>
                      <span className="rounded-full px-3 py-1 text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                        {data.pendente} pendentes
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Registros do dia */}
          <section>
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Registros do dia
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
              <a
                href="/incidents"
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 border-l-4 border-l-red-400 p-5 hover:shadow-md transition-all group block"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-500">
                    <AlertTriangle size={16} />
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Ocorrências registradas</p>
                </div>
                <p className="text-4xl font-bold text-red-600 dark:text-red-400 mt-1 group-hover:scale-105 transition-transform origin-left">
                  {stats.ocorrencias_hoje}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">somente hoje</p>
              </a>

              <a
                href="/on-call"
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 border-l-4 border-l-brand-500 p-5 hover:shadow-md transition-all group block"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400">
                    <ArrowLeftRight size={16} />
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Trocas realizadas</p>
                </div>
                <p className="text-4xl font-bold text-brand-700 dark:text-brand-400 mt-1 group-hover:scale-105 transition-transform origin-left">
                  {stats.trocas_hoje}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">acumulado do dia</p>
              </a>
            </div>
          </section>
        </div>
      ) : (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4">
          <p className="text-red-600 dark:text-red-400 text-sm">Não foi possível carregar os dados.</p>
        </div>
      )}
    </Layout>
  )
}
