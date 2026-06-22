import { useCallback, useEffect, useRef, useState } from 'react'
import api, { apiErrorMessage } from '../api/client'

export interface ScheduleLine {
  id: number
  schedule_date: string
  unit: string
  prefix_code: string
  driver_name: string
  line_code: string
  direction: string
  client_name: string
  route_name?: string
  start_time: string
  end_time: string
  status: 'pendente' | 'confirmada' | 'alterada' | 'cancelada'
  // is_active=false: desativada por periodo (ADM). non_operating: nao opera hoje.
  is_active?: boolean
  non_operating?: boolean
  confirmed_by?: number
  confirmed_at?: string
}

export interface ScheduleSummary {
  unit: string
  total: number
  entrada: number
  saida: number
  pending: number
  confirmed: number
  changed: number
  cancelled: number
}

export interface ScheduleImportResult {
  imported: number
  replaced: boolean
  schedule_date: string
}

export interface ScheduleImportPreview {
  total: number
  units: { unit: string; total: number }[]
  clients: { client_name: string; total: number }[]
  warnings: string[]
}

export interface ScheduleFilters {
  schedule_date?: string
  unit?: string
  client_name?: string
  line_code?: string
  driver_name?: string
  prefix_code?: string
  status?: string
  start_in_minutes?: string
  include_inactive?: string
  hide_non_operating?: string
}

const PAGE_SIZE = 100

