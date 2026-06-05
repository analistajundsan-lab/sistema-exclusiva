import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardList, ShieldCheck, UserCheck } from 'lucide-react'
import { Layout } from '../components/Layout'
import { getSSTView, SafetySubmission, SafetyTicket } from '../hooks/useSafety'

const STATUS_COLOR: Record<string, string> = {
  ok: 'bg-green-100 text-green-700',
  attention: 'bg-yellow-100 text-yellow-700',
  blocking: 'bg-red-100 text-red-700',
  open: 'bg-gray-100 text-gray-600',
  validated: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-orange-100 text-orange-700',
  resolved: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-400',
}

const STATUS_LABEL: Record<string, string> = {
  ok: 'OK',
  attention: 'Atenção',
  blocking: 'Bloqueio',
  open: 'Aberto',
  validated: 'Validado',
  in_progress: 'Em andamento',
  resolved: 'Resolvido',
  cancelled: 'Cancelado',
}

export function SSTChecklistView() {
  const [submissions, setSubmissions] = useState<SafetySubmission[]>([])
  const [tickets, setTickets] = useState<SafetyTicket[]>([])
  const [isTecnico, setIsTecnico] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'tickets' | 'historico'>('tickets')
  const [search, setSearch] = useState('')

  useEffect(() => {
    getSSTView()
      .then(data => {
        setSubmissions(data.submissions)
        setTickets(data.tickets)
        setIsTecnico(data.is_tecnico)
      })
      .finally(() => setLoading(false))
  }, [])

  const filteredTickets = tickets.filter(t =>
    !search ||
    t.prefix.toLowerCase().includes(search.toLowerCase()) ||
    t.unit.toLowerCase().includes(search.toLowerCase()) ||
    t.blocking_items.some(i => i.toLowerCase().includes(search.toLowerCase()))
  )

  const filteredSubmissions = submissions.filter(s =>
    !search ||
    s.prefix.toLowerCase().includes(search.toLowerCase()) ||
    s.driver_name.toLowerCase().includes(search.toLowerCase())
  )

  const blocking = submissions.filter(s => s.overall_status === 'blocking').length
  const attention = submissions.filter(s => s.overall_status === 'attention').length

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
          <ShieldCheck size={24} className="text-brand-700 dark:text-brand-400" />
          Check-list SST — Visão Consultiva
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          {isTecnico
            ? 'Visualização somente leitura — tickets aprovados pela gerência para avaliação primária'
            : 'Visão corporativa — todos os checklists e tickets'}
        </p>
      </div>

      {loading ? (
        <div className="py-20 text-center text-gray-400">Carregando...</div>
      ) : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <p className="text-sm text-gray-500">Total Submissões</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{submissions.length}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
              <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                <AlertTriangle size={14} /> Bloqueios
              </p>
              <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-400">{blocking}</p>
            </div>
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
              <p className="flex items-center gap-1 text-sm text-yellow-600 dark:text-yellow-400">
                <AlertTriangle size={14} /> Atenções
              </p>
              <p className="mt-1 text-2xl font-bold text-yellow-700 dark:text-yellow-400">{attention}</p>
            </div>
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
              <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <UserCheck size={14} /> Aprovados SST
              </p>
              <p className="mt-1 text-2xl font-bold text-green-700 dark:text-green-400">
                {tickets.filter(t => t.sst_approved).length}
              </p>
            </div>
          </div>

          {/* Tabs + busca */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-800">
              {(['tickets', 'historico'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                    tab === t
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                  }`}
                >
                  {t === 'tickets' ? (
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle size={14} />
                      {isTecnico ? 'Impeditivos Aprovados' : 'Tickets'} ({tickets.length})
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <ClipboardList size={14} />
                      Histórico ({submissions.length})
                    </span>
                  )}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar prefixo, motorista..."
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 sm:w-64"
            />
          </div>

          {/* Tickets */}
          {tab === 'tickets' && (
            filteredTickets.length === 0 ? (
              <div className="py-20 text-center text-gray-400">
                {isTecnico ? 'Nenhum ticket aprovado para avaliação SST' : 'Nenhum ticket encontrado'}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTickets.map(ticket => (
                  <div
                    key={ticket.id}
                    className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            Prefixo {ticket.prefix}
                          </span>
                          <span className="text-sm text-gray-500">— {ticket.unit}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[ticket.status] || 'bg-gray-100'}`}>
                            {STATUS_LABEL[ticket.status] || ticket.status}
                          </span>
                          {ticket.sst_approved && (
                            <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              <UserCheck size={10} /> Aprovado p/ SST
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500">
                          Ticket #{ticket.id} ·{' '}
                          {new Date(ticket.created_at).toLocaleString('pt-BR')}
                        </p>
                        {ticket.sst_approved_at && (
                          <p className="text-xs text-green-600 dark:text-green-400">
                            Aprovado em {new Date(ticket.sst_approved_at).toLocaleString('pt-BR')}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg bg-red-50 p-3 dark:bg-red-900/10">
                      <p className="mb-1 text-xs font-semibold uppercase text-red-600 dark:text-red-400">
                        Itens Impeditivos
                      </p>
                      <ul className="space-y-1">
                        {ticket.blocking_items.map(item => (
                          <li key={item} className="flex items-start gap-1.5 text-sm text-red-700 dark:text-red-300">
                            <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {ticket.sst_approved_notes && (
                      <div className="mt-2 rounded-lg bg-green-50 p-3 dark:bg-green-900/10">
                        <p className="text-xs text-green-700 dark:text-green-400">
                          <span className="font-semibold">Obs. gerência:</span> {ticket.sst_approved_notes}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {/* Histórico */}
          {tab === 'historico' && (
            filteredSubmissions.length === 0 ? (
              <div className="py-20 text-center text-gray-400">Nenhum registro encontrado</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      {['Prefixo', 'Unidade', 'Motorista', 'Matrícula', 'Status', 'Data/Hora'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {filteredSubmissions.map(s => (
                      <tr key={s.id} className="bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3 font-semibold text-gray-800 dark:text-gray-200">{s.prefix}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.unit}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{s.driver_name}</td>
                        <td className="px-4 py-3 text-gray-500">{s.driver_registration}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[s.overall_status] || 'bg-gray-100'}`}>
                            {STATUS_LABEL[s.overall_status] || s.overall_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {s.submitted_at ? new Date(s.submitted_at).toLocaleString('pt-BR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}
    </Layout>
  )
}
