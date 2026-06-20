import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  Gauge,
  Heart,
  Shield,
  Smartphone,
  UserCheck,
  UserX,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import { KpiCard } from '../components/dashboard/KpiCard'
import { ChartPanel } from '../components/dashboard/ChartPanel'
import {
  getSSTAlertas,
  getSSTDashboardV2,
  getSSTScorePreditivo,
  SSTAlertas,
  SSTDashboardV2,
  SSTScorePreditivo,
} from '../hooks/useSST'
import { useAuthStore } from '../store/auth'

// Cor do badge por nível de risco (mesma escala do cockpit SST).
const nivelBadge = (nivel: string) => {
  const map: Record<string, string> = {
    critico: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    alto: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    medio: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    baixo: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  }
  return map[nivel] || map.baixo
}

const scoreBar = (score: number) =>
  score >= 70 ? 'bg-red-500' : score >= 40 ? 'bg-orange-400' : score >= 20 ? 'bg-yellow-400' : 'bg-green-400'

export function SSTMobile() {
  const displayName = useAuthStore(s => s.displayName)
  const userName = useAuthStore(s => s.userName)

  const [data, setData] = useState<SSTDashboardV2 | null>(null)
  const [alertas, setAlertas] = useState<SSTAlertas | null>(null)
  const [score, setScore] = useState<SSTScorePreditivo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Sem unit param: o backend já escopa por perfil do técnico em campo.
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(false)
    getSSTDashboardV2()
      .then(d => active && setData(d))
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false))
    getSSTAlertas().then(d => active && setAlertas(d)).catch(() => {})
    getSSTScorePreditivo().then(d => active && setScore(d)).catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const s = data?.summary
  const riskColor = (s?.risk_score ?? 0) >= 60 ? 'red' : (s?.risk_score ?? 0) >= 30 ? 'yellow' : 'green'

  // Linhas de reincidência: condutores + veículos + bloqueios recorrentes.
  const reincidencia = alertas
    ? [
        ...alertas.condutores.map(c => ({ tipo: 'Condutor', nome: c.condutor, total: c.total, nivel: c.nivel })),
        ...alertas.veiculos.map(v => ({ tipo: 'Veículo', nome: v.prefixo, total: v.total, nivel: v.nivel })),
        ...alertas.bloqueios_recorrentes.map(b => ({ tipo: 'Bloqueio', nome: b.condutor, total: b.total, nivel: b.nivel })),
      ]
    : []

  const topRisco = score?.condutores.slice(0, 5) ?? []

  const atalhos = [
    { to: '/sst/sinistros', label: 'Sinistros', icon: AlertTriangle },
    { to: '/sst/ocorrencias', label: 'Ocorrências SST', icon: ClipboardList },
    { to: '/sst/liberacao', label: 'Liberação', icon: UserCheck },
    { to: '/sst/saude', label: 'Saúde', icon: Heart },
  ]

  return (
    <Layout>
      <div className="mx-auto max-w-md space-y-5">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-gray-100">
              <Smartphone size={22} className="text-brand-700 dark:text-brand-400" />
              SST — Campo
            </h1>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {displayName || userName || 'Técnico de Segurança'}
            </p>
          </div>
          <Shield size={28} className="text-brand-600 dark:text-brand-400" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">Carregando painel...</div>
        ) : error || !data || !s ? (
          <div className="flex items-center justify-center py-20 text-gray-400">Erro ao carregar dados</div>
        ) : (
          <>
            {/* KPIs grandes — grid de 2 colunas */}
            <div className="grid grid-cols-2 gap-3">
              <KpiCard
                label="Índice de atenção"
                value={s.risk_score}
                icon={Gauge}
                color={riskColor}
                hint="Heurístico (0-100): sinistros do período, bloqueios e não-conformidade de check-list."
              />
              <KpiCard
                label="Sinistros"
                value={s.sinistros_periodo}
                icon={AlertTriangle}
                color="yellow"
                deltaPct={s.sinistros_delta_pct}
                upIsBad
                hint="Comparado ao período anterior de mesma duração."
              />
              <KpiCard
                label="Conformidade check-list"
                value={s.checklist_compliance_pct}
                suffix="%"
                icon={ClipboardList}
                color={s.checklist_compliance_pct >= 80 ? 'green' : 'yellow'}
                hint="Veículos com check-list hoje ÷ frota ativa."
              />
              <KpiCard label="Bloqueados" value={s.condutores_bloqueados} icon={UserX} color="red" />
              <KpiCard
                label="Ações vencidas"
                value={s.acoes_vencidas}
                icon={AlertTriangle}
                color={s.acoes_vencidas > 0 ? 'red' : 'green'}
              />
              <KpiCard label="Ocorrências SST" value={s.ocorrencias_sst} icon={AlertTriangle} color="red" />
            </div>

            {/* Alertas de reincidência */}
            <ChartPanel
              title="Alertas de reincidência"
              subtitle={alertas ? `Últimos ${alertas.window_days} dias — 2+ ocorrências` : undefined}
              empty={reincidencia.length === 0}
            >
              <ul className="space-y-2.5">
                {reincidencia.map((l, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 truncate">
                      <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                        {l.tipo}
                      </span>
                      <span className="truncate text-gray-700 dark:text-gray-300">{l.nome}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-gray-500">{l.total}×</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${nivelBadge(l.nivel)}`}>
                        {l.nivel}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </ChartPanel>

            {/* Maior risco (preditivo) — top 5 condutores */}
            <ChartPanel
              title="Maior risco (preditivo)"
              subtitle={score ? `Score 0-100 — janela de ${score.window_days} dias` : undefined}
              empty={topRisco.length === 0}
            >
              <ul className="space-y-3">
                {topRisco.map((c, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-28 truncate text-gray-700 dark:text-gray-300">{c.condutor}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                      <div className={`h-full ${scoreBar(c.score)}`} style={{ width: `${c.score}%` }} />
                    </div>
                    <span
                      className={`w-10 shrink-0 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold ${nivelBadge(c.nivel)}`}
                    >
                      {c.score}
                    </span>
                  </li>
                ))}
              </ul>
            </ChartPanel>

            {/* Atalhos grandes (alvos de toque) */}
            <div className="grid grid-cols-2 gap-3">
              {atalhos.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-center text-sm font-medium text-gray-700 shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-brand-600 dark:hover:bg-brand-900/20"
                >
                  <Icon size={24} className="text-brand-600 dark:text-brand-400" />
                  {label}
                </Link>
              ))}
            </div>

            {/* Voltar para o cockpit completo */}
            <Link
              to="/sst"
              className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white p-4 text-center text-sm font-semibold text-gray-700 shadow-card transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <ArrowLeft size={18} />
              Voltar ao Cockpit SST
            </Link>
          </>
        )}
      </div>
    </Layout>
  )
}
