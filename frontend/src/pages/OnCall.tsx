import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../components/Layout'
import { ScheduleFilters, ScheduleLine, useSchedule } from '../hooks/useSchedule'
import { useSwaps } from '../hooks/useSwaps'
import { DEFAULT_OPERATION_DATE } from '../config/demo'
import { useAuthStore } from '../store/auth'
import client from '../api/client'
import {
  CheckCircle2, ArrowLeftRight, X, MessageCircle, Clock,
  Bus, MapPin, User, ChevronRight, Filter, Bell,
} from 'lucide-react'
import { enablePush, currentPushState, pushSupported, isIOS, isStandalone, PushState } from '../utils/push'

const ALL_UNITS = ['Caieiras', 'Jundiai', 'Santana de Parnaiba']

// Copia texto de forma robusta. No iOS o navigator.clipboard rejeita quando
// chamado depois de um await (perde o "gesto do usuario"); por isso ha o
// fallback com textarea + execCommand. Retorna true se conseguiu copiar.
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // cai no fallback abaixo
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// Abre o WhatsApp com o texto pre-preenchido. Usa location.href (em vez de
// window.open) porque no mobile o popup e bloqueado apos um await.
function openWhatsApp(text: string) {
  window.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`
}

// Minutos ate o inicio da linha, no fuso de Brasilia. Calcula apenas para a
// escala de HOJE; outras datas retornam null (sem urgencia de relogio).
function minutesUntilStart(startTime?: string, scheduleDate?: string): number | null {
  if (!startTime) return null
  const now = new Date()
  const spDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  if (scheduleDate && scheduleDate !== spDate) return null
  const spTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now)
  const [nh, nm] = spTime.split(':').map(Number)
  const [sh, sm] = startTime.split(':').map(Number)
  return (sh * 60 + sm) - (nh * 60 + nm)
}

// Cor por proximidade do inicio: verde > 30 min, laranja 20-30 min, vermelho
// (circulado) < 20 min. Sem dado de tempo (outra data) fica neutro/verde.
function getUrgency(mins: number | null): { card: string; badge: string } {
  if (mins !== null && mins < 20) return {
    card: 'border-red-400 dark:border-red-600 ring-2 ring-red-500/70 animate-pulse',
    badge: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  }
  if (mins !== null && mins <= 30) return {
    card: 'border-orange-300 dark:border-orange-700',
    badge: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
  }
  return {
    card: 'border-green-300 dark:border-green-800',
    badge: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  }
}

function countdownLabel(mins: number | null): string | null {
  if (mins === null) return null
  if (mins <= 0) return 'iniciando agora'
  if (mins < 60) return `em ${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `em ${h}h${String(m).padStart(2, '0')}` : `em ${h}h`
}

export function OnCall() {
  const userUnit = useAuthStore(s => s.userUnit)
  const userUnits = useAuthStore(s => s.userUnits)
  const role = useAuthStore(s => s.role)
  const hasFullAccess = useAuthStore(s => s.hasFullAccess)

  // Unidades disponíveis para este usuário
  const availableUnits = useMemo(() => {
    if (userUnits && userUnits.length > 0) return userUnits
    if (userUnit) return [userUnit]
    return ALL_UNITS
  }, [userUnit, userUnits])

  const [filters, setFilters] = useState<ScheduleFilters>({
    schedule_date: DEFAULT_OPERATION_DATE,
    unit: availableUnits[0] || 'Caieiras',
    status: 'pendente',
  })
  const [autoMode, setAutoMode] = useState(true)
  const lineSearch = filters.line_code?.trim()

  const pendingFilters = useMemo(() => ({
    ...filters,
    status: lineSearch ? undefined : 'pendente',
    line_code: lineSearch || undefined,
    ...(autoMode && !lineSearch ? { start_in_minutes: '120' } : {}),
  }), [filters, autoMode, lineSearch])

  const pending = useSchedule(pendingFilters)
  const swapsList = useSwaps({ unit: filters.unit, schedule_date: filters.schedule_date })
  const canManageLines = hasFullAccess || role === 'admin' || role === 'gerente' || role === 'supervisao' || role === 'supervisor'
  // Apenas admin/acesso total escolhe a unidade. Plantonista fica travado na
  // garagem cadastrada (a unica do seu perfil).
  const canChooseUnit = hasFullAccess || role === 'admin'
  const unitOptions = canChooseUnit ? ALL_UNITS : availableUnits
  const unitLocked = !canChooseUnit && availableUnits.length <= 1

  // Estado do card com troca inline aberta
  const [swapOpenId, setSwapOpenId] = useState<number | null>(null)
  const [swapVehicle, setSwapVehicle] = useState('')
  const [swapDriver, setSwapDriver] = useState('')
  const [swapReason, setSwapReason] = useState('')
  const [swapSaving, setSwapSaving] = useState(false)
  const [relatedLines, setRelatedLines] = useState<ScheduleLine[]>([])
  const [relatedLoading, setRelatedLoading] = useState(false)
  const [selectedRelatedIds, setSelectedRelatedIds] = useState<number[]>([])

  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  // "Tick" para recalcular as cores/contagem regressiva conforme o tempo passa
  // (o auto-refresh e silencioso e nao re-renderiza se os dados nao mudam).
  const [, setTick] = useState(0)

  // Notificacoes push (alerta de linha entrando em <20 min)
  const [pushState, setPushState] = useState<PushState>(() => currentPushState())
  const [pushInfo, setPushInfo] = useState<string | null>(null)

  const handleEnablePush = async () => {
    setPushInfo(null)
    const res = await enablePush()
    if (res.ok) {
      setPushState('granted')
      setPushInfo('Notificações ativadas neste aparelho.')
    } else if (res.reason === 'ios-instalar') {
      setPushInfo('No iPhone, primeiro instale o app: toque em Compartilhar → "Adicionar à Tela de Início", abra pelo ícone e ative novamente.')
    } else if (res.reason === 'permissao-negada') {
      setPushState('denied')
      setPushInfo('Permissão negada. Habilite as notificações nas configurações do navegador.')
    } else if (res.reason === 'nao-suportado') {
      setPushInfo('Este navegador não suporta notificações.')
    } else if (res.reason === 'sem-vapid') {
      setPushInfo('Push ainda não configurado no servidor.')
    } else {
      setPushInfo('Não foi possível ativar as notificações.')
    }
  }

  const [statusLine, setStatusLine] = useState<{ line: ScheduleLine; action: 'cancel' } | null>(null)
  const [statusReason, setStatusReason] = useState('')

  const handleFilter = (event: React.FormEvent) => {
    event.preventDefault()
    pending.applyFilters(pendingFilters)
  }

  // Trava a unidade na garagem do plantonista (mesmo se o perfil carregar
  // depois do primeiro render ou se o filtro tiver outra unidade salva).
  useEffect(() => {
    if (!canChooseUnit && availableUnits.length > 0 && !availableUnits.includes(filters.unit || '')) {
      setFilters(s => ({ ...s, unit: availableUnits[0] }))
    }
  }, [canChooseUnit, availableUnits, filters.unit])

  useEffect(() => {
    swapsList.applyFilters({ unit: filters.unit, schedule_date: filters.schedule_date })
  }, [filters.unit, filters.schedule_date])

  useEffect(() => {
    const refresh = () => {
      // Atualizacao silenciosa: sem spinner e so re-renderiza se algo mudou,
      // para a lista nao "tremer" enquanto o plantonista clica nos botoes.
      pending.refetch(pendingFilters, 0, { silent: true })
      swapsList.fetchSwaps({ unit: filters.unit, schedule_date: filters.schedule_date }, 0, { silent: true })
    }
    const interval = window.setInterval(refresh, 8000)
    return () => window.clearInterval(interval)
  }, [pendingFilters, filters.unit, filters.schedule_date])

  useEffect(() => {
    const t = window.setInterval(() => setTick(x => x + 1), 30000)
    return () => window.clearInterval(t)
  }, [])

  const handleConfirm = async (id: number) => {
    setActionError(null)
    setActionMessage(null)
    try {
      await pending.confirmLine(id)
      await swapsList.fetchSwaps({ unit: filters.unit, schedule_date: filters.schedule_date }, 0)
      setActionMessage('Linha confirmada.')
    } catch (e: any) {
      setActionError(e?.response?.data?.detail || 'Não foi possível confirmar a linha.')
    }
  }

  const openSwap = async (line: ScheduleLine) => {
    setSwapOpenId(line.id)
    setSwapVehicle('')
    setSwapDriver('')
    setSwapReason('')
    setRelatedLines([])
    setSelectedRelatedIds([])
    setActionError(null)
    setRelatedLoading(true)
    try {
      const res = await client.get<ScheduleLine[]>('/schedule/lines', {
        params: {
          schedule_date: filters.schedule_date,
          unit: line.unit,
          prefix_code: line.prefix_code,
          limit: 500,
        },
      })
      // Corte por horario (Opcao A): se a escala e de hoje, mostra apenas as
      // linhas que ainda vao comecar (inicio >= hora atual de Brasilia). Para
      // datas futuras nada "passou", entao mostra tudo. Linhas que viram o dia
      // (ex.: 23:25 -> 00:12) entram porque comecam no mesmo dia.
      const spDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date())
      const spTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date())
      const isToday = filters.schedule_date === spDate
      setRelatedLines(
        res.data.filter(item =>
          item.id !== line.id &&
          item.status !== 'cancelada' &&
          (!isToday || (item.start_time || '') >= spTime),
        ),
      )
    } catch {
      setActionError('Nao foi possivel carregar as outras linhas deste prefixo.')
    } finally {
      setRelatedLoading(false)
    }
  }

  const handleCreateSwap = async (line: ScheduleLine) => {
    if (!swapVehicle.trim() && !swapDriver.trim()) return
    setSwapSaving(true)
    setActionError(null)
    try {
      const linesToSwap = [
        line,
        ...relatedLines.filter(item => selectedRelatedIds.includes(item.id)),
      ]
      for (const item of linesToSwap) {
        if (item.status !== 'confirmada') {
          await pending.confirmLine(item.id)
        }
        await swapsList.createSwap({
          schedule_line_id: item.id,
          schedule_date: filters.schedule_date,
          vehicle_out: item.prefix_code,
          vehicle_in: swapVehicle.trim() || undefined,
          driver_out: item.driver_name,
          driver_in: swapDriver.trim() || undefined,
          reason: swapReason || undefined,
          lines_covered: `${item.direction} - ${item.line_code}`,
        } as any)
      }
      await pending.refetch(pendingFilters, 0)
      setSwapOpenId(null)
      setSwapVehicle('')
      setSwapDriver('')
      setSwapReason('')
      setRelatedLines([])
      setSelectedRelatedIds([])
      setActionMessage(`${linesToSwap.length} troca(s) registrada(s)! Copie o texto no painel lateral para enviar no WhatsApp.`)
    } catch (e: any) {
      setActionError(e?.response?.data?.detail || 'Não foi possível registrar a troca.')
    } finally {
      setSwapSaving(false)
    }
  }

  const handleStatusChange = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!statusLine) return
    setActionError(null)
    try {
      await pending.cancelLine(statusLine.line.id, statusReason)
      await pending.refetch(pendingFilters, 0)
      setActionMessage('Linha cancelada.')
      setStatusLine(null)
      setStatusReason('')
    } catch (e: any) {
      setActionError(e?.response?.data?.detail || 'Não foi possível cancelar a linha.')
    }
  }

  const handleCopySwap = async (text: string, id: number) => {
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } else {
      // Sem clipboard (iOS): abre direto o WhatsApp com o texto.
      openWhatsApp(text)
    }
  }

  const handleSendWhatsApp = async () => {
    setActionError(null)
    try {
      const params = new URLSearchParams()
      if (filters.unit) params.set('unit', filters.unit)
      if (filters.schedule_date) params.set('schedule_date', filters.schedule_date)
      const res = await client.get(`/swaps/whatsapp/text?${params}`)
      const text = res.data.text as string
      if (!text || res.data.total === 0) {
        setActionError('Nenhuma troca registrada para enviar.')
        return
      }
      // Nao depende de clipboard: abre o WhatsApp com o texto pre-preenchido.
      openWhatsApp(text)
    } catch {
      setActionError('Erro ao gerar texto de trocas.')
    }
  }

  const handleCopyAllSwaps = async () => {
    setActionError(null)
    try {
      const params = new URLSearchParams()
      if (filters.unit) params.set('unit', filters.unit)
      if (filters.schedule_date) params.set('schedule_date', filters.schedule_date)
      const res = await client.get(`/swaps/whatsapp/text?${params}`)
      const text = res.data.text as string
      if (!text || res.data.total === 0) {
        setActionError('Nenhuma troca registrada para copiar.')
        return
      }
      const ok = await copyToClipboard(text)
      if (ok) {
        setActionMessage('Texto copiado! Cole no WhatsApp.')
      } else {
        // Fallback mobile: se nao deu para copiar, abre o WhatsApp com o texto.
        openWhatsApp(text)
      }
    } catch {
      setActionError('Erro ao gerar texto de trocas.')
    }
  }

  const allConfirmed = !lineSearch && !pending.loading && pending.lines.length === 0

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Bus size={22} className="text-brand-600 dark:text-brand-400" />
            Confirmação de Escala
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Confirme as linhas e registre trocas. As trocas ficam no painel lateral para copiar e enviar no WhatsApp.
          </p>
        </div>

        {/* Filtros */}
        <form
          onSubmit={handleFilter}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 grid grid-cols-1 md:grid-cols-[160px_220px_170px_auto_auto] gap-3 items-end"
        >
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Data
            <input
              type="date"
              value={filters.schedule_date || ''}
              onChange={e => setFilters(s => ({ ...s, schedule_date: e.target.value }))}
              className="mt-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Unidade
            {unitLocked ? (
              <div
                title="Garagem vinculada ao seu cadastro"
                className="mt-1.5 flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-xl px-3 py-2.5 text-sm w-full font-semibold"
              >
                <MapPin size={14} className="text-brand-600 dark:text-brand-400 shrink-0" />
                {filters.unit || availableUnits[0]}
              </div>
            ) : (
              <select
                value={filters.unit || ''}
                onChange={e => setFilters(s => ({ ...s, unit: e.target.value }))}
                className="mt-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full font-normal"
              >
                {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            )}
          </label>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Linha
            <input
              value={filters.line_code || ''}
              onChange={e => setFilters(s => ({ ...s, line_code: e.target.value }))}
              placeholder="Ex: 3534"
              inputMode="numeric"
              className="mt-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex flex-col justify-end">
            <span className="mb-1.5">Próximas 2 horas</span>
            <button
              type="button"
              onClick={() => {
                const next = !autoMode
                setAutoMode(next)
                pending.applyFilters({
                  ...filters,
                  line_code: filters.line_code?.trim() || undefined,
                  ...(next && !filters.line_code?.trim() ? { start_in_minutes: '120' } : {}),
                })
              }}
              className={`relative inline-flex h-10 w-16 items-center rounded-xl text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 ${autoMode ? 'bg-brand-700 dark:bg-brand-600 border-brand-700' : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600'} border`}
            >
              <span className={`absolute left-1 transition-all duration-200 ${autoMode ? 'translate-x-7' : 'translate-x-0'} inline-block w-6 h-6 rounded-lg bg-white shadow`} />
              <span className={`pl-2 transition-opacity text-gray-600 ${autoMode ? 'opacity-0' : 'opacity-100'}`}>Não</span>
              <span className={`pl-1 transition-opacity text-white ${autoMode ? 'opacity-100' : 'opacity-0'}`}>Sim</span>
            </button>
          </label>
          <button
            type="submit"
            className="flex items-center justify-center gap-2 bg-brand-700 hover:bg-brand-800 dark:bg-brand-600 text-white rounded-xl px-4 py-2.5 font-semibold text-sm transition-all self-end"
          >
            <Filter size={14} />
            Atualizar
          </button>
        </form>

        {/* Ativar notificacoes push */}
        {pushSupported() && pushState !== 'granted' && (
          <div className="bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Bell size={18} className="text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-brand-800 dark:text-brand-300">Ative os alertas de linha</p>
                <p className="text-xs text-brand-700 dark:text-brand-400 mt-0.5">
                  Receba uma notificação quando uma linha pendente entrar em menos de 20 min.
                  {isIOS() && !isStandalone() && ' No iPhone, instale o app na tela inicial antes (Compartilhar → "Adicionar à Tela de Início").'}
                </p>
              </div>
            </div>
            <button
              onClick={handleEnablePush}
              className="flex items-center justify-center gap-1.5 bg-brand-700 hover:bg-brand-800 dark:bg-brand-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap shrink-0"
            >
              <Bell size={14} />
              Ativar notificações
            </button>
          </div>
        )}
        {pushInfo && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 flex items-center gap-2">
            <Bell size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
            <p className="text-blue-700 dark:text-blue-300 text-sm">{pushInfo}</p>
          </div>
        )}

        {/* Mensagens */}
        {actionMessage && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-600 dark:text-green-400 shrink-0" />
            <p className="text-green-700 dark:text-green-300 text-sm">{actionMessage}</p>
          </div>
        )}
        {actionError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 flex items-center gap-2">
            <X size={16} className="text-red-500 shrink-0" />
            <p className="text-red-700 dark:text-red-300 text-sm">{actionError}</p>
          </div>
        )}

        {/* Banner todas confirmadas */}
        {allConfirmed && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={22} className="text-green-600 dark:text-green-400 shrink-0" />
              <div>
                <p className="text-green-800 dark:text-green-300 font-semibold">Todas as linhas foram confirmadas!</p>
                <p className="text-green-700 dark:text-green-400 text-sm">Envie o resumo de confirmação pelo WhatsApp.</p>
              </div>
            </div>
            <button
              onClick={handleSendWhatsApp}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap"
            >
              <MessageCircle size={15} />
              Enviar por WhatsApp
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
          {/* Linhas pendentes */}
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <div>
                <h2 className="font-bold text-gray-900 dark:text-gray-100">{lineSearch ? 'Resultado da linha' : 'Linhas pendentes'}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {lineSearch ? `Busca pela linha ${lineSearch}.` : autoMode ? 'Iniciando nas próximas 2 horas.' : 'Todas as pendentes da unidade.'}
                </p>
              </div>
              {pending.total > 0 ? (
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500" />
                  </span>
                  <span className="rounded-full px-3 py-1 text-xs font-semibold bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300">
                    {pending.total} {lineSearch ? 'resultado(s)' : 'pendentes'}
                  </span>
                </div>
              ) : (
                <span className="rounded-full px-3 py-1 text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                  {pending.total} {lineSearch ? 'resultado(s)' : 'pendentes'}
                </span>
              )}
            </div>

            <div className="p-4 grid gap-3">
              {pending.loading && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">Carregando linhas...</p>
              )}
              {pending.error && (
                <p className="text-sm text-red-600 dark:text-red-400">{pending.error}</p>
              )}
              {pending.lines.length === 0 && !pending.loading && (
                <div className="text-center py-10">
                  <Bus size={28} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    {lineSearch ? 'Nenhuma linha pendente encontrada para essa busca.' : autoMode ? 'Nenhuma linha iniciando nas próximas 2 horas.' : 'Nenhuma linha pendente.'}
                  </p>
                </div>
              )}

              {pending.lines.map(line => {
                const mins = minutesUntilStart(line.start_time, filters.schedule_date)
                const urgency = getUrgency(mins)
                const countdown = countdownLabel(mins)
                return (
                <article
                  key={line.id}
                  className={`border ${urgency.card} rounded-2xl p-4 hover:shadow-sm transition-shadow bg-gray-50/50 dark:bg-gray-700/30`}
                >
                  {/* Topo do card — badges */}
                  <div className="flex flex-wrap items-center gap-2.5 mb-3">
                    <span className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-base sm:text-lg font-black bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 leading-none">
                      <Bus size={15} />
                      L - {line.line_code}
                    </span>
                    <span className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-base sm:text-lg font-black leading-none ${urgency.badge}`}>
                      <Clock size={15} />
                      {line.start_time} – {line.end_time}
                    </span>
                    {countdown && (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${urgency.badge}`}>
                        {countdown}
                      </span>
                    )}
                    <span className="rounded-full px-3 py-1.5 text-sm font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                      {line.direction}
                    </span>
                  </div>

                  {/* Prefixo destaque + cliente */}
                  <div className="mb-2">
                    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-brand-800 dark:text-brand-300">
                      <span className="text-sm font-bold uppercase tracking-wide">Prefixo</span>
                      <span className="text-2xl sm:text-3xl font-black leading-none tracking-tight">{line.prefix_code}</span>
                    </p>
                  </div>

                  {/* Dados da linha */}
                  <div className="mb-3 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <p className="font-semibold text-gray-700 dark:text-gray-200 leading-tight">
                        {line.client_name}
                      </p>
                      <p className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <MapPin size={11} className="shrink-0" />
                        {line.route_name}
                      </p>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                      <User size={11} className="shrink-0" />
                      {line.driver_name}
                    </p>
                  </div>

                  {/* Botões de ação */}
                  {swapOpenId !== line.id ? (
                    <div className="flex gap-2">
                      {line.status !== 'confirmada' && (
                        <button
                          onClick={() => handleConfirm(line.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-green-700 hover:bg-green-800 dark:bg-green-700 dark:hover:bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                        >
                          <CheckCircle2 size={15} />
                          Confirmar
                        </button>
                      )}
                      <button
                        onClick={() => openSwap(line)}
                        className="flex-1 flex items-center justify-center gap-1.5 border-2 border-accent-500 text-accent-600 dark:text-accent-400 dark:border-accent-500 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-accent-50 dark:hover:bg-accent-900/20 transition-all"
                      >
                        <ArrowLeftRight size={15} />
                        {line.status === 'confirmada' ? 'Trocar novamente' : 'Trocar'}
                      </button>
                      {canManageLines && (
                        <button
                          onClick={() => setStatusLine({ line, action: 'cancel' })}
                          className="flex items-center justify-center border border-red-200 dark:border-red-800 text-red-500 dark:text-red-400 px-3 py-2.5 rounded-xl text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                          title="Cancelar linha"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  ) : (
                    /* Formulário de troca inline */
                    <div className="mt-1 bg-amber-50 dark:bg-amber-900/20 border-2 border-accent-500/60 dark:border-accent-500/40 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <ArrowLeftRight size={14} className="text-accent-600 dark:text-accent-400" />
                        <p className="text-xs font-bold text-accent-700 dark:text-accent-300 uppercase tracking-wide">
                          Troca operacional
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          autoFocus
                          value={swapVehicle}
                          onChange={e => setSwapVehicle(e.target.value)}
                          placeholder="Prefixo substituto (opcional)"
                          className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <input
                          value={swapDriver}
                          onChange={e => setSwapDriver(e.target.value)}
                          placeholder="Motorista substituto (opcional)"
                          className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-white/70 dark:bg-gray-800/60 p-3">
                        <p className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">
                          Outras linhas do prefixo {line.prefix_code}
                        </p>
                        {relatedLoading && (
                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Carregando sequencia...</p>
                        )}
                        {!relatedLoading && relatedLines.length === 0 && (
                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            Nenhuma outra linha deste carro para a data/unidade selecionada.
                          </p>
                        )}
                        {!relatedLoading && relatedLines.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {relatedLines.map(item => (
                              <label
                                key={item.id}
                                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-amber-100/70 dark:hover:bg-amber-900/20"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedRelatedIds.includes(item.id)}
                                  onChange={e => {
                                    setSelectedRelatedIds(prev =>
                                      e.target.checked
                                        ? [...prev, item.id]
                                        : prev.filter(id => id !== item.id),
                                    )
                                  }}
                                />
                                <span className="font-mono font-semibold">L - {item.line_code}</span>
                                <span>{item.direction}</span>
                                <span>{item.start_time} - {item.end_time}</span>
                                <span className="text-gray-400 dark:text-gray-500">{item.status}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleCreateSwap(line)}
                          disabled={swapSaving || (!swapVehicle.trim() && !swapDriver.trim())}
                          className="flex-1 bg-brand-700 hover:bg-brand-800 dark:bg-brand-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 whitespace-nowrap"
                        >
                          {swapSaving ? 'Salvando...' : 'Salvar troca'}
                        </button>
                        <button
                          onClick={() => setSwapOpenId(null)}
                          className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 px-3 py-2.5 rounded-xl text-sm transition-all"
                        >
                          <X size={15} />
                        </button>
                      </div>
                      <input
                        value={swapReason}
                        onChange={e => setSwapReason(e.target.value)}
                        placeholder="Motivo (opcional)"
                        className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  )}
                </article>
                )
              })}
            </div>
          </section>

          {/* Painel lateral de trocas */}
          <aside className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <ArrowLeftRight size={16} className="text-brand-600 dark:text-brand-400" />
                Trocas registradas
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Copie o texto consolidado e envie no WhatsApp.</p>
              {swapsList.swaps.length > 0 && (
                <button
                  onClick={handleCopyAllSwaps}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                >
                  <MessageCircle size={12} />
                  Copiar todas as trocas (WhatsApp)
                </button>
              )}
            </div>
            <div className="p-3 space-y-2">
              {swapsList.loading && (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">Carregando...</p>
              )}
              {!swapsList.loading && swapsList.swaps.length === 0 && (
                <div className="text-center py-8">
                  <MessageCircle size={24} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">Nenhuma troca registrada.</p>
                </div>
              )}
              {swapsList.swaps.map(swap => (
                <div
                  key={swap.id}
                  className="border border-brand-100 dark:border-brand-900/40 bg-brand-50 dark:bg-brand-900/20 rounded-xl p-3 hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
                >
                  <div className="mb-2">
                    <p className="text-sm font-bold text-brand-800 dark:text-brand-300 flex items-center gap-1.5">
                      {swap.vehicle_in ? (
                        <>
                          <span className="font-mono">{swap.vehicle_out}</span>
                          <ChevronRight size={13} />
                          <span className="font-mono">{swap.vehicle_in}</span>
                        </>
                      ) : (
                        <span className="font-mono">Prefixo mantido {swap.vehicle_out}</span>
                      )}
                    </p>
                    {swap.driver_in && (
                      <p className="text-xs text-brand-700 dark:text-brand-300 mt-0.5 flex items-center gap-1">
                        <User size={10} /> {swap.driver_out ? `${swap.driver_out} -> ` : ''}{swap.driver_in}
                      </p>
                    )}
                    {swap.lines_covered && (
                      <p className="text-xs text-brand-600 dark:text-brand-400 mt-0.5 flex items-center gap-1">
                        <Bus size={10} /> {swap.lines_covered}
                      </p>
                    )}
                    {swap.reason && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{swap.reason}</p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(swap.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                    </p>
                  </div>
                  {swap.whatsapp_text && (
                    <button
                      onClick={() => handleCopySwap(swap.whatsapp_text!, swap.id)}
                      className={`flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                        copiedId === swap.id
                          ? 'bg-green-600 dark:bg-green-700 text-white'
                          : 'bg-brand-700 dark:bg-brand-600 hover:bg-brand-800 dark:hover:bg-brand-500 text-white'
                      }`}
                    >
                      <MessageCircle size={12} />
                      {copiedId === swap.id ? 'Copiado!' : 'Copiar texto WhatsApp'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </aside>
        </div>

        {/* Modal cancelar linha */}
        {statusLine && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <form
              onSubmit={handleStatusChange}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              {/* Modal header */}
              <div className="bg-red-600 dark:bg-red-700 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <X size={18} />
                  <h2 className="text-base font-bold">Cancelar linha</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setStatusLine(null)}
                  className="text-red-200 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal body */}
              <div className="p-6">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 flex items-center gap-2">
                  <Bus size={14} className="shrink-0 text-brand-500" />
                  Linha {statusLine.line.line_code} · Prefixo {statusLine.line.prefix_code}
                </p>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                  Motivo
                </label>
                <input
                  value={statusReason}
                  onChange={e => setStatusReason(e.target.value)}
                  className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full mb-5"
                  placeholder="Informe o motivo"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setStatusLine(null)}
                    className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl px-4 py-2.5 text-sm font-medium transition-all"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
                  >
                    Cancelar linha
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </Layout>
  )
}
