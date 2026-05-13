import { useState } from 'react'
import { Layout } from '../components/Layout'
import { useIncidents } from '../hooks/useIncidents'

export function Incidents() {
  const { incidents, loading, error, total, page, totalPages, setPage, createIncident } = useIncidents()
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ prefix_code: '', incident_type: '', line: '', direction: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const handle = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.prefix_code || !form.incident_type) {
      setFormError('Preencha prefixo e tipo.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await createIncident({ ...form, status: 'aberto' } as any)
      setModal(false)
      setForm({ prefix_code: '', incident_type: '', line: '', direction: '', description: '' })
    } catch (e: any) {
      setFormError(e?.response?.data?.detail || 'Erro ao registrar ocorrência.')
    } finally {
      setSaving(false)
    }
  }

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Ocorrências</h1>
          <p className="text-sm text-gray-500 capitalize">{today}</p>
        </div>
        <button onClick={() => setModal(true)}
          className="bg-brand-700 text-white px-4 py-2 rounded text-sm hover:bg-brand-800">
          + Registrar Ocorrência
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-3 bg-red-50 p-3 rounded">{error}</p>}

      {loading ? (
        <p className="text-gray-500 py-8 text-center">Carregando...</p>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex justify-between items-center">
            <span className="text-sm text-gray-600">{total} ocorrência{total !== 1 ? 's' : ''} hoje</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="px-4 py-2 border">Prefixo</th>
                  <th className="px-4 py-2 border">Tipo</th>
                  <th className="px-4 py-2 border">Linha</th>
                  <th className="px-4 py-2 border">Sentido</th>
                  <th className="px-4 py-2 border">Descrição</th>
                  <th className="px-4 py-2 border">Horário</th>
                </tr>
              </thead>
              <tbody>
                {incidents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-400">
                      Nenhuma ocorrência registrada hoje.
                    </td>
                  </tr>
                )}
                {incidents.map(i => (
                  <tr key={i.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 border font-mono font-semibold">{i.prefix_code}</td>
                    <td className="px-4 py-2 border">{i.incident_type}</td>
                    <td className="px-4 py-2 border">{i.line || '—'}</td>
                    <td className="px-4 py-2 border">{i.direction || '—'}</td>
                    <td className="px-4 py-2 border text-gray-600 max-w-xs truncate">{i.description || '—'}</td>
                    <td className="px-4 py-2 border text-xs text-gray-500">
                      {new Date(i.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 text-sm text-gray-600">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}
                className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-white">← Anterior</button>
              <span>Pág. {page + 1} / {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}
                className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-white">Próxima →</button>
            </div>
          )}
        </div>
      )}

      {/* Modal de registro */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Registrar Ocorrência</h2>
            {formError && <p className="text-red-600 text-sm mb-3 bg-red-50 p-2 rounded">{formError}</p>}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Prefixo *</label>
                  <input name="prefix_code" value={form.prefix_code} onChange={handle}
                    className="w-full border rounded px-3 py-2 text-sm" placeholder="Ex: 4521" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Tipo *</label>
                  <select name="incident_type" value={form.incident_type} onChange={handle}
                    className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">Selecione...</option>
                    <option>Avaria</option>
                    <option>Acidente</option>
                    <option>Falha Mecânica</option>
                    <option>Pneu</option>
                    <option>Outro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Linha</label>
                  <input name="line" value={form.line} onChange={handle}
                    className="w-full border rounded px-3 py-2 text-sm" placeholder="Ex: 803" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Sentido</label>
                  <input name="direction" value={form.direction} onChange={handle}
                    className="w-full border rounded px-3 py-2 text-sm" placeholder="Ex: ENTRADA" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Descrição</label>
                <textarea name="description" value={form.description} onChange={handle}
                  className="w-full border rounded px-3 py-2 text-sm" rows={3}
                  placeholder="Descreva o ocorrido..." />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => { setModal(false); setFormError(null) }}
                  className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancelar</button>
                <button onClick={handleSubmit} disabled={saving}
                  className="px-4 py-2 text-sm bg-brand-700 text-white rounded hover:bg-brand-800 disabled:opacity-50">
                  {saving ? 'Registrando...' : 'Registrar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
