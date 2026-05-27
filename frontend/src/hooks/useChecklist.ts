import { useState } from 'react'
import api from '../api/client'

export interface ChecklistData {
  id: number
  auditor_id: number
  auditor_name: string
  garagem: string
  prefixo: string
  tipo: string
  camera_frontal?: string
  camera_lateral_esq?: string
  camera_lateral_dir?: string
  camera_fadiga?: string
  camera_ip_motorista?: string
  camera_salao?: string
  tem_leitor_embarque?: boolean
  ar_condicionado?: boolean
  licenciamento?: string[]
  licenciamento_outro?: string
  checklist_colocado?: string[]
  cartao_artesp?: string
  qr_code?: boolean
  adesivo_leitor?: boolean
  placa_senha_wifi?: boolean
  wifi_status?: string[]
  wifi_outro?: string
  crlv_emtu?: string
  crlv_emtu_qrcode?: boolean
  artesp_doc?: string
  emdec_doc?: string
  observacoes?: string
  evidencias?: string[]
  created_at: string
}

export function useChecklist() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createChecklist = async (data: Omit<ChecklistData, 'id' | 'auditor_id' | 'auditor_name' | 'created_at'>) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.post('/checklist/', data)
      return res.data as ChecklistData
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Erro ao salvar checklist.'
      setError(msg)
      throw e
    } finally {
      setLoading(false)
    }
  }

  const listChecklists = async (params?: {
    prefixo?: string
    garagem?: string
    tipo?: string
    data_inicio?: string
    data_fim?: string
    skip?: number
    limit?: number
  }) => {
    const res = await api.get('/checklist/', { params })
    return res.data as ChecklistData[]
  }

  const getChecklist = async (id: number) => {
    const res = await api.get(`/checklist/${id}`)
    return res.data as ChecklistData
  }

  return { createChecklist, listChecklists, getChecklist, loading, error }
}
