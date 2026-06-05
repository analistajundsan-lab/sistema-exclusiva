import { useEffect, useState } from 'react'
import { Layout } from '../components/Layout'
import { AlertTriangle, CheckCircle2, ClipboardList, Download, ExternalLink, Link as LinkIcon, Mail, ShieldCheck, UserCheck, X } from 'lucide-react'
import {
  approveTicketForSST,
  getSafetyDashboard,
  listSafetySubmissions,
  listSafetyTickets,
  listSafetyVehicles,
  SafetyDashboard,
  SafetySubmission,
  SafetyTicket,
  SafetyVehicle,
  updateSafetyTicket,
} from '../hooks/useSafety'
import { useAuthStore } from '../store/auth'
import api from '../api/client'

const statusLabel: Record<string, string> = {
  ok: 'OK',
  attention: 'Atencao',
  blocking: 'Bloqueio',
  open: 'Aberto',
  validated: 'Validado',
  in_progress: 'Em andamento',
  resolved: 'Resolvido',
  cancelled: 'Cancelado',
}

export function Safety() {
  const role = useAuthStore((s) => s.role)
  const hasFullAccess = useAuthStore((s) => s.hasFullAccess)
  const canApprove = hasFullAccess || role === 'admin' || role === 'gerente'

  const [dashboard, setDashboard] = useState<SafetyDashboard | null>(null)
  const [submissions, setSubmissions] = useState<SafetySubmission[]>([])
  const [tickets, setTickets] = useState<SafetyTicket[]>([])
  const [vehicles, setVehicles] = useState<SafetyVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [approvalModal, setApprovalModal] = useState<SafetyTicket | null>(null)
  const [approvalNotes, setApprovalNotes] = useState('')
  const [approving, setApproving] = useState(false)

  const load = async () => {
    const [dash, subs, ticketRows, vehicleRows] = await Promise.all([
      getSafetyDashboard(),
      listSafetySubmissions(),
      listSafetyTickets(),
      listSafetyVehicles(),
    ])
    setDashboard(dash)
    setSubmissions(subs)
    setTickets(ticketRows)
    setVehicles(vehicleRows)
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  const publicUrl = (token: string) => `${window.location.origin}/v/${token}`

  const downloadExport = async (format: 'csv' | 'xlsx') => {
    const res = await api.get('/safety/submissions/export', { params: { format }, responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `checklist-seguranca.${format}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const markTicket = async (ticket: SafetyTicket, status: SafetyTicket['status']) => {
    await updateSafetyTicket(ticket.id, status, ticket.manager_notes)
    await load()
  }

  const handleApprove = async () => {
    if (!approvalModal) return
    setApproving(true)
    try {
      await approveTicketForSST(approvalModal.id, approvalNotes || undefined)
      setApprovalModal(null)
      setApprovalNotes('')
      await load()
    } finally {
      setApproving(false)
    }
  }

  return (
    <Layout>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            <ShieldCheck size={24} className="text-brand-700 dark:text-brand-400" />
            Check-list ST
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Seguranca do Trabalho, QR por prefixo e bloqueios operacionais.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => downloadExport('csv')} className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200">
            <Download size={16} /> CSV
          </button>
          <button onClick={() => downloadExport('xlsx')} className="flex items-center gap-2 rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white">
            <Download size={16} /> XLSX
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : (
        <div className="space-y-6">
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric title="Dias sem bloqueio" value={dashboard?.days_without_blocking ?? 0} icon={<CheckCircle2 size={18} />} />
            <Metric title="Tickets ativos" value={dashboard?.active_blocking_tickets ?? 0} icon={<AlertTriangle size={18} />} danger />
            <Metric title="Tickets resolvidos" value={dashboard?.resolved_tickets ?? 0} icon={<CheckCircle2 size={18} />} />
            <Metric title="Enviados hoje" value={dashboard?.submissions_today ?? 0} icon={<ClipboardList size={18} />} />
            <Metric title="Sem check-list hoje" value={dashboard?.vehicles_without_checklist_today ?? 0} icon={<ClipboardList size={18} />} />
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel title="Bloqueios e manutencao">
              {tickets.length === 0 ? <Empty text="Nenhum ticket encontrado." /> : tickets.map(ticket => (
                <div key={ticket.id} className="border-b border-gray-100 py-3 last:border-0 dark:border-gray-700">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">Prefixo {ticket.prefix} — {ticket.unit}</p>
                        {ticket.email_sent && (
                          <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            <Mail size={10} /> E-mail enviado
                          </span>
                        )}
                        {ticket.sst_approved && (
                          <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            <UserCheck size={10} /> Aprovado SST
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{statusLabel[ticket.status]} · #{ticket.id}</p>
                    </div>
                    <select
                      value={ticket.status}
                      onChange={e => markTicket(ticket, e.target.value as SafetyTicket['status'])}
                      className="rounded-lg border px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                    >
                      <option value="open">Aberto</option>
                      <option value="validated">Validado</option>
                      <option value="in_progress">Em andamento</option>
                      <option value="resolved">Resolvido</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-red-700 dark:text-red-300">
                    {ticket.blocking_items.map(item => <li key={item}>⚠ {item}</li>)}
                  </ul>
                  {canApprove && !ticket.sst_approved && (
                    <button
                      onClick={() => { setApprovalModal(ticket); setApprovalNotes('') }}
                      className="mt-2 flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800"
                    >
                      <UserCheck size={13} /> Aprovar para SST
                    </button>
                  )}
                  {ticket.sst_approved && ticket.sst_approved_notes && (
                    <p className="mt-1 text-xs text-gray-500 italic">Obs: {ticket.sst_approved_notes}</p>
                  )}
                </div>
              ))}
            </Panel>

            <Panel title="Historico recente">
              {submissions.length === 0 ? <Empty text="Nenhum envio encontrado." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-gray-500">
                      <tr><th className="py-2">Prefixo</th><th>Motorista</th><th>Status</th><th>Data</th></tr>
                    </thead>
                    <tbody>
                      {submissions.slice(0, 12).map(row => (
                        <tr key={row.id} className="border-t dark:border-gray-700">
                          <td className="py-2 font-semibold">{row.prefix}</td>
                          <td>{row.driver_name}</td>
                          <td>{statusLabel[row.overall_status]}</td>
                          <td>{new Date(row.submitted_at).toLocaleString('pt-BR')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </section>

          <Panel title="Links publicos por prefixo">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {vehicles.map(vehicle => (
                <div key={vehicle.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 p-3 dark:border-gray-700">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">Prefixo {vehicle.prefix}</p>
                    <p className="text-xs text-gray-500">{vehicle.unit}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => navigator.clipboard.writeText(publicUrl(vehicle.public_token))} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" title="Copiar link">
                      <LinkIcon size={16} />
                    </button>
                    <a href={publicUrl(vehicle.public_token)} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" title="Abrir link">
                      <ExternalLink size={16} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* Modal de aprovação para SST */}
      {approvalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                Aprovar Ticket #{approvalModal.id} para SST
              </h2>
              <button onClick={() => setApprovalModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Veículo <strong>{approvalModal.prefix}</strong> — {approvalModal.unit}.
              Ao aprovar, o Técnico/Engenheiro de Segurança será notificado por e-mail.
            </p>
            <label className="block">
              <span className="text-xs font-medium text-gray-500">Observações (opcional)</span>
              <textarea
                value={approvalNotes}
                onChange={e => setApprovalNotes(e.target.value)}
                rows={3}
                placeholder="Observações para o SST..."
                className="input w-full mt-1 resize-none"
              />
            </label>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setApprovalModal(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400"
              >
                Cancelar
              </button>
              <button
                onClick={handleApprove}
                disabled={approving}
                className="flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
              >
                <UserCheck size={15} />
                {approving ? 'Aprovando...' : 'Confirmar Aprovação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

function Metric({ title, value, icon, danger = false }: { title: string; value: number; icon: React.ReactNode; danger?: boolean }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className={`mb-2 flex items-center gap-2 text-sm font-semibold ${danger ? 'text-red-600 dark:text-red-400' : 'text-brand-700 dark:text-brand-400'}`}>
        {icon}
        {title}
      </div>
      <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h2 className="mb-3 text-sm font-bold uppercase text-gray-500 dark:text-gray-400">{title}</h2>
      {children}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="py-4 text-sm text-gray-500">{text}</p>
}
