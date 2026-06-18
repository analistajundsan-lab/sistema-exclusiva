import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ClipboardList,
  Gauge,
  Heart,
  Shield,
  ShieldAlert,
  UserCheck,
  UserX,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Layout } from '../components/Layout'
import { KpiCard } from '../components/dashboard/KpiCard'
import { ChartPanel } from '../components/dashboard/ChartPanel'
import { getSSTDashboardV2, SSTDashboardV2 } from '../hooks/useSST'
import { useAuthStore } from '../store/auth'

const ALL_UNITS = ['Caieiras', 'Jundiai', 'Santana de Parnaiba']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const isoDaysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
const fmtMes = (mes: string) => {
  const [, m] = mes.split('-')
  return MESES[Number(m) - 1] || mes
}
const fmtDia = (dia: string) => dia.slice(8, 10) + '/' + dia.slice(5, 7)

const RankingList = ({
  title,
  items,
  labelKey,
  color,
}: {
  title: string
  items: Record<string, any>[]
  labelKey: string
  color: string
}) => (
  <ChartPanel title={title} empty={items.length === 0}>
    <ol className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 truncate">
            <span className="w-4 text-xs font-bold text-gray-400">{i + 1}.</span>
            <span className="truncate text-gray-700 dark:text-gray-300">{it[labelKey]}</span>
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{it.total}</span>
        </li>
      ))}
    </ol>
  </ChartPanel>
)

