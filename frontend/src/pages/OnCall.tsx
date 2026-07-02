import { useEffect, useMemo, useRef, useState } from 'react'
import { Layout } from '../components/Layout'
import { ScheduleFilters, ScheduleLine, useSchedule } from '../hooks/useSchedule'
import { useSwaps } from '../hooks/useSwaps'
import { DEFAULT_OPERATION_DATE, currentOperationDate } from '../config/demo'
import { useAuthStore } from '../store/auth'
import client, { apiErrorMessage } from '../api/client'
import {
  CheckCircle2, ArrowLeftRight, X, MessageCircle, Clock,
  Bus, MapPin, User, ChevronRight, Filter, Bell, Pencil, RotateCcw, Ban,
} from 'lucide-react'
import { enablePush, currentPushState, pushSupported, isIOS, isStandalone, PushState } from '../utils/push'
import { openScheduleStream } from '../utils/scheduleStream'
import { copyToClipboard, openWhatsApp } from '../utils/clipboard'
import { parseApiDate } from '../utils/datetime'
import { plural, scheduleStatusLabel } from '../utils/format'

const ALL_UNITS = ['Caieiras', 'Jundiai', 'Santana de Parnaiba']

interface EditForm {
  prefix_code: string
  driver_name: string
  start_time: string
  end_time: string
  line_code: string
  direction: string
  client_name: string
  route_name: string
}

