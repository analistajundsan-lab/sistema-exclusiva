import { useCallback, useEffect, useState } from 'react'
import api from '../api/client'

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

  const paramsFrom = (f: ScheduleFilters, skip = 0) => {
    const params: Record<string, string> = { skip: String(skip), limit: String(PAGE_SIZE) }
    Object.entries(f).forEach(([key, value]) => {
      if (value) params[key] = value
    })
    return params
  }

  const fetchSchedule = useCallback(async (f = filters, skip = page * PAGE_SIZE) => {
    setLoading(true)
    setError(null)
    try {
      const params = paramsFrom(f, skip)
      const summaryParams = f.schedule_date ? { schedule_date: f.schedule_date } : {}
      const [listRes, countRes, summaryRes] = await Promise.all([
        api.get('/schedule/lines', { params }),
        api.get('/schedule/lines/count', { params: paramsFrom(f, 0) }),
        api.get('/schedule/summary', { params: summaryParams }),
      ])
      setLines(listRes.data)
      setTotal(countRes.data.total)
      setSummary(summaryRes.data)
    } catch {
      setError('Erro ao carregar escala')
    } finally {
      setLoading(false)
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
    fetchWhatsappText,
    refetch: fetchSchedule,
  }
}
