import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ClipboardList,
  DollarSign,
  Download,
  FileText,
  Gauge,
  Heart,
  HeartPulse,
  Shield,
  ShieldAlert,
  Smartphone,
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
import {
  downloadSSTExport,
  getSSTAlertas,
  getSSTComparativo,
  getSSTDashboardV2,
  getSSTScorePreditivo,
  SSTAlertas,
  SSTComparativo,
  SSTDashboardV2,
  SSTScorePreditivo,
} from '../hooks/useSST'
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

const riskBand = (indice: number) =>
  indice >= 15
    ? 'bg-red-500/85 text-white'
    : indice >= 10
      ? 'bg-orange-400/85 text-white'
      : indice >= 5
        ? 'bg-yellow-300/80 text-gray-900'
        : 'bg-green-400/70 text-gray-900'

const RiskMatrix = ({ cells }: { cells: SSTDashboardV2['risk_matrix'] }) => {
  const total = cells.reduce((a, c) => a + c.total, 0)
  const get = (p: number, g: number) => cells.find(c => c.probabilidade === p && c.gravidade === g)
  return (
    <ChartPanel title="Matriz de risco" subtitle="Probabilidade (linha) × Gravidade (coluna)" empty={total === 0}>
      <div className="overflow-x-auto">
        <div className="grid grid-cols-[28px_repeat(5,minmax(40px,1fr))] gap-1 text-center text-xs">
          <div />
          {[1, 2, 3, 4, 5].map(g => (
            <div key={g} className="pb-1 font-semibold text-gray-500 dark:text-gray-400">G{g}</div>
          ))}
          {[5, 4, 3, 2, 1].map(p => (
            <Fragment key={p}>
              <div className="flex items-center justify-end pr-0.5 font-semibold text-gray-500 dark:text-gray-400">P{p}</div>
              {[1, 2, 3, 4, 5].map(g => {
                const tot = get(p, g)?.total || 0
                return (
                  <div
                    key={g}
                    className={`rounded py-2.5 font-bold ${riskBand(p * g)} ${tot === 0 ? 'opacity-25' : ''}`}
                    title={`Prob ${p} × Grav ${g} = índice ${p * g}`}
                  >
                    {tot}
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </ChartPanel>
  )
}

const ActionStatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    pendente: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    em_andamento: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    concluida: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] || map.pendente}`}>{status.replace('_', ' ')}</span>
}

const ActionTable = ({ actions }: { actions: SSTDashboardV2['actions'] }) => (
  <ChartPanel title="Plano de ação" subtitle="Tratativas de sinistros (mais atrasadas primeiro)" empty={actions.length === 0}>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-gray-400">
            <th className="py-1 font-semibold">Sinistro</th>
            <th className="font-semibold">Unidade</th>
            <th className="font-semibold">Responsável</th>
            <th className="font-semibold">Prazo</th>
            <th className="font-semibold">Atraso</th>
            <th className="font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {actions.map(a => (
            <tr key={a.sinistro_id} className="border-t border-gray-100 dark:border-gray-800">
              <td className="py-1.5 text-gray-700 dark:text-gray-300">{a.numero || `#${a.sinistro_id}`} · {a.tipo}</td>
              <td className="text-gray-600 dark:text-gray-400">{a.unit}</td>
              <td className="text-gray-600 dark:text-gray-400">{a.responsavel || '—'}</td>
              <td className="text-gray-600 dark:text-gray-400">{a.prazo ? a.prazo.split('-').reverse().join('/') : '—'}</td>
              <td>
                {a.dias_atraso > 0 ? (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">{a.dias_atraso}d</span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td><ActionStatusBadge status={a.status_acao} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </ChartPanel>
)

const nivelBadge = (nivel: string) => {
  const map: Record<string, string> = {
    critico: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    alto: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    medio: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    baixo: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  }
  return map[nivel] || map.baixo
}

const UNIT_COLORS = ['#dc2626', '#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2']

const AlertasPanel = ({ data }: { data: SSTAlertas }) => {
  const linhas = [
    ...data.condutores.map(c => ({ tipo: 'Condutor', nome: c.condutor, total: c.total, nivel: c.nivel })),
    ...data.veiculos.map(v => ({ tipo: 'Veículo', nome: v.prefixo, total: v.total, nivel: v.nivel })),
    ...data.bloqueios_recorrentes.map(b => ({ tipo: 'Bloqueio', nome: b.condutor, total: b.total, nivel: b.nivel })),
  ]
  return (
    <ChartPanel
      title="Alertas de reincidência"
      subtitle={`Últimos ${data.window_days} dias — 2+ ocorrências`}
      empty={linhas.length === 0}
    >
      <ul className="space-y-2">
        {linhas.map((l, i) => (
          <li key={i} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 truncate">
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300">{l.tipo}</span>
              <span className="truncate text-gray-700 dark:text-gray-300">{l.nome}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{l.total}×</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${nivelBadge(l.nivel)}`}>{l.nivel}</span>
            </span>
          </li>
        ))}
      </ul>
    </ChartPanel>
  )
}

const ScorePanel = ({ data }: { data: SSTScorePreditivo }) => (
  <ChartPanel
    title="Score preditivo de risco"
    subtitle={`Heurístico (0-100) — janela de ${data.window_days} dias`}
    empty={data.condutores.length === 0 && data.veiculos.length === 0}
  >
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {[
        { titulo: 'Condutores', itens: data.condutores.slice(0, 6).map(c => ({ nome: c.condutor, score: c.score, nivel: c.nivel })) },
        { titulo: 'Veículos', itens: data.veiculos.slice(0, 6).map(v => ({ nome: v.prefixo, score: v.score, nivel: v.nivel })) },
      ].map(col => (
        <div key={col.titulo}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{col.titulo}</h4>
          <ul className="space-y-2">
            {col.itens.length === 0 && <li className="text-sm text-gray-400">Sem dados</li>}
            {col.itens.map((it, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="w-24 truncate text-gray-700 dark:text-gray-300">{it.nome}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                  <div
                    className={`h-full ${it.score >= 70 ? 'bg-red-500' : it.score >= 40 ? 'bg-orange-400' : it.score >= 20 ? 'bg-yellow-400' : 'bg-green-400'}`}
                    style={{ width: `${it.score}%` }}
                  />
                </div>
                <span className={`w-10 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold ${nivelBadge(it.nivel)}`}>{it.score}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  </ChartPanel>
)

const ComparativoPanel = ({ data }: { data: SSTComparativo }) => {
  const rows = data.meses.map(mes => {
    const row: Record<string, any> = { mes }
    data.unidades.forEach(u => {
      row[u.unidade] = u.por_mes.find(p => p.mes === mes)?.total ?? 0
    })
    return row
  })
  return (
    <ChartPanel title="Comparativo mensal por unidade" subtitle="Sinistros por unidade + ranking corporativo" empty={data.unidades.length === 0}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb33" />
              <XAxis dataKey="mes" tickFormatter={fmtMes} fontSize={11} stroke="#9ca3af" />
              <YAxis allowDecimals={false} fontSize={11} stroke="#9ca3af" />
              <Tooltip labelFormatter={(v) => fmtMes(String(v))} />
              {data.unidades.map((u, i) => (
                <Line key={u.unidade} type="monotone" dataKey={u.unidade} stroke={UNIT_COLORS[i % UNIT_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Ranking corporativo</h4>
          <ol className="space-y-2">
            {data.ranking.map((r, i) => (
              <li key={r.unidade} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 truncate">
                  <span className="w-4 text-xs font-bold text-gray-400">{i + 1}.</span>
                  <span className="truncate text-gray-700 dark:text-gray-300">{r.unidade}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">{r.total}</span>
                  <span className="text-xs text-gray-400" title="Sinistros por veículo ativo">{r.taxa_por_veiculo}/v</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </ChartPanel>
  )
}

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
  const [alertas, setAlertas] = useState<SSTAlertas | null>(null)
  const [score, setScore] = useState<SSTScorePreditivo | null>(null)
  const [comparativo, setComparativo] = useState<SSTComparativo | null>(null)
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null)

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

  useEffect(() => {
    let active = true
    getSSTAlertas(unit || undefined).then(d => active && setAlertas(d)).catch(() => {})
    getSSTScorePreditivo(unit || undefined).then(d => active && setScore(d)).catch(() => {})
    getSSTComparativo(6).then(d => active && setComparativo(d)).catch(() => {})
    return () => {
      active = false
    }
  }, [unit])

  const handleExport = async (format: 'xlsx' | 'pdf') => {
    setExporting(format)
    try {
      await downloadSSTExport(format, { unit: unit || undefined, date_start: dateStart, date_end: dateEnd })
    } catch {
      /* erro de download é silencioso; o usuário pode tentar de novo */
    } finally {
      setExporting(null)
    }
  }

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
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => handleExport('xlsx')}
              disabled={exporting !== null}
              title="Exportar Excel"
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <Download size={15} /> {exporting === 'xlsx' ? '...' : 'XLSX'}
            </button>
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              disabled={exporting !== null}
              title="Exportar PDF"
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <FileText size={15} /> {exporting === 'pdf' ? '...' : 'PDF'}
            </button>
            <Link
              to="/sst/mobile"
              title="Painel mobile (campo)"
              className="flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-2.5 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100 dark:border-brand-600 dark:bg-brand-900/20 dark:text-brand-300"
            >
              <Smartphone size={15} /> Mobile
            </Link>
          </div>
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

          {/* Faixa 1b — KPIs de impacto (Fase 2/3) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="Custo total" value={`R$ ${s.custo_total.toLocaleString('pt-BR')}`} icon={DollarSign} color="red" hint="Soma de custo_final dos sinistros no período." />
            <KpiCard label="Ações vencidas" value={s.acoes_vencidas} icon={AlertTriangle} color={s.acoes_vencidas > 0 ? 'red' : 'green'} />
            <KpiCard label="Ações abertas" value={s.acoes_abertas} icon={ClipboardList} color="yellow" />
            <KpiCard label="Com vítima" value={s.com_vitima} icon={HeartPulse} color="red" />
            <KpiCard label="Fadiga alta" value={s.fadiga_alta} icon={HeartPulse} color="yellow" hint="Avaliações de saúde com fadiga alta/crítica." />
            <KpiCard label="Jornada excessiva" value={s.jornada_excessiva} icon={AlertTriangle} color="yellow" />
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

          {/* Faixa 3b — Matriz de risco + Pareto de fatores */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RiskMatrix cells={data.risk_matrix} />
            <ChartPanel title="Pareto — fatores contribuintes" subtitle="Maiores causas de sinistro" empty={data.breakdowns.por_fator_contribuinte.length === 0}>
              <ResponsiveContainer width="100%" height={Math.max(160, data.breakdowns.por_fator_contribuinte.length * 36)}>
                <BarChart layout="vertical" data={data.breakdowns.por_fator_contribuinte} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <XAxis type="number" allowDecimals={false} fontSize={11} stroke="#9ca3af" />
                  <YAxis type="category" dataKey="fator" width={130} fontSize={11} stroke="#9ca3af" />
                  <Tooltip />
                  <Bar dataKey="total" fill="#7c3aed" radius={[0, 4, 4, 0]} name="Sinistros" />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>

          {/* Plano de ação */}
          <ActionTable actions={data.actions} />

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

          {/* Faixa 6 — Fase 3: alertas + score preditivo */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {alertas && <AlertasPanel data={alertas} />}
            {score && <ScorePanel data={score} />}
          </div>

          {/* Faixa 7 — Comparativo corporativo (quando há mais de uma unidade) */}
          {comparativo && comparativo.unidades.length > 1 && <ComparativoPanel data={comparativo} />}

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