function lineToForm(line: ScheduleLine): EditForm {
  return {
    prefix_code: line.prefix_code,
    driver_name: line.driver_name,
    start_time: line.start_time,
    end_time: line.end_time,
    line_code: line.line_code,
    direction: line.direction,
    client_name: line.client_name,
    route_name: line.route_name ?? '',
  }
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
// pulsante entre -10 e 20 min. Linha que ja passou ha mais de 10 min fica
// neutra (ja iniciou; o alarme visual nao ajuda mais). Sem dado de tempo
// (outra data) fica neutro/verde.
function getUrgency(mins: number | null): { card: string; badge: string } {
  if (mins !== null && mins < -10) return {
    card: 'border-gray-300 dark:border-gray-600',
    badge: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  }
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
  if (mins < -10) return 'já iniciou'
  if (mins <= 0) return 'iniciando agora'
  if (mins < 60) return `em ${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `em ${h}h${String(m).padStart(2, '0')}` : `em ${h}h`
}

// Monta os filtros REALMENTE enviados a API a partir do formulario + toggle
// "Proximas 2h". Fonte UNICA de shape: submit, toggle, Data, polling e SSE
// passam por aqui — evita buscar com filtros diferentes da carga inicial
// (fix 4088a3e) ou com texto ainda sendo digitado.
function buildPendingFilters(filters: ScheduleFilters, autoMode: boolean): ScheduleFilters {
  const search = filters.line_code?.trim()
  return {
    ...filters,
    status: search ? undefined : 'pendente',
    line_code: search || undefined,
    ...(autoMode && !search ? { start_in_minutes: '120' } : {}),
    // Na lista padrao, esconde as linhas marcadas "nao opera hoje". Na busca
    // por linha elas aparecem (com indicador), para o plantonista poder desfazer.
    ...(search ? {} : { hide_non_operating: 'true' }),
  }
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

  // Filtros APLICADOS: so mudam no submit do formulario, no toggle "Proximas
  // 2h" e na troca de Data. Polling de versao, SSE e refetch pos-acao usam
  // SEMPRE estes — nunca o texto ainda sendo digitado nos inputs (`filters`).
  const [appliedFilters, setAppliedFilters] = useState<ScheduleFilters>(() => buildPendingFilters(filters, true))
  // Busca por linha APLICADA (ja normalizada pelo buildPendingFilters).
  const lineSearch = appliedFilters.line_code

  // Envio ao CCO por TURNO: por padrao (modo "Proximas 2h" ligado) o texto traz
  // so as trocas das linhas que comecam por volta de agora (~3h em torno). Com o
  // modo desligado, envia o dia inteiro. Evita repetir manha/meio-dia/noite.
  const sendWindowMinutes = autoMode && !lineSearch ? 180 : null

  const pending = useSchedule(appliedFilters)
  const swapsList = useSwaps({ unit: appliedFilters.unit, schedule_date: appliedFilters.schedule_date })
  const canManageLines = hasFullAccess || role === 'admin' || role === 'gerente' || role === 'supervisao' || role === 'supervisor'
  // "Nao operar" (por dia) e editar a linha: operadores da Confirmacao
  // (Trafego/Analista/Plantonista) alem de quem ja gerencia.
  const canCancelLine = canManageLines || role === 'plantonista' || role === 'analista'
  const canEditLine = canCancelLine
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
  // Confirmacao em lote: clicar "Confirmar" abre as demais linhas do mesmo
  // carro (prefixo) para confirmar tudo de uma vez (mesma logica da troca).
  const [confirmOpenId, setConfirmOpenId] = useState<number | null>(null)
  const [confirmSaving, setConfirmSaving] = useState(false)
  // Linha cujo "Confirmar" esta carregando as demais linhas do carro (antes de
  // decidir entre abrir o painel ou confirmar direto).
  const [confirmLoadingId, setConfirmLoadingId] = useState<number | null>(null)

  // Edicao inline da linha (estilo ADM), direto no painel.
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [editSaving, setEditSaving] = useState(false)

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

  // Modal "Nao operar" (por dia, com par Entrada/Saida).
  const [nonOpLine, setNonOpLine] = useState<ScheduleLine | null>(null)
  const [nonOpPair, setNonOpPair] = useState<ScheduleLine[]>([])
  const [nonOpSelected, setNonOpSelected] = useState<number[]>([])
  const [nonOpLoading, setNonOpLoading] = useState(false)
  const [nonOpSaving, setNonOpSaving] = useState(false)
  // "Voltar a operar" em voo (anti duplo-submit).
  const [backToOperateId, setBackToOperateId] = useState<number | null>(null)

  // Aplica os filtros do formulario: lista e painel de trocas mudam juntos.
  const applyPendingFilters = (nextFilters: ScheduleFilters, nextAutoMode: boolean) => {
    const next = buildPendingFilters(nextFilters, nextAutoMode)
    setAppliedFilters(next)
    pending.applyFilters(next)
  }

  const handleFilter = (event: React.FormEvent) => {
    event.preventDefault()
    applyPendingFilters(filters, autoMode)
    window.scrollTo({ top: 0 })
  }

  // Trava a unidade na garagem do plantonista (mesmo se o perfil carregar
  // depois do primeiro render ou se o filtro tiver outra unidade salva).
  useEffect(() => {
    if (!canChooseUnit && availableUnits.length > 0 && !availableUnits.includes(filters.unit || '')) {
      const next = { ...filters, unit: availableUnits[0] }
      setFilters(next)
      applyPendingFilters(next, autoMode)
    }
  }, [canChooseUnit, availableUnits, filters.unit])

  useEffect(() => {
    swapsList.applyFilters({ unit: appliedFilters.unit, schedule_date: appliedFilters.schedule_date })
  }, [appliedFilters.unit, appliedFilters.schedule_date])

  // Tempo-real barato: a cada 2s checa a VERSAO da escala (um inteiro). So
  // recarrega o painel quando algo mudou de fato (por qualquer usuario) — uma
  // confirmacao/troca alheia aparece em ~2s, sem baixar a escala a cada ciclo.
  // A atualizacao e silenciosa (sem spinner; so re-renderiza se os dados mudarem).
  const lastVersionRef = useRef<number | null>(null)
  useEffect(() => {
    const tick = async () => {
      const v = await pending.fetchVersion()
      if (v == null) return
      if (lastVersionRef.current === null) {
        lastVersionRef.current = v
        return
      }
      if (v !== lastVersionRef.current) {
        lastVersionRef.current = v
        pending.refetch(appliedFilters, 0, { silent: true })
        swapsList.fetchSwaps({ unit: appliedFilters.unit, schedule_date: appliedFilters.schedule_date }, 0, { silent: true })
      }
    }
    const interval = window.setInterval(tick, 2000)
    return () => window.clearInterval(interval)
  }, [appliedFilters])

  // Tempo-real <1s via SSE (push direto do backend). Camada ADITIVA: se a
  // conexao cair, o polling de versao acima (~2s) cobre. O handler le sempre os
  // filtros mais recentes (ref), entao o stream nao reconecta a cada mudanca.
  const onStreamEventRef = useRef<(ev: { unit?: string | null; schedule_date?: string | null }) => void>(() => {})
  onStreamEventRef.current = (ev) => {
    if (ev.unit && appliedFilters.unit && ev.unit !== appliedFilters.unit) return
    if (ev.schedule_date && appliedFilters.schedule_date && ev.schedule_date !== appliedFilters.schedule_date) return
    pending.refetch(appliedFilters, 0, { silent: true })
    swapsList.fetchSwaps({ unit: appliedFilters.unit, schedule_date: appliedFilters.schedule_date }, 0, { silent: true })
  }
  useEffect(() => {
    const close = openScheduleStream((ev) => onStreamEventRef.current(ev))
    return close
  }, [])

  useEffect(() => {
    const t = window.setInterval(() => setTick(x => x + 1), 30000)
    return () => window.clearInterval(t)
  }, [])

  // Virada de dia (00:00 BRT): se o plantonista deixou o painel aberto e estava
  // vendo "hoje", rola para o novo dia. As linhas voltam a pendente (reset diario
  // que o cliente exige) para serem reconfirmadas. Se ele escolheu outra data no
  // filtro, respeita a escolha.
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const autoModeRef = useRef(autoMode)
  autoModeRef.current = autoMode
  const applyRef = useRef(applyPendingFilters)
  applyRef.current = applyPendingFilters
  const dayRef = useRef(currentOperationDate())
  useEffect(() => {
    const t = window.setInterval(() => {
      const d = currentOperationDate()
      if (d !== dayRef.current) {
        const wasToday = filtersRef.current.schedule_date === dayRef.current
        dayRef.current = d
        if (wasToday) {
          const next = { ...filtersRef.current, schedule_date: d }
          setFilters(next)
          applyRef.current(next, autoModeRef.current)
        }
      }
    }, 30000)
    return () => window.clearInterval(t)
  }, [])

  // Ao clicar "Confirmar": carrega as OUTRAS linhas pendentes do mesmo carro
  // (prefixo) que ainda vao comecar. Se houver mais de uma, abre o painel em
  // lote (pre-selecionadas); se for so esta, confirma direto (sem painel).
  const openConfirm = async (line: ScheduleLine) => {
    if (confirmLoadingId !== null) return // evita duplo toque no PWA
    setActionError(null)
    setActionMessage(null)
    setConfirmLoadingId(line.id)
    let related: ScheduleLine[] = []
    try {
      const res = await client.get<ScheduleLine[]>('/schedule/lines', {
        params: {
          schedule_date: appliedFilters.schedule_date,
          unit: line.unit,
          prefix_code: line.prefix_code,
          limit: 500,
        },
      })
      // Mesmo corte por horario do "Trocar": se a escala e de hoje, so as linhas
      // que ainda vao comecar. So pendentes (confirmar) e que operam hoje.
      const spDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date())
      const spTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date())
      const isToday = appliedFilters.schedule_date === spDate
      related = res.data.filter(item =>
        item.id !== line.id &&
        item.status === 'pendente' &&
        item.non_operating !== true &&
        (!isToday || (item.start_time || '') >= spTime),
      )
    } catch {
      // Nao conseguiu carregar as outras linhas -> confirma so esta (abaixo).
      related = []
    }

    if (related.length > 0) {
      // Carro com mais de uma linha -> abre o painel para confirmar em lote.
      setSwapOpenId(null)
      setEditingId(null)
      setRelatedLines(related)
      setSelectedRelatedIds(related.map(item => item.id)) // pre-seleciona todas
      setConfirmOpenId(line.id)
      setConfirmLoadingId(null)
      return
    }

    // Carro com uma unica linha -> confirma direto, sem abrir painel.
    try {
      await client.post(`/schedule/lines/${line.id}/confirm`)
      await pending.refetch(appliedFilters, 0, { fresh: true })
      await swapsList.fetchSwaps({ unit: appliedFilters.unit, schedule_date: appliedFilters.schedule_date }, 0)
      setActionMessage('Linha confirmada.')
    } catch (e: any) {
      setActionError(apiErrorMessage(e, 'Não foi possível confirmar a linha.'))
    } finally {
      setConfirmLoadingId(null)
    }
  }

  // Confirma a linha clicada + as demais linhas selecionadas do mesmo carro.
  // Todas as confirmadas somem do painel do dia.
  const handleConfirmMulti = async (line: ScheduleLine) => {
    if (confirmSaving) return // evita duplo toque no PWA
    setConfirmSaving(true)
    setActionError(null)
    setActionMessage(null)
    try {
      const toConfirm = [
        line,
        ...relatedLines.filter(item => selectedRelatedIds.includes(item.id)),
      ].filter(item => item.status !== 'confirmada')
      // Confirma uma a uma, contabilizando sucessos e falhas para reportar
      // resultado parcial (uma falha no meio nao "engole" as demais).
      let confirmed = 0
      const failures: string[] = []
      for (const item of toConfirm) {
        try {
          await client.post(`/schedule/lines/${item.id}/confirm`)
          confirmed++
        } catch (e: any) {
          failures.push(`linha ${item.line_code}: ${apiErrorMessage(e, 'erro ao confirmar')}`)
        }
      }
      await pending.refetch(appliedFilters, 0, { fresh: true })
      await swapsList.fetchSwaps({ unit: appliedFilters.unit, schedule_date: appliedFilters.schedule_date }, 0)
      setConfirmOpenId(null)
      setRelatedLines([])
      setSelectedRelatedIds([])
      if (failures.length === 0) {
        setActionMessage(`${plural(confirmed, 'linha confirmada', 'linhas confirmadas')}.`)
      } else {
        setActionError(`${confirmed} de ${toConfirm.length} linhas confirmadas; falha na ${failures.join('; falha na ')}`)
      }
    } finally {
      setConfirmSaving(false)
    }
  }

  const openSwap = async (line: ScheduleLine) => {
    setSwapOpenId(line.id)
    setConfirmOpenId(null)
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
          schedule_date: appliedFilters.schedule_date,
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
      const isToday = appliedFilters.schedule_date === spDate
      setRelatedLines(
        res.data.filter(item =>
          item.id !== line.id &&
          item.status !== 'cancelada' &&
          (!isToday || (item.start_time || '') >= spTime),
        ),
      )
    } catch (e: any) {
      setActionError(apiErrorMessage(e, 'Não foi possível carregar as outras linhas deste prefixo.'))
    } finally {
      setRelatedLoading(false)
    }
  }

  const handleCreateSwap = async (line: ScheduleLine) => {
    if (swapSaving) return // evita duplo toque no PWA (trocas duplicadas)
    if (!swapVehicle.trim() && !swapDriver.trim()) return
    setSwapSaving(true)
    setActionError(null)
    try {
      const linesToSwap = [
        line,
        ...relatedLines.filter(item => selectedRelatedIds.includes(item.id)),
      ]
      // Registra uma a uma, contabilizando sucessos e falhas para reportar
      // resultado parcial (uma falha no meio nao "engole" as demais).
      let registered = 0
      const failures: string[] = []
      for (const item of linesToSwap) {
        try {
          if (item.status !== 'confirmada') {
            await pending.confirmLine(item.id)
          }
          await swapsList.createSwap({
            schedule_line_id: item.id,
            schedule_date: appliedFilters.schedule_date,
            vehicle_out: item.prefix_code,
            vehicle_in: swapVehicle.trim() || undefined,
            driver_out: item.driver_name,
            driver_in: swapDriver.trim() || undefined,
            reason: swapReason || undefined,
            lines_covered: `${item.direction} - ${item.line_code}`,
          } as any)
          registered++
        } catch (e: any) {
          failures.push(`linha ${item.line_code}: ${apiErrorMessage(e, 'erro ao registrar a troca')}`)
        }
      }
      await pending.refetch(appliedFilters, 0, { fresh: true })
      if (registered > 0) {
        // Fecha o formulario mesmo com falha parcial, para o retry nao
        // duplicar as trocas que ja entraram.
        setSwapOpenId(null)
        setSwapVehicle('')
        setSwapDriver('')
        setSwapReason('')
        setRelatedLines([])
        setSelectedRelatedIds([])
      }
      if (failures.length === 0) {
        setActionMessage(`${plural(registered, 'troca registrada', 'trocas registradas')}! Copie o texto no painel lateral para enviar no WhatsApp.`)
      } else {
        setActionError(`${registered} de ${linesToSwap.length} trocas registradas; falha na ${failures.join('; falha na ')}`)
      }
    } finally {
      setSwapSaving(false)
    }
  }

  // Abre o modal "Nao operar" e busca a linha-par (ex.: a Saida da Entrada),
  // ja pre-selecionada — confirmando que as duas nao rodam hoje.
  const openNonOp = async (line: ScheduleLine) => {
    setNonOpLine(line)
    setNonOpPair([])
    setNonOpSelected([])
    setActionError(null)
    if (!appliedFilters.schedule_date) return
    setNonOpLoading(true)
    try {
      const pair = await pending.fetchPair(line.id, appliedFilters.schedule_date)
      const operable = pair.filter(item => item.non_operating !== true)
      setNonOpPair(operable)
      setNonOpSelected(operable.map(item => item.id))
    } catch {
      setNonOpPair([])
    } finally {
      setNonOpLoading(false)
    }
  }

  const confirmNonOp = async () => {
    if (!nonOpLine || !appliedFilters.schedule_date) return
    if (nonOpSaving) return // evita duplo toque no PWA
    setNonOpSaving(true)
    setActionError(null)
    try {
      await pending.setNonOperation(nonOpLine.id, appliedFilters.schedule_date, nonOpSelected)
      await pending.refetch(appliedFilters, 0, { fresh: true })
      const extra = nonOpSelected.length ? ` (+${nonOpSelected.length} linha-par)` : ''
      setActionMessage(`Linha ${nonOpLine.line_code} marcada para não operar hoje${extra}.`)
      setNonOpLine(null)
      setNonOpPair([])
      setNonOpSelected([])
    } catch (e: any) {
      setActionError(apiErrorMessage(e, 'Não foi possível marcar a linha.'))
    } finally {
      setNonOpSaving(false)
    }
  }

  const handleBackToOperate = async (line: ScheduleLine) => {
    if (!appliedFilters.schedule_date) return
    if (backToOperateId !== null) return // evita duplo toque no PWA
    setBackToOperateId(line.id)
    setActionError(null)
    try {
      await pending.clearNonOperation(line.id, appliedFilters.schedule_date)
      await pending.refetch(appliedFilters, 0, { fresh: true })
      setActionMessage(`Linha ${line.line_code} voltou a operar hoje.`)
    } catch (e: any) {
      setActionError(apiErrorMessage(e, 'Não foi possível reverter.'))
    } finally {
      setBackToOperateId(null)
    }
  }

  const openEdit = (line: ScheduleLine) => {
    setSwapOpenId(null)
    setConfirmOpenId(null)
    setEditingId(line.id)
    setEditForm(lineToForm(line))
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm(null)
  }

  const saveEdit = async (line: ScheduleLine) => {
    if (!editForm) return
    if (editSaving) return // evita duplo toque no PWA
    setEditSaving(true)
    setActionError(null)
    try {
      // Mantem o status atual (nao "vira" alterada nem some dos pendentes).
      await pending.updateLine(line.id, { ...editForm, status: line.status })
      await pending.refetch(appliedFilters, 0, { fresh: true })
      setEditingId(null)
      setEditForm(null)
      setActionMessage(`Linha ${line.line_code} atualizada.`)
    } catch (e: any) {
      setActionError(apiErrorMessage(e, 'Não foi possível salvar as alterações.'))
    } finally {
      setEditSaving(false)
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
      if (appliedFilters.unit) params.set('unit', appliedFilters.unit)
      if (appliedFilters.schedule_date) params.set('schedule_date', appliedFilters.schedule_date)
      if (sendWindowMinutes != null) params.set('window_minutes', String(sendWindowMinutes))
      const res = await client.get(`/swaps/whatsapp/text?${params}`)
      const text = res.data.text as string
      if (!text || res.data.total === 0) {
        setActionError(sendWindowMinutes != null ? 'Nenhuma troca deste horário para enviar.' : 'Nenhuma troca registrada para enviar.')
        return
      }
      // Nao depende de clipboard: abre o WhatsApp com o texto pre-preenchido.
      openWhatsApp(text)
    } catch (e: any) {
      setActionError(apiErrorMessage(e, 'Erro ao gerar texto de trocas.'))
    }
  }

  const handleCopyAllSwaps = async () => {
    setActionError(null)
    try {
      const params = new URLSearchParams()
      if (appliedFilters.unit) params.set('unit', appliedFilters.unit)
      if (appliedFilters.schedule_date) params.set('schedule_date', appliedFilters.schedule_date)
      if (sendWindowMinutes != null) params.set('window_minutes', String(sendWindowMinutes))
      const res = await client.get(`/swaps/whatsapp/text?${params}`)
      const text = res.data.text as string
      if (!text || res.data.total === 0) {
        setActionError(sendWindowMinutes != null ? 'Nenhuma troca deste horário para copiar.' : 'Nenhuma troca registrada para copiar.')
        return
      }
      const ok = await copyToClipboard(text)
      if (ok) {
        setActionMessage('Texto copiado! Cole no WhatsApp.')
      } else {
        // Fallback mobile: se nao deu para copiar, abre o WhatsApp com o texto.
        openWhatsApp(text)
      }
    } catch (e: any) {
      setActionError(apiErrorMessage(e, 'Erro ao gerar texto de trocas.'))
    }
  }

  // Fonte de verdade do DIA: o summary do /board (por unidade), que nao sofre
  // o corte do toggle "Proximas 2h" nem da paginacao. O banner so celebra
  // quando o dia inteiro esta sem pendentes — lista vazia pode ser apenas
  // efeito do filtro de 2h ou de um erro de carregamento. O backend devolve o
  // summary de TODAS as garagens do usuario; aqui recortamos a selecionada.
  const daySummary = appliedFilters.unit
    ? pending.summary.filter(s => s.unit === appliedFilters.unit)
    : pending.summary
  const summaryTotal = daySummary.reduce((acc, s) => acc + s.total, 0)
  const summaryPending = daySummary.reduce((acc, s) => acc + s.pending, 0)
  const allConfirmed = !lineSearch && !pending.loading && !pending.error && summaryTotal > 0 && summaryPending === 0

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
          className="card p-4 grid grid-cols-1 md:grid-cols-[160px_220px_170px_auto_auto] gap-3 items-end"
        >
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Data
            <input
              type="date"
              value={filters.schedule_date || ''}
              onChange={e => {
                // Data aplica na hora: lista e painel de trocas mudam juntos.
                const next = { ...filters, schedule_date: e.target.value }
                setFilters(next)
                applyPendingFilters(next, autoMode)
              }}
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
                // Mesmo shape da carga inicial (buildPendingFilters), senao o
                // toggle busca com filtros diferentes (fix 4088a3e).
                applyPendingFilters(filters, next)
                // A lista pode encolher de ~100 para poucos cards; se o usuario
                // estava rolado la embaixo, a tela visivel viraria um vazio branco.
                window.scrollTo({ top: 0 })
              }}
              className={`relative inline-flex h-10 w-16 items-center rounded-xl text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 ${autoMode ? 'bg-brand-700 dark:bg-brand-600 border-brand-700' : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600'} border`}
            >
              <span className={`absolute left-1 transition-all duration-200 ${autoMode ? 'translate-x-7' : 'translate-x-0'} inline-block w-6 h-6 rounded-lg bg-white shadow-xs`} />
              <span className={`pl-2 transition-opacity text-gray-600 ${autoMode ? 'opacity-0' : 'opacity-100'}`}>Não</span>
              <span className={`pl-1 transition-opacity text-white ${autoMode ? 'opacity-100' : 'opacity-0'}`}>Sim</span>
            </button>
          </label>
          <button type="submit" className="btn-primary self-end">
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
                {/* O botao envia as TROCAS registradas (nao um resumo de confirmacao). */}
                <p className="text-green-700 dark:text-green-400 text-sm">
                  {sendWindowMinutes != null ? 'Envie as trocas do turno pelo WhatsApp.' : 'Envie as trocas do dia pelo WhatsApp.'}
                </p>
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
          <section className="card">
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
                    {lineSearch ? plural(pending.total, 'resultado', 'resultados') : plural(pending.total, 'pendente', 'pendentes')}
                  </span>
                </div>
              ) : (
                <span className="rounded-full px-3 py-1 text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                  {lineSearch ? plural(pending.total, 'resultado', 'resultados') : plural(pending.total, 'pendente', 'pendentes')}
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

              {/* A pagina traz ate 500 linhas; acima disso avisa que ha mais. */}
              {!pending.loading && pending.total > pending.lines.length && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                  Mostrando {pending.lines.length} de {pending.total} linhas — use os filtros para refinar.
                </p>
              )}

              {pending.lines.map(line => {
                const mins = minutesUntilStart(line.start_time, appliedFilters.schedule_date)
                const urgency = getUrgency(mins)
                const countdown = countdownLabel(mins)
                return (
                <article
                  key={line.id}
                  className={`border ${urgency.card} rounded-2xl p-4 hover:shadow-card-md transition-shadow bg-gray-50/50 dark:bg-gray-700/30`}
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
                    {line.non_operating && (
                      <span className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                        <Ban size={13} />
                        Não opera hoje
                      </span>
                    )}
                    {/* Status visivel no modo busca (a lista padrao so traz pendentes). */}
                    {line.status === 'cancelada' && (
                      <span className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                        <X size={13} />
                        Cancelada
                      </span>
                    )}
                    {line.status === 'confirmada' && (
                      <span className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                        <CheckCircle2 size={13} />
                        Confirmada
                      </span>
                    )}
                    {line.status === 'alterada' && (
                      <span className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                        <ArrowLeftRight size={13} />
                        Alterada
                      </span>
                    )}
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
                  {editingId === line.id && editForm ? (
                    /* Edição inline (estilo ADM) */
                    <div className="mt-1 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-400/60 dark:border-blue-500/40 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Pencil size={14} className="text-blue-600 dark:text-blue-400" />
                        <p className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                          Editar linha {line.line_code}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="time"
                          value={editForm.start_time}
                          onChange={e => setEditForm(f => f && { ...f, start_time: e.target.value })}
                          className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
                        />
                        <input
                          type="time"
                          value={editForm.end_time}
                          onChange={e => setEditForm(f => f && { ...f, end_time: e.target.value })}
                          className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
                        />
                        <input
                          value={editForm.prefix_code}
                          onChange={e => setEditForm(f => f && { ...f, prefix_code: e.target.value })}
                          placeholder="Prefixo"
                          className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
                        />
                        <input
                          value={editForm.line_code}
                          onChange={e => setEditForm(f => f && { ...f, line_code: e.target.value })}
                          placeholder="Linha"
                          className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
                        />
                        <select
                          value={editForm.direction}
                          onChange={e => setEditForm(f => f && { ...f, direction: e.target.value })}
                          className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
                        >
                          <option value="ENTRADA">ENTRADA</option>
                          <option value="SAIDA">SAIDA</option>
                        </select>
                        <input
                          value={editForm.client_name}
                          onChange={e => setEditForm(f => f && { ...f, client_name: e.target.value })}
                          placeholder="Cliente"
                          className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
                        />
                        <input
                          value={editForm.driver_name}
                          onChange={e => setEditForm(f => f && { ...f, driver_name: e.target.value })}
                          placeholder="Motorista"
                          className="col-span-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
                        />
                        <input
                          value={editForm.route_name}
                          onChange={e => setEditForm(f => f && { ...f, route_name: e.target.value })}
                          placeholder="Rota"
                          className="col-span-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(line)}
                          disabled={editSaving}
                          className="flex-1 bg-brand-700 hover:bg-brand-800 dark:bg-brand-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                        >
                          {editSaving ? 'Salvando...' : 'Salvar alterações'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 px-3 py-2.5 rounded-xl text-sm transition-all"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  ) : confirmOpenId === line.id ? (
                    /* Confirmacao em lote — demais linhas do mesmo carro */
                    <div className="mt-1 bg-green-50 dark:bg-green-900/20 border-2 border-green-500/60 dark:border-green-500/40 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 size={14} className="text-green-600 dark:text-green-400" />
                        <p className="text-xs font-bold text-green-700 dark:text-green-300 uppercase tracking-wide">
                          Confirmar carro — prefixo {line.prefix_code}
                        </p>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-300">
                        Confirme de uma vez as linhas que este carro vai realizar. As confirmadas somem do painel.
                      </p>
                      <div className="rounded-xl border border-green-200 dark:border-green-800 bg-white/70 dark:bg-gray-800/60 p-3">
                        <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-green-800 dark:text-green-300">
                          <input type="checkbox" checked disabled />
                          <span className="font-mono">L - {line.line_code}</span>
                          <span>{line.direction}</span>
                          <span>{line.start_time} - {line.end_time}</span>
                          <span className="text-green-600 dark:text-green-400">(esta)</span>
                        </label>
                        <p className="mt-2 mb-1 text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">
                          Outras linhas deste carro
                        </p>
                        {relatedLoading && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">Carregando sequência...</p>
                        )}
                        {!relatedLoading && relatedLines.length === 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Nenhuma outra linha pendente deste carro.
                          </p>
                        )}
                        {!relatedLoading && relatedLines.length > 0 && (
                          <div className="space-y-1.5">
                            {relatedLines.map(item => (
                              <label
                                key={item.id}
                                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-green-100/70 dark:hover:bg-green-900/20"
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
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConfirmMulti(line)}
                          disabled={confirmSaving}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-green-700 hover:bg-green-800 dark:bg-green-700 dark:hover:bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 whitespace-nowrap"
                        >
                          <CheckCircle2 size={15} />
                          {confirmSaving ? 'Confirmando...' : `Confirmar ${plural(1 + selectedRelatedIds.length, 'linha', 'linhas')}`}
                        </button>
                        <button
                          onClick={() => setConfirmOpenId(null)}
                          className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 px-3 py-2.5 rounded-xl text-sm transition-all"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  ) : swapOpenId !== line.id ? (
                    <div className="flex gap-2">
                      {line.non_operating ? (
                        <button
                          onClick={() => handleBackToOperate(line)}
                          disabled={backToOperateId === line.id}
                          className="flex-1 flex items-center justify-center gap-1.5 border-2 border-green-500 text-green-700 dark:text-green-400 dark:border-green-600 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-green-50 dark:hover:bg-green-900/20 transition-all disabled:opacity-60"
                          title="Desfazer: a linha volta a operar hoje"
                        >
                          <RotateCcw size={15} />
                          {backToOperateId === line.id ? 'Revertendo...' : 'Voltar a operar hoje'}
                        </button>
                      ) : (
                        <>
                          {line.status !== 'confirmada' && line.status !== 'cancelada' && (
                            <button
                              onClick={() => openConfirm(line)}
                              disabled={confirmLoadingId === line.id}
                              className="flex-1 flex items-center justify-center gap-1.5 bg-green-700 hover:bg-green-800 dark:bg-green-700 dark:hover:bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
                            >
                              <CheckCircle2 size={15} />
                              {confirmLoadingId === line.id ? 'Confirmando...' : 'Confirmar'}
                            </button>
                          )}
                          <button
                            onClick={() => openSwap(line)}
                            className="flex-1 flex items-center justify-center gap-1.5 border-2 border-accent-500 text-accent-600 dark:text-accent-400 dark:border-accent-500 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-accent-50 dark:hover:bg-accent-900/20 transition-all"
                          >
                            <ArrowLeftRight size={15} />
                            {line.status === 'confirmada' ? 'Trocar novamente' : 'Trocar'}
                          </button>
                          {canEditLine && (
                            <button
                              onClick={() => openEdit(line)}
                              className="flex items-center justify-center border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 px-3 py-2.5 rounded-xl text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                              title="Editar a linha"
                            >
                              <Pencil size={15} />
                            </button>
                          )}
                          {canCancelLine && (
                            <button
                              onClick={() => openNonOp(line)}
                              className="flex items-center justify-center border border-red-200 dark:border-red-800 text-red-500 dark:text-red-400 px-3 py-2.5 rounded-xl text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                              title="Não operar hoje (não vai rodar)"
                            >
                              <Ban size={15} />
                            </button>
                          )}
                        </>
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
                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Carregando sequência...</p>
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
                                <span className="text-gray-400 dark:text-gray-500">{scheduleStatusLabel(item.status)}</span>
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
          <aside className="card">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <ArrowLeftRight size={16} className="text-brand-600 dark:text-brand-400" />
                Trocas registradas
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {sendWindowMinutes != null
                  ? 'O envio traz só as trocas do turno atual (linhas por volta de agora).'
                  : 'O envio traz todas as trocas do dia.'}
              </p>
              {swapsList.swaps.length > 0 && (
                <button
                  onClick={handleCopyAllSwaps}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                >
                  <MessageCircle size={12} />
                  {sendWindowMinutes != null ? 'Copiar trocas do turno (WhatsApp)' : 'Copiar todas as trocas (WhatsApp)'}
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
                      {parseApiDate(swap.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
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

        {/* Modal "Não operar" (por dia, com par Entrada/Saída) */}
        {nonOpLine && (
          <div className="modal-overlay">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-modal w-full max-w-md overflow-hidden">
              {/* Modal header */}
              <div className="bg-red-600 dark:bg-red-700 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <Ban size={18} />
                  <h2 className="text-base font-bold">Não operar</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setNonOpLine(null)}
                  className="text-red-200 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal body */}
              <div className="p-6">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-2">
                  <Bus size={14} className="shrink-0 text-brand-500" />
                  Linha {nonOpLine.line_code} · {nonOpLine.direction} · Prefixo {nonOpLine.prefix_code}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  Confirme que esta linha <strong>não vai rodar apenas hoje</strong>
                  {appliedFilters.schedule_date ? ` (${appliedFilters.schedule_date.split('-').reverse().join('/')})` : ''}.
                  Ela sai do painel e volta sozinha como pendente no próximo dia.
                </p>

                {/* Linha-par (Entrada/Saída) */}
                {nonOpLoading ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Buscando a linha-par (Entrada/Saída)...</p>
                ) : nonOpPair.length > 0 ? (
                  <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/10 p-3 mb-5">
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide mb-2">
                      Marcar também a linha-par
                    </p>
                    <div className="space-y-1.5">
                      {nonOpPair.map(item => (
                        <label
                          key={item.id}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-red-100/70 dark:hover:bg-red-900/20"
                        >
                          <input
                            type="checkbox"
                            checked={nonOpSelected.includes(item.id)}
                            onChange={e => {
                              setNonOpSelected(prev =>
                                e.target.checked
                                  ? [...prev, item.id]
                                  : prev.filter(id => id !== item.id),
                              )
                            }}
                          />
                          <span className="font-mono font-semibold">L - {item.line_code}</span>
                          <span className="font-semibold">{item.direction}</span>
                          <span>{item.start_time} - {item.end_time}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">
                    Sem outra linha-par (Entrada/Saída) para marcar junto.
                  </p>
                )}

                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setNonOpLine(null)}
                    className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl px-4 py-2.5 text-sm font-medium transition-all"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={confirmNonOp}
                    disabled={nonOpSaving}
                    className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-all disabled:opacity-50"
                  >
                    {nonOpSaving ? 'Salvando...' : 'Confirmar não operar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
