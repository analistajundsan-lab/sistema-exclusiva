import { useEffect, useState } from 'react'
import { ClipboardList, X } from 'lucide-react'
import { Layout } from '../components/Layout'
import {
  encaminharParaSST,
  listOcorrenciasSST,
  OcorrenciaSST,
} from '../hooks/useSST'
import { useAuthStore } from '../store/auth'

const PRIORITY_LABEL: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
}

const PRIORITY_COLOR: Record<string, string> = {
  baixa: 'badge-gray',
  media: 'badge-yellow',
  alta: 'badge-accent',
  urgente: 'badge-red',
}

export function SSTOcorrencias() {
  const role = useAuthStore((s) => s.role)
  const [rows, setRows] = useState<OcorrenciaSST[]>([])
  const [loading, setLoading] = useState(true)
  const [filterPriority, setFilterPriority] = useState('')
  const [showForward, setShowForward] = useState<number | null>(null)
  const [forwardReason, setForwardReason] = useState('')
  const [forwardPriority, setForwardPriority] = useState('media')
  const [saving, setSaving] = useState(false)

  const canForward = ['admin', 'gerente', 'supervisao'].includes(role || '')

  const load = async () => {
    const params: Record<string, unknown> = {}
    if (filterPriority) params.priority = filterPriority
    const data = await listOcorrenciasSST(params)
    setRows(data)
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [filterPriority])

  const handleForward = async () => {
    if (!showForward || !forwardReason) return
    setSaving(true)
    try {
      await encaminharParaSST(showForward, forwardReason, forwardPriority)
      setShowForward(null)
      setForwardReason('')
      await load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            <ClipboardList size={24} className="text-brand-700 dark:text-brand-400" />
            Ocorrências SST
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Ocorrências encaminhadas para análise SST
          </p>
        </div>
      </div>

      <div className="mb-4">
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="select w-full sm:w-64"
        >
          <option value="">Todas as prioridades</option>
          {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-20 text-center text-gray-400">Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="py-20 text-center text-gray-400">Nenhuma ocorrência encaminhada para SST</div>
      ) : (
        <div className="table-wrapper">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                {['ID', 'Prefixo', 'Tipo', 'Descrição', 'Unidade', 'Prioridade', 'Encaminhado em', 'Motivo'].map((h) => (
                  <th key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-gray-500">#{r.id}</td>
                  <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-300">{r.prefix_code}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.incident_type}</td>
                  <td className="px-4 py-3 max-w-xs truncate text-gray-500">{r.description || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.unit || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={PRIORITY_COLOR[r.sst_forward_priority] || 'badge-gray'}>
                      {PRIORITY_LABEL[r.sst_forward_priority] || r.sst_forward_priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(r.sst_forwarded_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate text-gray-500">{r.sst_forward_reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de encaminhar (Gerente/Coord pode encaminhar a partir das Ocorrências gerais) */}
      {showForward && canForward && (
        <div className="modal-overlay">
          <div className="modal-box p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Encaminhar para SST</h2>
              <button onClick={() => setShowForward(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-500">Motivo *</span>
                <textarea
                  value={forwardReason}
                  onChange={(e) => setForwardReason(e.target.value)}
                  rows={3}
                  className="input w-full mt-1 resize-none"
                  placeholder="Descreva o motivo do encaminhamento..."
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-500">Prioridade</span>
                <select value={forwardPriority} onChange={(e) => setForwardPriority(e.target.value)}
                  className="input w-full mt-1">
                  {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setShowForward(null)} className="btn-secondary">
                Cancelar
              </button>
              <button onClick={handleForward} disabled={saving || !forwardReason} className="btn-primary">
                {saving ? 'Encaminhando...' : 'Encaminhar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
