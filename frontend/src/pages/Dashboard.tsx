import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../components/Layout'
import api from '../api/client'
import { AlertTriangle, ArrowLeftRight, Building2, RefreshCw, TrendingUp } from 'lucide-react'

const TODAY = new Date().toISOString().split('T')[0]

interface DirectionStats {
  entrada: number
  saida: number
  confirmed_entrada: number
  confirmed_saida: number
  pending_entrada: number
  pending_saida: number
  total: number
  unique_lines: number
}

interface TurnStats extends DirectionStats {
  key: string
  label: string
}

interface ClientCard extends DirectionStats {
  client: string
}

interface UnitDashboard {
  unit: string
  total: DirectionStats
  turns: TurnStats[]
  client_cards: ClientCard[]
}

interface DashboardTurns {
  schedule_date: string
  units: UnitDashboard[]
  client_index: ClientCard[]
  excluded: ClientCard[]
}

interface DayStats {
  ocorrencias_hoje: number
  trocas_hoje: number
}

export function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(TODAY)
  const [dashboard, setDashboard] = useState<DashboardTurns | null>(null)
  const [dayStats, setDayStats] = useState<DayStats>({ ocorrencias_hoje: 0, trocas_hoje: 0 })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const todayLabel = useMemo(() => {
    const [year, month, day] = selectedDate.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }, [selectedDate])

  const loadStats = async () => {
    const [dash, inc, swp] = await Promise.all([
      api.get<DashboardTurns>('/schedule/dashboard-turns', { params: { schedule_date: selectedDate } }),
      api.get('/incidents/count', { params: { today: selectedDate === TODAY ? 'true' : undefined } }),
      api.get('/swaps/count'),
    ])
    setDashboard(dash.data)
    setDayStats({
      ocorrencias_hoje: inc.data.total,
      trocas_hoje: swp.data.total,
    })
  }

  useEffect(() => {
    setLoading(true)
    loadStats()
      .catch(() => setDashboard(null))
      .finally(() => setLoading(false))
  }, [selectedDate])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadStats().finally(() => setRefreshing(false))
  }

  return (
    <Layout>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <TrendingUp size={22} className="text-brand-600 dark:text-brand-400" />
            Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 capitalize mt-0.5">{todayLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="border dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg px-4 py-2 text-sm font-medium transition-all disabled:opacity-50"
            title="Atualizar dados"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw size={24} className="animate-spin text-brand-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Carregando dados...</p>
          </div>
        </div>
      ) : dashboard ? (
        <div className="space-y-6">
          <section>
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3">
              Registros do dia
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
              <a href="/incidents" className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4 hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-2 text-red-600 dark:text-red-400">
                  <AlertTriangle size={16} />
                  <p className="text-sm font-medium">Ocorrencias registradas</p>
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{dayStats.ocorrencias_hoje}</p>
              </a>
              <a href="/on-call" className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4 hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-2 text-brand-700 dark:text-brand-400">
                  <ArrowLeftRight size={16} />
                  <p className="text-sm font-medium">Trocas realizadas</p>
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{dayStats.trocas_hoje}</p>
              </a>
            </div>
          </section>

          {dashboard.units.length === 0 && (
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
              Nenhuma escala encontrada para a data selecionada.
            </div>
          )}

          {dashboard.units.map(unit => (
            <section key={unit.unit} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Building2 size={18} className="text-brand-700 dark:text-brand-400" />
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 uppercase">{unit.unit}</h2>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {unit.total.entrada} entradas | {unit.total.saida} saidas
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-3">
                {unit.turns.map(turn => (
                  <TurnCard key={turn.key} turn={turn} />
                ))}
              </div>

              {unit.client_cards.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                    Clientes avulsos
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {unit.client_cards.map(card => (
                      <ClientCardView key={card.client} card={card} />
                    ))}
                  </div>
                </div>
              )}
            </section>
          ))}

          {dashboard.client_index.length > 0 && (
            <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b dark:border-gray-700">
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Indice por cliente</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    <tr>
                      <th className="text-left px-4 py-2">Cliente</th>
                      <th className="text-right px-4 py-2">Linhas</th>
                      <th className="text-right px-4 py-2">Entradas</th>
                      <th className="text-right px-4 py-2">Saidas</th>
                      <th className="text-right px-4 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.client_index.map(row => (
                      <tr key={row.client} className="border-t dark:border-gray-700">
                        <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">{row.client}</td>
                        <td className="px-4 py-2 text-right text-gray-700 dark:text-gray-300">{row.unique_lines}</td>
                        <td className="px-4 py-2 text-right text-gray-700 dark:text-gray-300">{row.entrada}</td>
                        <td className="px-4 py-2 text-right text-gray-700 dark:text-gray-300">{row.saida}</td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-900 dark:text-gray-100">{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400 text-sm">Nao foi possivel carregar os dados.</p>
        </div>
      )}
    </Layout>
  )
}

function TurnCard({ turn }: { turn: TurnStats }) {
  const confirmed = turn.confirmed_entrada + turn.confirmed_saida
  const pct = turn.total > 0 ? Math.round((confirmed / turn.total) * 100) : 0
  const isAprendiz = turn.key === 'APRENDIZ'

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4 ${isAprendiz ? 'border-l-4 border-l-amber-500' : 'border-l-4 border-l-brand-600'}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">{isAprendiz ? 'Jovem aprendiz' : 'Turno'}</p>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{turn.label}</h3>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{turn.total}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">registros</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        <Metric label="Entradas" value={turn.entrada} />
        <Metric label="Saidas" value={turn.saida} />
      </div>

      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
        <div className="h-full bg-brand-600 dark:bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-green-50 dark:bg-green-900/20 rounded p-2">
          <p className="text-green-700 dark:text-green-300 font-semibold">Confirmadas</p>
          <p className="text-gray-600 dark:text-gray-300">E {turn.confirmed_entrada} | S {turn.confirmed_saida}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded p-2">
          <p className="text-gray-700 dark:text-gray-200 font-semibold">Pendentes</p>
          <p className="text-gray-600 dark:text-gray-300">E {turn.pending_entrada} | S {turn.pending_saida}</p>
        </div>
      </div>
    </div>
  )
}

function ClientCardView({ card }: { card: ClientCard }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 border-l-4 border-l-blue-500 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Cliente avulso</p>
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">{card.client}</h3>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Metric label="Entradas" value={card.entrada} />
        <Metric label="Saidas" value={card.saida} />
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700 rounded p-2">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  )
}
