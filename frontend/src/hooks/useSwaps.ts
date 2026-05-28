import { useState, useEffect, useCallback } from 'react'
import api from '../api/client'

export interface Swap {
  id: number
  schedule_line_id?: number
  schedule_date?: string
  unit?: string
  client_name?: string
  vehicle_out: string
  vehicle_in?: string
  driver_out?: string
  driver_in?: string
  reason?: string
  lines_covered?: string
  whatsapp_text?: string
  created_by: number
  created_at: string
}

export interface SwapFilters {
  vehicle_out?: string
  vehicle_in?: string
  unit?: string
  schedule_line_id?: number
}

const PAGE_SIZE = 20

export function useSwaps(initialFilters?: SwapFilters) {
  const [swaps, setSwaps] = useState<Swap[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState<SwapFilters>(initialFilters || {})

  const buildParams = (f: SwapFilters, skip: number) => {
    const p: Record<string, string> = { skip: String(skip), limit: String(PAGE_SIZE) }
    if (f.vehicle_out) p.vehicle_out = f.vehicle_out
    if (f.vehicle_in) p.vehicle_in = f.vehicle_in
    if (f.unit) p.unit = f.unit
    if (f.schedule_line_id) p.schedule_line_id = String(f.schedule_line_id)
    return p
  }

  const fetchSwaps = useCallback(async (f = filters, skip = page * PAGE_SIZE) => {
    setLoading(true)
    setError(null)
    try {
      const params = buildParams(f, skip)
      const [listRes, countRes] = await Promise.all([
        api.get('/swaps/', { params }),
        api.get('/swaps/count', { params: { ...params, skip: undefined, limit: undefined } }),
      ])
      setSwaps(listRes.data)
      setTotal(countRes.data.total)
    } catch {
      setError('Erro ao carregar trocas')
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  const applyFilters = (f: SwapFilters) => {
    setFilters(f)
    setPage(0)
  }

  const createSwap = async (data: Omit<Swap, 'id' | 'created_by' | 'created_at'>) => {
    const res = await api.post('/swaps/', data)
    await fetchSwaps(filters, 0)
    return res.data
  }

  const updateSwap = async (id: number, data: Partial<Swap>) => {
    const res = await api.put(`/swaps/${id}`, data)
    setSwaps(prev => prev.map(s => s.id === id ? res.data : s))
    return res.data
  }

  const deleteSwap = async (id: number) => {
    await api.delete(`/swaps/${id}`)
    await fetchSwaps(filters, page * PAGE_SIZE)
  }

  useEffect(() => {
    fetchSwaps(filters, page * PAGE_SIZE)
  }, [page, filters])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return {
    swaps, loading, error, total, page, totalPages, PAGE_SIZE,
    setPage, applyFilters, filters,
    fetchSwaps, createSwap, updateSwap, deleteSwap
  }
}
