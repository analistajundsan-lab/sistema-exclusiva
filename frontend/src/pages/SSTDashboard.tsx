import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  ClipboardList,
  Heart,
  Shield,
  TrendingUp,
  UserCheck,
  UserX,
  XCircle,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import { getSSTDashboard, SSTDashboard } from '../hooks/useSST'

const KpiCard = ({
  label,
  value,
  icon: Icon,
  color = 'brand',
}: {
  label: string
  value: number
  icon: React.ElementType
  color?: string
}) => {
  const colors: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400',
    red: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
    yellow: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
    green: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <span className={`rounded-lg p-2 ${colors[color]}`}>
          <Icon size={16} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  )
}

export function SSTDashboard() {
  const [data, setData] = useState<SSTDashboard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSSTDashboard()
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            <Shield size={24} className="text-brand-700 dark:text-brand-400" />
            Dashboard SST
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Segurança do Trabalho — visão geral da unidade
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">Carregando...</div>
      ) : !data ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          Erro ao carregar dados
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPIs principais */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard label="Sinistros no Mês" value={data.sinistros_mes} icon={AlertTriangle} color="yellow" />
            <KpiCard label="Sinistros no Ano" value={data.sinistros_ano} icon={TrendingUp} color="brand" />
            <KpiCard label="Em Investigação" value={data.sinistros_investigacao} icon={ClipboardList} color="yellow" />
            <KpiCard label="Encerrados" value={data.sinistros_encerrados} icon={CheckCircle2} color="green" />
            <KpiCard label="Ocorrências SST" value={data.ocorrencias_sst} icon={AlertTriangle} color="red" />
          </div>

          {/* Condutores e veículos */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Veículos na Unidade" value={data.total_veiculos} icon={Car} color="brand" />
            <KpiCard label="Bloqueados" value={data.condutores_bloqueados} icon={UserX} color="red" />
            <KpiCard label="Liberados" value={data.condutores_liberados} icon={UserCheck} color="green" />
            <KpiCard label="Checklists Hoje" value={data.checklists_hoje} icon={ClipboardList} color="brand" />
          </div>

          {/* Tipos de sinistro */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiCard label="Colisões" value={data.colisoes} icon={Car} color="red" />
            <KpiCard label="Abalroamentos" value={data.abalroamentos} icon={AlertTriangle} color="yellow" />
            <KpiCard label="Checklists Pendentes" value={data.checklists_pendentes} icon={XCircle} color="gray" />
          </div>

          {/* Rankings */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <h3 className="mb-3 font-semibold text-gray-800 dark:text-gray-200">
                Condutores com Mais Sinistros
              </h3>
              {data.top_condutores.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum registro</p>
              ) : (
                <ol className="space-y-2">
                  {data.top_condutores.map((c, i) => (
                    <li key={i} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400">{i + 1}.</span>
                        <span className="text-gray-700 dark:text-gray-300">{c.nome}</span>
                      </span>
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        {c.total}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <h3 className="mb-3 font-semibold text-gray-800 dark:text-gray-200">
                Veículos com Mais Sinistros
              </h3>
              {data.top_veiculos.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum registro</p>
              ) : (
                <ol className="space-y-2">
                  {data.top_veiculos.map((v, i) => (
                    <li key={i} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400">{i + 1}.</span>
                        <span className="text-gray-700 dark:text-gray-300">Prefixo {v.prefixo}</span>
                      </span>
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                        {v.total}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          {/* Atalhos de navegação */}
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
