import { useState, useEffect, useCallback } from 'react'
import api, { apiErrorMessage } from '../api/client'

export type IncidentStatus = 'aberto' | 'em_andamento' | 'fechado'

export interface Incident {
  id: number
  prefix_code: string
  incident_type: string
  description?: string
  line?: string
  direction?: string
  victim_status?: string
  replacement_prefix?: string
  unit?: string
  status: IncidentStatus
  created_by: number
  created_at: string
}

export interface IncidentFilters {
  prefix_code?: string
  line?: string
  incident_type?: string
  status?: IncidentStatus | ''
}

const PAGE_SIZE = 20

export function useIncidents(initialFilters?: IncidentFilters) {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState<IncidentFilters>(initialFilters || {})

  const buildParams = (f: IncidentFilters, skip: number) => {
    const p: Record<string, string> = { skip: String(skip), limit: String(PAGE_SIZE), today: 'true' }
    if (f.prefix_code) p.prefix_code = f.prefix_code
    if (f.line) p.line = f.line
    if (f.incident_type) p.incident_type = f.incident_type
    return p
  }

  const fetchIncidents = useCallback(async (f = filters, skip = page * PAGE_SIZE, silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const params = buildParams(f, skip)
      const [listRes, countRes] = await Promise.all([
        api.get('/incidents/', { params }),
        api.get('/incidents/count', { params: { ...params, skip: undefined, limit: undefined } }),
      ])
      setIncidents(listRes.data)
      setTotal(countRes.data.total)
    } catch (err: any) {
      if (!silent) setError(apiErrorMessage(err, 'Erro ao carregar ocorrencias'))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [filters, page])

  const applyFilters = (f: IncidentFilters) => {
    setFilters(f)
    setPage(0)
  }

  const createIncident = async (data: Omit<Incident, 'id' | 'created_by' | 'created_at'>) => {
    const res = await api.post('/incidents/', data)
    await fetchIncidents(filters, 0)
    return res.data
  }

  const updateIncident = async (id: number, data: Partial<Incident>) => {
    const res = await api.put(`/incidents/${id}`, data)
    setIncidents(prev => prev.map(i => i.id === id ? res.data : i))
    return res.data
  }

  const deleteIncident = async (id: number) => {
    await api.delete(`/incidents/${id}`)
    await fetchIncidents(filters, page * PAGE_SIZE)
  }

  useEffect(() => {
    fetchIncidents(filters, page * PAGE_SIZE)
  }, [page, filters])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return {
    incidents, loading, error, total, page, totalPages, PAGE_SIZE,
    setPage, applyFilters, filters,
    fetchIncidents, createIncident, updateIncident, deleteIncident
  }
}
