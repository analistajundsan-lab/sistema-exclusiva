import { useCallback, useEffect, useState } from 'react'
import api from '../api/client'

export interface AuditLog {
  id: number
  user_id: number
  action: string
  resource: string
  resource_id?: number
  details?: string
  deleted_at?: string | null
  deleted_by?: number | null
  created_at: string
}

export interface AuditFilters {
  resource?: string
  resource_id?: number
  action?: string
  include_deleted?: boolean
}

const PAGE_SIZE = 50

export function useAudit(initialFilters: AuditFilters = {}) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState(initialFilters)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const buildParams = (f: AuditFilters, skip: number) => {
    const params: Record<string, string> = { skip: String(skip), limit: String(PAGE_SIZE) }
    if (f.resource) params.resource = f.resource
    if (f.resource_id) params.resource_id = String(f.resource_id)
    if (f.action) params.action = f.action
    if (f.include_deleted) params.include_deleted = 'true'
    return params
  }

  const fetchLogs = useCallback(async (f = filters, skip = page * PAGE_SIZE) => {
    setLoading(true)
    setError(null)
    try {
      const params = buildParams(f, skip)
      const [listRes, countRes] = await Promise.all([
        api.get('/audit/logs', { params }),
        api.get('/audit/logs/count', { params: buildParams(f, 0) }),
      ])
      setLogs(listRes.data)
      setTotal(countRes.data.total)
    } catch {
      setError('Erro ao carregar auditoria')
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  const applyFilters = (next: AuditFilters) => {
    setFilters(next)
    setPage(0)
  }

  useEffect(() => {
    fetchLogs(filters, page * PAGE_SIZE)
  }, [filters, page])

  return {
    logs,
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
    loading,
    error,
    filters,
    setPage,
    applyFilters,
    refetch: fetchLogs,
  }
}