export function useSchedule(initialFilters: ScheduleFilters = {}) {
  const [lines, setLines] = useState<ScheduleLine[]>([])
  const [summary, setSummary] = useState<ScheduleSummary[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState(initialFilters)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<ScheduleImportPreview | null>(null)
  // Sequenciador de requisicoes (last-write-wins): com o auto-refresh de 8s da
  // tela de confirmacao, varias chamadas de fetchSchedule ficam em voo ao mesmo
  // tempo. Sem isso, uma resposta antiga (linha ainda pendente) pode chegar
  // depois da nova (linha ja confirmada) e sobrescrever a lista, fazendo a
  // linha confirmada "voltar". Aqui so a requisicao mais recente aplica o estado.
  const requestSeq = useRef(0)

  const paramsFrom = (f: ScheduleFilters, skip = 0) => {
    const params: Record<string, string> = { skip: String(skip), limit: String(PAGE_SIZE) }
    Object.entries(f).forEach(([key, value]) => {
      if (value) params[key] = value
    })
    return params
  }

  // silent: atualizacao "fantasma" — nao liga o loading e so troca o estado
  // se os dados realmente mudaram (evita a lista tremer no auto-refresh).
  const fetchSchedule = useCallback(async (
    f = filters,
    skip = page * PAGE_SIZE,
    opts: { silent?: boolean } = {},
  ) => {
    const { silent = false } = opts
    const seq = ++requestSeq.current
    if (!silent) setLoading(true)
    setError(null)
    try {
      const params = paramsFrom(f, skip)
      const summaryParams = f.schedule_date ? { schedule_date: f.schedule_date } : {}
      const [listRes, countRes, summaryRes] = await Promise.all([
        api.get('/schedule/lines', { params }),
        api.get('/schedule/lines/count', { params: paramsFrom(f, 0) }),
        api.get('/schedule/summary', { params: summaryParams }),
      ])
      // Resposta obsoleta: outra requisicao mais recente ja foi disparada.
      // Ignora para nao "ressuscitar" uma linha que ja foi confirmada.
      if (seq !== requestSeq.current) return
      setLines(prev => JSON.stringify(prev) === JSON.stringify(listRes.data) ? prev : listRes.data)
      setTotal(prev => prev === countRes.data.total ? prev : countRes.data.total)
      setSummary(prev => JSON.stringify(prev) === JSON.stringify(summaryRes.data) ? prev : summaryRes.data)
    } catch (err: any) {
      if (!silent && seq === requestSeq.current) setError(apiErrorMessage(err, 'Erro ao carregar escala'))
    } finally {
      if (!silent && seq === requestSeq.current) setLoading(false)
    }
  }, [filters, page])

  const applyFilters = (next: ScheduleFilters) => {
    setFilters(next)
    setPage(0)
  }

  const importSchedule = async (file: File, scheduleDate: string, replace: boolean) => {
    setImporting(true)
    setError(null)
    setImportMessage(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post<ScheduleImportResult>('/schedule/import', form, {
        params: { schedule_date: scheduleDate, replace },
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setImportMessage(`${res.data.imported} linhas importadas para ${res.data.schedule_date}`)
      const nextFilters = { ...filters, schedule_date: scheduleDate }
      setFilters(nextFilters)
      setPage(0)
      await fetchSchedule(nextFilters, 0)
      return res.data
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setError(detail || 'Erro ao importar escala. Confira se o arquivo e uma planilha .xlsx no modelo esperado.')
      return null
    } finally {
      setImporting(false)
    }
  }

  const previewImport = async (file: File) => {
    setPreviewing(true)
    setError(null)
    setImportMessage(null)
    setImportPreview(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post<ScheduleImportPreview>('/schedule/import/preview', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setImportPreview(res.data)
      return res.data
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setError(detail || 'Erro ao gerar previa da escala.')
      return null
    } finally {
      setPreviewing(false)
    }
  }

  const confirmLine = async (id: number) => {
    const res = await api.post<ScheduleLine>(`/schedule/lines/${id}/confirm`)
    setLines(prev => prev.map(line => line.id === id ? res.data : line))
    await fetchSchedule(filters, page * PAGE_SIZE)
    return res.data
  }

  const undoConfirmLine = async (id: number, reason?: string) => {
    const res = await api.post<ScheduleLine>(`/schedule/lines/${id}/undo-confirm`, { reason })
    await fetchSchedule(filters, page * PAGE_SIZE)
    return res.data
  }

  const cancelLine = async (id: number, reason?: string) => {
    const res = await api.post<ScheduleLine>(`/schedule/lines/${id}/cancel`, { reason })
    await fetchSchedule(filters, page * PAGE_SIZE)
    return res.data
  }

  // Desativar/Reativar por periodo (ADM). Nao refazem o fetch sozinhos: quem
  // chama decide com quais filtros recarregar (ex.: a aba ADM vs. o painel).
  const deactivateLine = async (id: number) => {
    const res = await api.post<ScheduleLine>(`/schedule/lines/${id}/deactivate`)
    return res.data
  }

  const reactivateLine = async (id: number) => {
    const res = await api.post<ScheduleLine>(`/schedule/lines/${id}/reactivate`)
    return res.data
  }

  // "Nao operar" por dia. alsoLineIds = linhas-par (ex.: a Saida) que tambem
  // nao vao rodar naquele dia.
  const setNonOperation = async (id: number, operationDate: string, alsoLineIds: number[] = []) => {
    const res = await api.post(`/schedule/lines/${id}/non-operation`, {
      operation_date: operationDate,
      also_line_ids: alsoLineIds,
    })
    return res.data
  }

  const clearNonOperation = async (id: number, operationDate: string) => {
    await api.delete(`/schedule/lines/${id}/non-operation`, {
      params: { operation_date: operationDate },
    })
  }

  // Linhas-par (mesma linha + unidade) para o modal de "Nao operar".
  const fetchPair = async (id: number, operationDate: string) => {
    const res = await api.get<ScheduleLine[]>(`/schedule/lines/${id}/pair`, {
      params: { operation_date: operationDate },
    })
    return res.data
  }

  const updateLine = async (id: number, payload: Record<string, unknown>) => {
    const res = await api.patch<ScheduleLine>(`/schedule/lines/${id}`, payload)
    return res.data
  }

  const fetchWhatsappText = useCallback(async (scheduleDate: string, unit: string, onlyChanges = false) => {
    const res = await api.get<{ text: string; total: number }>('/schedule/whatsapp', {
      params: { schedule_date: scheduleDate, unit, only_changes: onlyChanges },
    })
    return res.data
  }, [])

  useEffect(() => {
    fetchSchedule(filters, page * PAGE_SIZE)
  }, [filters, page])

  return {
    lines,
    summary,
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
    loading,
    importing,
    previewing,
    error,
    importMessage,
    importPreview,
    filters,
    setPage,
    applyFilters,
    previewImport,
    importSchedule,
    confirmLine,
    undoConfirmLine,
    cancelLine,
    deactivateLine,
    reactivateLine,
    setNonOperation,
    clearNonOperation,
    fetchPair,
    updateLine,
    fetchWhatsappText,
    refetch: fetchSchedule,
  }
}
