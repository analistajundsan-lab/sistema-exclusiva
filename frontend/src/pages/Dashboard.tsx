import { useEffect, useState } from 'react'
import { Layout } from '../components/Layout'
import api from '../api/client'
import { DEFAULT_OPERATION_DATE } from '../config/demo'

interface Stats {
  incidents: number
  swaps: number
  incidents_abertos: number
  incidents_em_andamento: number
  incidents_fechados: number
  schedule_total: number
  schedule_pending: number
  schedule_confirmed: number
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    incidents: 0,
    swaps: 0,
    incidents_abertos: 0,
    incidents_em_andamento: 0,
    incidents_fechados: 0,
    schedule_total: 0,
    schedule_pending: 0,
    schedule_confirmed: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/incidents/count'),
      api.get('/swaps/count'),
      api.get('/incidents/count?status=aberto'),
      api.get('/incidents/count?status=em_andamento'),
      api.get('/incidents/count?status=fechado'),
      api.get('/schedule/lines/count', { params: { schedule_date: DEFAULT_OPERATION_DATE } }),
      api.get('/schedule/lines/count', { params: { schedule_date: DEFAULT_OPERATION_DATE, status: 'pendente' } }),
      api.get('/schedule/lines/count', { params: { schedule_date: DEFAULT_OPERATION_DATE, status: 'confirmada' } }),
    ]).then(([inc, swp, ab, em, fe, sch, pend, conf]) => {
      setStats({
        incidents: inc.data.total,
        swaps: swp.data.total,
        incidents_abertos: ab.data.total,
        incidents_em_andamento: em.data.total,
        incidents_fechados: fe.data.total,
        schedule_total: sch.data.total,
        schedule_pending: pend.data.total,
        schedule_confirmed: conf.data.total,
      })
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const cards = [
    { label: 'Linhas da escala', value: stats.schedule_total, color: 'border-blue-700', text: 'text-blue-800', link: '/schedule' },
    { label: 'Linhas pendentes', value: stats.schedule_pending, color: 'border-yellow-500', text: 'text-yellow-700', link: '/on-call' },
    { label: 'Linhas confirmadas', value: stats.schedule_confirmed, color: 'border-green-600', text: 'text-green-700', link: '/on-call' },
    { label: 'Total ocorrencias', value: stats.incidents, color: 'border-blue-600', text: 'text-blue-700', link: '/incidents' },
    { label: 'Total trocas', value: stats.swaps, color: 'border-green-600', text: 'text-green-700', link: '/swaps' },
    { label: 'Ocorrencias abertas', value: stats.incidents_abertos, color: 'border-red-500', text: 'text-red-600', link: '/incidents?status=aberto' },
    { label: 'Em andamento', value: stats.incidents_em_andamento, color: 'border-yellow-500', text: 'text-yellow-600', link: '/incidents?status=em_andamento' },
    { label: 'Ocorrencias fechadas', value: stats.incidents_fechados, color: 'border-gray-400', text: 'text-gray-600', link: '/incidents?status=fechado' },
  ]

  return (
    <Layout>
      <h1 className="text-2xl font-bold mb-1 text-gray-800">Dashboard</h1>
      <p className="text-sm text-gray-500 mb-6">
        Visao operacional da escala de {new Date(`${DEFAULT_OPERATION_DATE}T12:00:00`).toLocaleDateString('pt-BR')}.
      </p>
      {loading ? (
        <p className="text-gray-500">Carregando estatisticas...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl">
          {cards.map(c => (
            <a key={c.label} href={c.link}
              className={`bg-white rounded-lg shadow p-5 border-l-4 ${c.color} hover:shadow-md transition-shadow block`}>
              <p className="text-sm text-gray-500">{c.label}</p>
              <p className={`text-3xl font-bold mt-1 ${c.text}`}>{c.value}</p>
              <p className="text-xs text-blue-500 hover:underline mt-2">Ver</p>
            </a>
          ))}
        </div>
      )}
    </Layout>
  )
}
