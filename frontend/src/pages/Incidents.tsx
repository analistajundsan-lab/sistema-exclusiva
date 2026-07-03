import { useEffect, useState, useMemo, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { Layout } from '../components/Layout'
import { Incident, useIncidents } from '../hooks/useIncidents'
import { useVisibleInterval } from '../hooks/useVisibleInterval'
import { useAuthStore } from '../store/auth'
import api from '../api/client'
import { parseApiDate } from '../utils/datetime'
import { AlertTriangle, Plus, Clock, Hash, Bus, X, ChevronLeft, ChevronRight, ChevronDown, MessageCircle, Pencil, Trash2, Check, MapPin, Building2, User as UserIcon, Users as UsersIcon } from 'lucide-react'

const ALL_UNITS = ['Caieiras', 'Jundiai', 'Santana de Parnaiba']

const emptyForm = {
  prefix_code: '',
  incident_type: '',
  line: '',
  direction: '',
  description: '',
  victim_status: '',
  replacement_prefix: '',
  horario: '',
  cep: '',
  local: '',
  passageiros: '',
  motorista: '',
}

// Hora atual "HH:MM" no fuso de Brasília (default do campo Horário).
const nowHHMM = () =>
  new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

// Chave do rascunho do registro de ocorrência: sobrevive a um refresh acidental
// ou ao voltar de background no PWA, para o operador não perder o que digitou.
const DRAFT_KEY = 'incident_draft_v1'

// Item de detalhe (linha expandida da tabela).
function Detail({ label, value, mono, icon }: {
  label: string
  value?: string | null
  mono?: boolean
  icon?: React.ReactNode
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {icon}{label}
      </p>
      <p className={`text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words ${mono ? 'font-mono' : ''}`}>
        {value || <span className="text-gray-300 dark:text-gray-600">—</span>}
      </p>
    </div>
  )
}

export function Incidents() {
  const { incidents, loading, error, total, page, totalPages, setPage, createIncident, updateIncident, deleteIncident, fetchIncidents, filters, applyFilters } = useIncidents()
  const role = useAuthStore(s => s.role)
  const userId = useAuthStore(s => s.userId)
  const userUnit = useAuthStore(s => s.userUnit)
  const userUnits = useAuthStore(s => s.userUnits)
  const hasFullAccess = useAuthStore(s => s.hasFullAccess)

  // Garagens que este usuario pode filtrar: admin ve todas; quem tem 2+ unidades
  // no perfil filtra entre as suas; quem tem 1 unidade nao precisa do filtro.
  const isAdmin = hasFullAccess || role === 'admin'
  const garageOptions = useMemo(() => {
    if (isAdmin) return ALL_UNITS
    if (userUnits && userUnits.length > 0) return userUnits
    return userUnit ? [userUnit] : []
  }, [isAdmin, userUnit, userUnits])
  const showGarageFilter = garageOptions.length > 1
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Incident | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [whatsAppMenu, setWhatsAppMenu] = useState<number | 'new' | null>(null)
  // Linha de detalhes expandida na tabela.
  const [expandedId, setExpandedId] = useState<number | null>(null)
  // Ocorrência já salva no banco neste fluxo (habilita o envio por WhatsApp).
  const [savedIncident, setSavedIncident] = useState<Incident | null>(null)
  const [cepLoading, setCepLoading] = useState(false)

  // O form esta "sujo" (vale salvar/avisar)? Ignora o campo horario, que ja vem
  // preenchido automaticamente ao abrir — sozinho ele nao conta como rascunho.
  const draftDirty = () =>
    Object.entries(form).some(([k, v]) => k !== 'horario' && String(v).trim() !== '')

  // Restaura o rascunho ao abrir o modal de CRIACAO (nunca na edicao).
  useEffect(() => {
    if (!modal || editing) return
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) setForm(f => ({ ...f, ...JSON.parse(raw) }))
    } catch { /* rascunho corrompido: ignora */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, editing])

  // Autosave: enquanto o modal de criacao esta aberto e sujo, persiste o rascunho
  // a cada tecla. Assim um refresh acidental nao perde nada.
  useEffect(() => {
    if (!modal || editing || savedIncident) return
    if (draftDirty()) {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)) } catch { /* cota cheia: ignora */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, modal, editing, savedIncident])

  // Aviso nativo antes de recarregar/fechar a aba com rascunho nao salvo.
  useEffect(() => {
    if (!modal || editing || savedIncident || !draftDirty()) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, modal, editing, savedIncident])

  const handle = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  // Mantém só dígitos, limitado a `max` caracteres (prefixo substituto, passageiros).
  const handleDigits = (name: string, max: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [name]: e.target.value.replace(/\D/g, '').slice(0, max) }))

  // Consulta o CEP (proxy backend -> ViaCEP) e autopreenche o Local (editável).
  const lookupCep = async (rawCep: string) => {
    const digits = rawCep.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const res = await api.get(`/incidents/cep/${digits}`)
      const d = res.data
      const cidadeUf = d.cidade && d.uf ? `${d.cidade}-${d.uf}` : (d.cidade || '')
      const endereco = [d.logradouro, d.bairro, cidadeUf].filter(Boolean).join(', ')
      if (endereco) setForm(f => ({ ...f, local: endereco }))
    } catch {
      // Silencioso: se o CEP falhar, o usuário preenche o Local manualmente.
    } finally {
      setCepLoading(false)
    }
  }

  const incidentText = (incident: Partial<Incident>) => {
    const parts = [
      'OCORRENCIA OPERACIONAL',
      `Tipo: ${incident.incident_type}`,
      `Prefixo: ${incident.prefix_code}`,
    ]
    if (incident.line) parts.push(`Linha: ${incident.line}`)
    if (incident.direction) parts.push(`Sentido: ${incident.direction}`)
    if (incident.replacement_prefix) parts.push(`Substituto: ${incident.replacement_prefix}`)
    if (incident.horario) parts.push(`Horario: ${incident.horario}`)
    if (incident.local) parts.push(`Local: ${incident.local}`)
    if (incident.passageiros !== undefined && incident.passageiros !== null) parts.push(`Passageiros a bordo: ${incident.passageiros}`)
    if (incident.motorista) parts.push(`Motorista: ${incident.motorista}`)
    if (incident.victim_status === 'com_vitimas') parts.push('Vitimas: com vitimas')
    if (incident.victim_status === 'sem_vitimas') parts.push('Vitimas: sem vitimas')
    if (incident.description) parts.push('', incident.description)
    return parts.join('\n')
  }

  // So atualiza com a aba visivel (economiza requests -> banco pode suspender).
  useVisibleInterval(() => {
    fetchIncidents(filters, page * 20, true)
  }, 8000)

  const sendWhatsApp = (text: string, kind: 'personal' | 'business' = 'personal') => {
    const encoded = encodeURIComponent(text)
    const url = kind === 'business'
      ? `whatsapp://send?text=${encoded}`
      : `https://wa.me/?text=${encoded}`
    window.open(url, '_blank', 'noopener,noreferrer')
    setWhatsAppMenu(null)
  }

  const canEdit = (incident: Incident) => {
    if (hasFullAccess || role === 'admin') return true
    if (incident.created_by !== userId) return false
    return Date.now() - parseApiDate(incident.created_at).getTime() <= 2 * 60 * 60 * 1000
  }

  const closeModal = () => {
    setModal(false)
    setEditing(null)
    setSavedIncident(null)
    setForm(emptyForm)
    setFormError(null)
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, horario: nowHHMM() })
    setSavedIncident(null)
    setFormError(null)
    setModal(true)
  }

  const openEdit = (incident: Incident) => {
    setEditing(incident)
    setForm({
      prefix_code: incident.prefix_code || '',
      incident_type: incident.incident_type || '',
      line: incident.line || '',
      direction: incident.direction || '',
      description: incident.description || '',
      victim_status: incident.victim_status || '',
      replacement_prefix: incident.replacement_prefix || '',
      horario: incident.horario || '',
      cep: '',
      local: incident.local || '',
      passageiros: incident.passageiros != null ? String(incident.passageiros) : '',
      motorista: incident.motorista || '',
    })
    setSavedIncident(null)
    setFormError(null)
    setModal(true)
  }

  // Passo 1: salva no banco (cria/atualiza). Em sucesso, guarda a ocorrência
  // salva — só então o botão de WhatsApp é habilitado, garantindo que nada é
  // enviado antes de estar persistido.
  const handleSave = async () => {
    if (!form.prefix_code || !form.incident_type) {
      setFormError('Preencha prefixo e tipo de evento.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        prefix_code: form.prefix_code,
        incident_type: form.incident_type,
        line: form.line || undefined,
        direction: form.direction || undefined,
        description: form.description || undefined,
        victim_status: form.victim_status || undefined,
        replacement_prefix: form.replacement_prefix.trim() || undefined,
        local: form.local.trim() || undefined,
        motorista: form.motorista.trim() || undefined,
        passageiros: form.passageiros !== '' ? Number(form.passageiros) : undefined,
        horario: form.horario || undefined,
        unit: userUnit || undefined,
        status: 'aberto',
      } as any
      const saved = editing
        ? await updateIncident(editing.id, payload)
        : await createIncident(payload)
      setSavedIncident(saved)
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignora */ }
      await fetchIncidents(filters, page * 20)
    } catch (e: any) {
      setFormError(e?.response?.data?.detail || 'Erro ao registrar ocorrência.')
    } finally {
      setSaving(false)
    }
  }

  // Passo 2: envia via WhatsApp a ocorrência JÁ salva e fecha o modal.
  const handleSendWhatsApp = () => {
    if (!savedIncident) return
    sendWhatsApp(incidentText(savedIncident))
    closeModal()
  }

  const handleDelete = async (incident: Incident) => {
    if (!confirm('Apagar esta ocorrencia?')) return
    await deleteIncident(incident.id)
  }

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'America/Sao_Paulo' })

  const incidentTypeColor: Record<string, string> = {
    Avaria: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    Acidente: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    'Falha Mecânica': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    Pneu: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    Outro: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  }

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <AlertTriangle size={22} className="text-red-500" />
            Ocorrências
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 capitalize mt-0.5">{today}</p>
        </div>
        <button
          onClick={openCreate}
          className="btn-primary"
        >
          <Plus size={16} />
          Registrar Ocorrência
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-4 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400 dark:text-gray-500 text-sm">
          Carregando...
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Sub-header */}
          <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-3 justify-between items-center">
            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              {total} ocorrência{total !== 1 ? 's' : ''} hoje
            </span>
            {showGarageFilter && (
              <div className="relative">
                <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-700 dark:text-brand-400 pointer-events-none" />
                <select
                  value={filters.unit || ''}
                  onChange={e => applyFilters({ ...filters, unit: e.target.value || undefined })}
                  className="select pl-9 font-semibold"
                >
                  <option value="">{isAdmin ? 'Todas as garagens' : 'Todas as minhas garagens'}</option>
                  {garageOptions.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <div className="flex items-center gap-1.5"><Hash size={12} /> Prefixo</div>
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Tipo de Evento
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <div className="flex items-center gap-1.5"><Bus size={12} /> Linha</div>
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Sentido
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Descrição
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Substituto
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <div className="flex items-center gap-1.5"><Clock size={12} /> Horário</div>
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Acoes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {incidents.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
                      <AlertTriangle size={24} className="mx-auto mb-2 opacity-30" />
                      Nenhuma ocorrência registrada hoje.
                    </td>
                  </tr>
                )}
                {incidents.map(i => (
                  <Fragment key={i.id}>
                  <tr
                    onClick={() => setExpandedId(expandedId === i.id ? null : i.id)}
                    className="hover:bg-gray-50/70 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <ChevronDown size={14} className={`text-gray-400 shrink-0 transition-transform ${expandedId === i.id ? 'rotate-180' : ''}`} />
                        <span className="font-mono font-bold text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-lg text-xs">
                          {i.prefix_code}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${incidentTypeColor[i.incident_type] || incidentTypeColor['Outro']}`}>
                        {i.incident_type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-700 dark:text-gray-300 font-medium">
                      {i.line || <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-gray-700 dark:text-gray-300">
                      {i.direction || <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 max-w-xs truncate">
                      {i.description || <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      {i.replacement_prefix ? (
                        <span className="font-mono font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-lg text-xs">
                          {i.replacement_prefix}
                        </span>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-gray-600 dark:text-gray-300 font-semibold">
                        {i.horario || parseApiDate(i.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="relative flex flex-wrap gap-1.5" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setWhatsAppMenu(whatsAppMenu === i.id ? null : i.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 text-xs font-semibold transition-colors"
                        >
                          <MessageCircle size={12} />
                          WhatsApp
                        </button>
                        {canEdit(i) && (
                          <button
                            onClick={() => openEdit(i)}
                            className="inline-flex items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60 p-1.5 transition-colors"
                            title="Editar ocorrencia"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        {(hasFullAccess || role === 'admin') && (
                          <button
                            onClick={() => handleDelete(i)}
                            className="inline-flex items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 p-1.5 transition-colors"
                            title="Apagar ocorrencia"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                        {whatsAppMenu === i.id && (
                          <div className="absolute right-0 top-8 z-10 min-w-44 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-card-lg p-1">
                            <button
                              onClick={() => sendWhatsApp(incidentText(i), 'personal')}
                              className="block w-full text-left rounded-lg px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              WhatsApp pessoal
                            </button>
                            <button
                              onClick={() => sendWhatsApp(incidentText(i), 'business')}
                              className="block w-full text-left rounded-lg px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              WhatsApp Business
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedId === i.id && (
                    <tr className="bg-gray-50/60 dark:bg-gray-900/40">
                      <td colSpan={8} className="px-5 pb-4 pt-1">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                          <Detail label="Horário do evento" value={i.horario} icon={<Clock size={12} />} />
                          <Detail label="Linha" value={i.line} />
                          <Detail label="Sentido" value={i.direction} />
                          <Detail label="Prefixo substituto" value={i.replacement_prefix} mono />
                          <Detail label="Passageiros a bordo" value={i.passageiros != null ? String(i.passageiros) : ''} icon={<UsersIcon size={12} />} />
                          <Detail label="Vítimas" value={i.victim_status === 'com_vitimas' ? 'Com vítimas' : i.victim_status === 'sem_vitimas' ? 'Sem vítimas' : ''} />
                          <div className="col-span-2 sm:col-span-3">
                            <Detail label="Local" value={i.local} icon={<MapPin size={12} />} />
                          </div>
                          <div className="col-span-2 sm:col-span-3">
                            <Detail label="Motorista" value={i.motorista} icon={<UserIcon size={12} />} />
                          </div>
                          <div className="col-span-2 sm:col-span-3">
                            <Detail label="Descrição resumida" value={i.description} />
                          </div>
                          <Detail label="Registrado às" value={parseApiDate(i.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} />
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40">
              <button
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-white dark:hover:bg-gray-700 transition-all"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Pág. <span className="font-semibold text-gray-700 dark:text-gray-300">{page + 1}</span> / {totalPages}
              </span>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-white dark:hover:bg-gray-700 transition-all"
              >
                Próxima <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal de registro — renderizado num PORTAL no body, para nao ficar preso
          ao container da pagina (o wrapper animado do layout tem transform, que
          vira containing block e cortava o modal fixed). Assim ele e um menu
          flutuante de verdade, solto da pagina, mostrando tudo e rolando certo. */}
      {modal && createPortal(
        <div data-modal-open className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
          <div className="max-h-[90vh] max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-modal dark:border-gray-700 dark:bg-gray-800 my-auto">
            {/* Modal header (fixo no topo enquanto rola) */}
            <div className="sticky top-0 z-10 bg-red-600 dark:bg-red-700 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <AlertTriangle size={18} />
                <h2 className="text-base font-bold">{editing ? 'Editar Ocorrencia' : 'Registrar Ocorrência'}</h2>
              </div>
              <button
                onClick={closeModal}
                className="text-red-200 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal body (a caixa inteira rola; header/rodape ficam sticky) */}
            <div className="p-6">
              {formError && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl p-3 mb-4">
                  <p className="text-red-600 dark:text-red-400 text-sm">{formError}</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                      Prefixo *
                    </label>
                    <input
                      name="prefix_code"
                      value={form.prefix_code}
                      onChange={handle}
                      className="input"
                      placeholder="Ex: 4521"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                      Tipo de Evento *
                    </label>
                    <select
                      name="incident_type"
                      value={form.incident_type}
                      onChange={handle}
                      className="select"
                    >
                      <option value="">Selecione...</option>
                      <option>Avaria</option>
                      <option>Acidente</option>
                      <option>Falha Mecânica</option>
                      <option>Pneu</option>
                      <option>Outro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                      Linha
                    </label>
                    <input
                      name="line"
                      value={form.line}
                      onChange={handle}
                      className="input"
                      placeholder="Ex: 803"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                      Sentido
                    </label>
                    <select
                      name="direction"
                      value={form.direction}
                      onChange={handle}
                      className="select"
                    >
                      <option value="">Selecione...</option>
                      <option value="ENTRADA">ENTRADA</option>
                      <option value="SAIDA">SAIDA</option>
                      <option value="EM DESLOCAMENTO">EM DESLOCAMENTO</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                      Prefixo substituto
                    </label>
                    <input
                      name="replacement_prefix"
                      value={form.replacement_prefix}
                      onChange={handleDigits('replacement_prefix', 4)}
                      inputMode="numeric"
                      maxLength={4}
                      className="input font-mono"
                      placeholder="0000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                      Horário
                    </label>
                    <input
                      type="time"
                      name="horario"
                      value={form.horario}
                      onChange={handle}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                      CEP <span className="normal-case font-normal text-gray-400">(autopreenche o local)</span>
                    </label>
                    <input
                      name="cep"
                      value={form.cep}
                      onChange={handleDigits('cep', 8)}
                      onBlur={() => lookupCep(form.cep)}
                      inputMode="numeric"
                      maxLength={8}
                      className="input font-mono"
                      placeholder="00000000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                      Passageiros a bordo
                    </label>
                    <input
                      name="passageiros"
                      value={form.passageiros}
                      onChange={handleDigits('passageiros', 2)}
                      inputMode="numeric"
                      maxLength={2}
                      className="input"
                      placeholder="0"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                      <MapPin size={12} /> Local {cepLoading && <span className="normal-case font-normal text-brand-500">buscando…</span>}
                    </label>
                    <input
                      name="local"
                      value={form.local}
                      onChange={handle}
                      className="input"
                      placeholder="Rua, bairro, cidade — ou digite o CEP acima"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                      <UserIcon size={12} /> Motorista
                    </label>
                    <input
                      name="motorista"
                      value={form.motorista}
                      onChange={handle}
                      className="input"
                      placeholder="Nome do motorista"
                    />
                  </div>
                </div>

                {form.incident_type === 'Acidente' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                      Vítimas *
                    </label>
                    <select
                      name="victim_status"
                      value={form.victim_status}
                      onChange={handle}
                      className="select"
                    >
                      <option value="">Selecione...</option>
                      <option value="com_vitimas">Com vítimas</option>
                      <option value="sem_vitimas">Sem vítimas</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                    Descrição resumida
                  </label>
                  <textarea
                    name="description"
                    value={form.description}
                    onChange={handle}
                    className="input resize-y"
                    rows={3}
                    placeholder="Explicação mais detalhada do evento..."
                  />
                </div>

                {savedIncident && (
                  <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/25 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded-xl px-3 py-2.5 text-sm">
                    <Check size={16} className="shrink-0" />
                    Ocorrência registrada no sistema. Agora você pode enviar via WhatsApp.
                  </div>
                )}
                <div className="sticky bottom-0 -mx-6 -mb-6 mt-2 flex justify-end gap-2 border-t border-gray-100 bg-white/95 px-6 py-3 backdrop-blur dark:border-gray-700 dark:bg-gray-800/95">
                  <button
                    onClick={closeModal}
                    className="btn-secondary"
                  >
                    {savedIncident ? 'Fechar' : 'Cancelar'}
                  </button>
                  {!savedIncident ? (
                    <button
                      onClick={handleSave}
                      disabled={saving || !form.prefix_code || !form.incident_type}
                      className="btn-primary"
                    >
                      <Plus size={15} />
                      {saving ? 'Registrando...' : editing ? 'Salvar' : 'Registro'}
                    </button>
                  ) : (
                    <button
                      onClick={handleSendWhatsApp}
                      className="inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-xl px-4 py-2.5 font-semibold text-sm transition-colors"
                    >
                      <MessageCircle size={15} />
                      Enviar via WhatsApp
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </Layout>
  )
}