export function SSTDashboard() {
  const role = useAuthStore(s => s.role)
  const hasFullAccess = useAuthStore(s => s.hasFullAccess)
  const userUnit = useAuthStore(s => s.userUnit)
  const userUnits = useAuthStore(s => s.userUnits)

  const canChooseUnit = hasFullAccess || role === 'admin'
  const availableUnits = useMemo(() => {
    if (canChooseUnit) return ALL_UNITS
    if (userUnits && userUnits.length > 0) return userUnits
    if (userUnit) return [userUnit]
    return ALL_UNITS
  }, [canChooseUnit, userUnit, userUnits])

  const [unit, setUnit] = useState<string>(canChooseUnit ? '' : availableUnits[0] || '')
  const [dateStart, setDateStart] = useState(isoDaysAgo(29))
  const [dateEnd, setDateEnd] = useState(isoDaysAgo(0))
  const [data, setData] = useState<SSTDashboardV2 | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(false)
    getSSTDashboardV2({ unit: unit || undefined, date_start: dateStart, date_end: dateEnd })
      .then(d => active && setData(d))
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [unit, dateStart, dateEnd])

  const s = data?.summary
  const riskColor = (s?.risk_score ?? 0) >= 60 ? 'red' : (s?.risk_score ?? 0) >= 30 ? 'yellow' : 'green'

  return (
    <Layout>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            <Shield size={24} className="text-brand-700 dark:text-brand-400" />
            Cockpit SST
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Segurança do Trabalho — risco, tendência e ações
          </p>
        </div>
        {/* Filtros */}
        <div className="flex flex-wrap items-end gap-2">
          {canChooseUnit ? (
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Unidade
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="mt-1 block rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-normal text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">Todas</option>
                {ALL_UNITS.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </label>
          ) : (
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Unidade
              <div className="mt-1 rounded-lg border border-gray-200 bg-gray-100 px-2.5 py-1.5 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:bg-gray-700/60 dark:text-gray-200">
                {unit}
              </div>
            </div>
          )}
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            De
            <input
              type="date"
              value={dateStart}
              max={dateEnd}
              onChange={e => setDateStart(e.target.value)}
              className="mt-1 block rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-normal text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Até
            <input
              type="date"
              value={dateEnd}
              min={dateStart}
              onChange={e => setDateEnd(e.target.value)}
              className="mt-1 block rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-normal text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">Carregando cockpit...</div>
      ) : error || !data || !s ? (
        <div className="flex items-center justify-center py-20 text-gray-400">Erro ao carregar dados</div>
      ) : (
        <div className="space-y-5">
          {/* Faixa 1 — KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard
              label="Índice de atenção"
              value={s.risk_score}
              icon={Gauge}
              color={riskColor}
              hint="Heurístico (0-100): sinistros do período, bloqueios e não-conformidade de check-list. Não é fórmula oficial de risco."
            />
            <KpiCard
              label="Sinistros (período)"
              value={s.sinistros_periodo}
              icon={AlertTriangle}
              color="yellow"
              deltaPct={s.sinistros_delta_pct}
              upIsBad
              hint="Comparado ao período anterior de mesma duração."
            />
            <KpiCard label="Conformidade check-list" value={s.checklist_compliance_pct} suffix="%" icon={ClipboardList} color={s.checklist_compliance_pct >= 80 ? 'green' : 'yellow'} hint="Veículos com check-list hoje ÷ frota ativa." />
            <KpiCard label="Condutores bloqueados" value={s.condutores_bloqueados} icon={UserX} color="red" />
            <KpiCard label="Em investigação" value={s.sinistros_investigacao} icon={ShieldAlert} color="yellow" />
            <KpiCard label="Ocorrências SST" value={s.ocorrencias_sst} icon={AlertTriangle} color="red" />
          </div>

          {/* Faixa 2 — Tendência */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartPanel title="Sinistros por mês" subtitle="Últimos 12 meses">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.trends.sinistros_por_mes} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb33" />
                  <XAxis dataKey="mes" tickFormatter={fmtMes} fontSize={11} stroke="#9ca3af" />
                  <YAxis allowDecimals={false} fontSize={11} stroke="#9ca3af" />
                  <Tooltip labelFormatter={(v) => fmtMes(String(v))} />
                  <Line type="monotone" dataKey="total" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} name="Sinistros" />
                </LineChart>
              </ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Check-lists por dia" subtitle="Últimos 14 dias">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.trends.checklists_por_dia} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb33" />
                  <XAxis dataKey="dia" tickFormatter={fmtDia} fontSize={11} stroke="#9ca3af" />
                  <YAxis allowDecimals={false} fontSize={11} stroke="#9ca3af" />
                  <Tooltip labelFormatter={(v) => fmtDia(String(v))} />
                  <Bar dataKey="total" fill="#2563eb" radius={[4, 4, 0, 0]} name="Check-lists" />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>

          {/* Faixa 3 — Causas e concentração */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartPanel title="Sinistros por tipo" empty={data.breakdowns.por_tipo.length === 0}>
              <ResponsiveContainer width="100%" height={Math.max(160, data.breakdowns.por_tipo.length * 38)}>
                <BarChart layout="vertical" data={data.breakdowns.por_tipo} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <XAxis type="number" allowDecimals={false} fontSize={11} stroke="#9ca3af" />
                  <YAxis type="category" dataKey="tipo" width={120} fontSize={11} stroke="#9ca3af" />
                  <Tooltip />
                  <Bar dataKey="total" fill="#d97706" radius={[0, 4, 4, 0]} name="Sinistros" />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Sinistros por turno" empty={data.breakdowns.por_turno.length === 0}>
              <ResponsiveContainer width="100%" height={Math.max(160, data.breakdowns.por_turno.length * 44)}>
                <BarChart layout="vertical" data={data.breakdowns.por_turno} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <XAxis type="number" allowDecimals={false} fontSize={11} stroke="#9ca3af" />
                  <YAxis type="category" dataKey="turno" width={90} fontSize={11} stroke="#9ca3af" />
                  <Tooltip />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]} name="Sinistros">
                    {data.breakdowns.por_turno.map((_, i) => (
                      <Cell key={i} fill={['#1e3a8a', '#0891b2', '#d97706', '#7c3aed', '#6b7280'][i % 5]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>

          {/* Faixa 4 — Rankings */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <RankingList title="Condutores com mais sinistros" items={data.rankings.condutores} labelKey="nome" color="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" />
            <RankingList title="Veículos com mais sinistros" items={data.rankings.veiculos} labelKey="prefixo" color="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" />
            <RankingList title="Cidades com mais sinistros" items={data.rankings.cidades} labelKey="cidade" color="bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400" />
          </div>

          {/* Faixa 5 — Liberação */}
          {data.breakdowns.bloqueio_por_motivo.length > 0 && (
            <ChartPanel title="Bloqueios de condutor por motivo" subtitle="Itens reprovados na liberação">
              <ResponsiveContainer width="100%" height={Math.max(160, data.breakdowns.bloqueio_por_motivo.length * 38)}>
                <BarChart layout="vertical" data={data.breakdowns.bloqueio_por_motivo} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <XAxis type="number" allowDecimals={false} fontSize={11} stroke="#9ca3af" />
                  <YAxis type="category" dataKey="motivo" width={120} fontSize={11} stroke="#9ca3af" />
                  <Tooltip />
                  <Bar dataKey="total" fill="#dc2626" radius={[0, 4, 4, 0]} name="Bloqueios" />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          )}

          {/* Navegação */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { to: '/sst/sinistros', label: 'Sinistros', icon: AlertTriangle },
              { to: '/sst/ocorrencias', label: 'Ocorrências SST', icon: ClipboardList },
              { to: '/sst/liberacao', label: 'Liberação de Condutor', icon: UserCheck },
              { to: '/sst/saude', label: 'Saúde e Bem-Estar', icon: Heart },
            ].map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-center text-sm font-medium text-gray-700 transition-colors hover:border-brand-300 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-brand-600 dark:hover:bg-brand-900/20"
              >
                <Icon size={20} className="text-brand-600 dark:text-brand-400" />
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </Layout>
  )
}
