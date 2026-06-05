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
  baixa: 'bg-gray-100 text-gray-600',
  media: 'bg-yellow-100 text-yellow-700',
  alta: 'bg-orange-100 text-orange-700',
  urgente: 'bg-red-100 text-red-700',
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
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
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
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {['ID', 'Prefixo', 'Tipo', 'Descrição', 'Unidade', 'Prioridade', 'Encaminhado em', 'Motivo'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((r) => (
                <tr key={r.id} className="bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-gray-500">#{r.id}</td>
                  <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-300">{r.prefix_code}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.incident_type}</td>
                  <td className="px-4 py-3 max-w-xs truncate text-gray-500">{r.description || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.unit || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_COLOR[r.sst_forward_priority] || 'bg-gray-100 text-gray-600'}`}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-900">
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
              <button onClick={() => setShowForward(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400">
                Cancelar
              </button>
              <button onClick={handleForward} disabled={saving || !forwardReason}
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
                {saving ? 'Encaminhando...' : 'Encaminhar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
