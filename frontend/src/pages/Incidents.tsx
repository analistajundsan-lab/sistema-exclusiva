import { useState } from 'react'
import { Layout } from '../components/Layout'
import { useIncidents } from '../hooks/useIncidents'
import { AlertTriangle, Plus, Clock, Hash, Bus, X, ChevronLeft, ChevronRight } from 'lucide-react'

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

  const incidentTypeColor: Record<string, string> = {
    Avaria: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    Acidente: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    'Falha Mecânica': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    Pneu: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    Outro: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  }

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <AlertTriangle size={22} className="text-red-500" />
            Ocorrências
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 capitalize mt-0.5">{today}</p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 dark:bg-brand-600 text-white rounded-xl px-4 py-2.5 font-semibold text-sm transition-all"
        >
          <Plus size={16} />
          Registrar Ocorrência
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-4 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400 dark:text-gray-500 text-sm">
          Carregando...
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          {/* Sub-header */}
          <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              {total} ocorrência{total !== 1 ? 's' : ''} hoje
            </span>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <div className="flex items-center gap-1.5"><Hash size={12} /> Prefixo</div>
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <div className="flex items-center gap-1.5"><Bus size={12} /> Linha</div>
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Sentido
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Descrição
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <div className="flex items-center gap-1.5"><Clock size={12} /> Horário</div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {incidents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
                      <AlertTriangle size={24} className="mx-auto mb-2 opacity-30" />
                      Nenhuma ocorrência registrada hoje.
                    </td>
                  </tr>
                )}
                {incidents.map(i => (
                  <tr key={i.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="font-mono font-bold text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-lg text-xs">
                        {i.prefix_code}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${incidentTypeColor[i.incident_type] || incidentTypeColor['Outro']}`}>
                        {i.incident_type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-700 dark:text-gray-300 font-medium">
                      {i.line || <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-gray-700 dark:text-gray-300">
                      {i.direction || <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 max-w-xs truncate">
                      {i.description || <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                        {new Date(i.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40">
              <button
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-white dark:hover:bg-gray-700 transition-all"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Pág. <span className="font-semibold text-gray-700 dark:text-gray-300">{page + 1}</span> / {totalPages}
              </span>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-white dark:hover:bg-gray-700 transition-all"
              >
                Próxima <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal de registro */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Modal header */}
            <div className="bg-red-600 dark:bg-red-700 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <AlertTriangle size={18} />
                <h2 className="text-base font-bold">Registrar Ocorrência</h2>
              </div>
              <button
                onClick={() => { setModal(false); setFormError(null) }}
                className="text-red-200 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6">
              {formError && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl p-3 mb-4">
                  <p className="text-red-600 dark:text-red-400 text-sm">{formError}</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                      Prefixo *
                    </label>
                    <input
                      name="prefix_code"
                      value={form.prefix_code}
                      onChange={handle}
                      className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
                      placeholder="Ex: 4521"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                      Tipo *
                    </label>
                    <select
                      name="incident_type"
                      value={form.incident_type}
                      onChange={handle}
                      className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
                    >
                      <option value="">Selecione...</option>
                      <option>Avaria</option>
                      <option>Acidente</option>
                      <option>Falha Mecânica</option>
                      <option>Pneu</option>
                      <option>Outro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                      Linha
                    </label>
                    <input
                      name="line"
                      value={form.line}
                      onChange={handle}
                      className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
                      placeholder="Ex: 803"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                      Sentido
                    </label>
                    <input
                      name="direction"
                      value={form.direction}
                      onChange={handle}
                      className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
                      placeholder="Ex: ENTRADA"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                    Descrição
                  </label>
                  <textarea
                    name="description"
                    value={form.description}
                    onChange={handle}
                    className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full resize-none"
                    rows={3}
                    placeholder="Descreva o ocorrido..."
                  />
                </div>

                <div className="flex gap-2 justify-end pt-1">
                  <button
                    onClick={() => { setModal(false); setFormError(null) }}
                    className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl px-4 py-2.5 text-sm font-medium transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={saving}
                    className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 dark:bg-brand-600 text-white rounded-xl px-4 py-2.5 font-semibold text-sm transition-all disabled:opacity-50"
                  >
                    <Plus size={15} />
                    {saving ? 'Registrando...' : 'Registrar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
