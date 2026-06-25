import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layout } from '../components/Layout'
import api from '../api/client'
import { currentOperationDate } from '../config/demo'
import { openScheduleStream } from '../utils/scheduleStream'
import { AlertTriangle, ArrowLeftRight, Building2, RefreshCw, TrendingUp } from 'lucide-react'

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
  // "Hoje" no fuso BRT, recalculado ao vivo (ver efeito de virada de dia abaixo):
  // o painel e diario e passa para o proximo dia sozinho a partir das 00:00 BRT.
  const [today, setToday] = useState(currentOperationDate())
  const [selectedDate, setSelectedDate] = useState(today)
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
      timeZone: 'America/Sao_Paulo',
    })
  }, [selectedDate])

  const loadStats = useCallback(async () => {
    const [dash, inc, swp] = await Promise.all([
      api.get<DashboardTurns>('/schedule/dashboard-turns', { params: { schedule_date: selectedDate } }),
      api.get('/incidents/count', { params: { today: selectedDate === today ? 'true' : undefined } }),
      api.get('/swaps/count', { params: { schedule_date: selectedDate } }),
    ])
    setDashboard(dash.data)
    setDayStats({
      ocorrencias_hoje: inc.data.total,
      trocas_hoje: swp.data.total,
    })
  }, [selectedDate, today])

  useEffect(() => {
    setLoading(true)
    loadStats()
      .catch(() => setDashboard(null))
      .finally(() => setLoading(false))
    const interval = window.setInterval(() => {
      loadStats().catch(() => setDashboard(null))
    }, 8000)
    return () => window.clearInterval(interval)
  }, [loadStats])

  // Virada de dia (00:00 BRT): se o dia BRT mudou e o operador esta vendo "hoje",
  // o painel passa a mostrar o novo dia — zerando os dados do dia anterior.
  const todayRef = useRef(today)
  todayRef.current = today
  const selectedRef = useRef(selectedDate)
  selectedRef.current = selectedDate
  useEffect(() => {
    const t = window.setInterval(() => {
      const d = currentOperationDate()
      if (d !== todayRef.current) {
        const wasToday = selectedRef.current === todayRef.current
        setToday(d)
        if (wasToday) setSelectedDate(d)
      }
    }, 30000)
    return () => window.clearInterval(t)
  }, [])

  // Tempo-real (<1s): ao confirmar/trocar/cancelar, o backend faz push via SSE e
  // o painel recarrega na hora — sem esperar o ciclo de 8s. Camada ADITIVA: se a
  // conexao cair, o polling acima cobre. O handler le sempre o estado mais
  // recente (ref), entao o stream nao reconecta a cada mudanca de data.
  const onStreamRef = useRef<(ev: { schedule_date?: string | null }) => void>(() => {})
  onStreamRef.current = (ev) => {
    if (ev.schedule_date && ev.schedule_date !== selectedDate) return
    loadStats().catch(() => {})
  }
  useEffect(() => {
    const close = openScheduleStream((ev) => onStreamRef.current(ev))
    return close
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadStats().finally(() => setRefreshing(false))
  }

  return (
    <Layout>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            <TrendingUp size={24} className="text-brand-700 dark:text-brand-400" />
            Dashboard
          </h1>
          <p className="mt-0.5 text-sm capitalize text-gray-500 dark:text-gray-400">{todayLabel}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Data
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="input mt-1 w-auto py-1.5 text-sm font-normal"
            />
          </label>
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="btn-secondary gap-1.5 px-2.5 py-1.5 text-sm font-medium"
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
            <h2 className="section-title mb-3">
              Registros do dia
            </h2>
            <div className="grid grid-cols-2 gap-3 max-w-xl">
              <a href="/incidents" className="card card-hover block p-4">
                <div className="flex items-center gap-2 mb-2 text-red-600 dark:text-red-400">
                  <AlertTriangle size={16} />
                  <p className="text-sm font-medium">Ocorrências registradas</p>
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{dayStats.ocorrencias_hoje}</p>
              </a>
              <a href="/on-call" className="card card-hover block p-4">
                <div className="flex items-center gap-2 mb-2 text-brand-700 dark:text-brand-400">
                  <ArrowLeftRight size={16} />
                  <p className="text-sm font-medium">Trocas realizadas</p>
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{dayStats.trocas_hoje}</p>
              </a>
            </div>
          </section>

          {dashboard.units.length === 0 && (
            <div className="card p-6 text-center text-gray-500 dark:text-gray-400">
              Nenhuma escala encontrada para a data selecionada.
            </div>
          )}

          {dashboard.units.map(unit => (
            <section key={unit.unit} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Building2 size={18} className="text-brand-700 dark:text-brand-400" />
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">{unit.unit}</h2>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
                  <span className="font-semibold text-green-600 dark:text-green-400">{unit.total.confirmed_entrada + unit.total.confirmed_saida} confirmadas</span> <span className="text-gray-300 dark:text-gray-600">|</span> {unit.total.entrada} entradas <span className="text-gray-300 dark:text-gray-600">|</span> {unit.total.saida} saídas
                </p>
              </div>

              <div className="ex-stagger grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-3">
                {unit.turns.map(turn => (
                  <TurnCard key={turn.key} turn={turn} />
                ))}
              </div>

              {unit.client_cards.length > 0 && (
                <div>
                  <h3 className="section-title mb-2">
                    Clientes avulsos
                  </h3>
                  <div className="ex-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {unit.client_cards.map(card => (
                      <ClientCardView key={card.client} card={card} />
                    ))}
                  </div>
                </div>
              )}
            </section>
          ))}

          {dashboard.client_index.length > 0 && (
            <section className="space-y-3">
              <h2 className="section-title">Índice por cliente</h2>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th className="!text-right">Linhas</th>
                      <th className="!text-right">Entradas</th>
                      <th className="!text-right">Saídas</th>
                      <th className="!text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.client_index.map(row => (
                      <tr key={row.client}>
                        <td className="font-medium text-gray-900 dark:text-gray-100">{row.client}</td>
                        <td className="text-right tabular-nums">{row.unique_lines}</td>
                        <td className="text-right tabular-nums">{row.entrada}</td>
                        <td className="text-right tabular-nums">{row.saida}</td>
                        <td className="text-right font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4">
          <p className="text-red-600 dark:text-red-400 text-sm">Não foi possível carregar os dados.</p>
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
    <div className={`card card-hover p-4 border-l-4 ${isAprendiz ? 'border-l-amber-500' : 'border-l-brand-600'}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="section-title">{isAprendiz ? 'Jovem aprendiz' : 'Turno'}</p>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{turn.label}</h3>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{turn.total}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">registros</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatusMetric label="Confirmadas" value={confirmed} detail={`E ${turn.confirmed_entrada} | S ${turn.confirmed_saida}`} tone="green" />
        <StatusMetric label="Pendentes" value={turn.total - confirmed} detail={`E ${turn.pending_entrada} | S ${turn.pending_saida}`} tone="gray" />
      </div>

      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
        <div className="h-full bg-brand-600 dark:bg-brand-500 rounded-full transition-[width] duration-base ease-standard" style={{ width: `${pct}%` }} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Metric label="Entradas" value={turn.entrada} />
        <Metric label="Saídas" value={turn.saida} />
      </div>
    </div>
  )
}

function ClientCardView({ card }: { card: ClientCard }) {
  const confirmed = card.confirmed_entrada + card.confirmed_saida
  const pending = card.pending_entrada + card.pending_saida
  return (
    <div className="card card-hover p-4 border-l-4 border-l-blue-500">
      <p className="section-title">Cliente avulso</p>
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">{card.client}</h3>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatusMetric label="Confirmadas" value={confirmed} detail={`E ${card.confirmed_entrada} | S ${card.confirmed_saida}`} tone="green" />
        <StatusMetric label="Pendentes" value={pending} detail={`E ${card.pending_entrada} | S ${card.pending_saida}`} tone="gray" />
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Metric label="Entradas" value={card.entrada} />
        <Metric label="Saídas" value={card.saida} />
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md p-2">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">{value}</p>
    </div>
  )
}

function StatusMetric({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: 'green' | 'gray' }) {
  const classes = tone === 'green'
    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
    : 'bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-200'
  return (
    <div className={`${classes} rounded-md p-2 min-h-[76px]`}>
      <p className="text-xs font-semibold">{label}</p>
      <p className="text-2xl font-black leading-tight tabular-nums">{value}</p>
      <p className="text-xs text-gray-600 dark:text-gray-300">{detail}</p>
    </div>
  )
}
