import { useEffect, useState } from 'react'
import { Layout } from '../components/Layout'
import { AuditFilters, useAudit } from '../hooks/useAudit'
import api from '../api/client'

const resources = ['', 'schedule', 'schedule_line', 'swap', 'incident', 'user']
const actions = ['', 'IMPORT', 'CONFIRM', 'CREATE', 'UPDATE', 'DELETE', 'REGISTER']

export function Audit() {
  const [search, setSearch] = useState<AuditFilters>({})
  const [canDeleteHistory, setCanDeleteHistory] = useState(false)
  const { logs, total, page, totalPages, loading, error, setPage, applyFilters, refetch } = useAudit(search)

  useEffect(() => {
    api.get('/auth/me')
      .then(res => setCanDeleteHistory(!!res.data.can_delete_history))
      .catch(() => setCanDeleteHistory(false))
  }, [])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    applyFilters(canDeleteHistory ? search : { ...search, include_deleted: undefined })
  }

  const deleteLog = async (id: number) => {
    if (!canDeleteHistory) return
    await api.delete(`/audit/logs/${id}`)
    refetch()
  }

  const restoreLog = async (id: number) => {
    if (!canDeleteHistory) return
    await api.post(`/audit/logs/${id}/restore`)
    refetch()
  }

  return (
    <Layout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Auditoria operacional</h1>
          <p className="text-sm text-gray-500">Historico de importacoes, confirmacoes, trocas e alteracoes.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-3 grid grid-cols-1 md:grid-cols-[220px_220px_180px_auto] gap-2 items-end">
          <label className="text-xs text-gray-500">
            Recurso
            <select value={search.resource || ''} onChange={e => setSearch(s => ({ ...s, resource: e.target.value || undefined }))}
              className="mt-1 border rounded px-2 py-2 text-sm w-full">
              {resources.map(resource => <option key={resource} value={resource}>{resource || 'Todos'}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500">
            Acao
            <select value={search.action || ''} onChange={e => setSearch(s => ({ ...s, action: e.target.value || undefined }))}
              className="mt-1 border rounded px-2 py-2 text-sm w-full">
              {actions.map(action => <option key={action} value={action}>{action || 'Todas'}</option>)}
            </select>
          </label>
          {canDeleteHistory ? (
            <label className="flex items-center gap-2 text-xs text-gray-600 h-10">
              <input
                type="checkbox"
                checked={!!search.include_deleted}
                onChange={e => setSearch(s => ({ ...s, include_deleted: e.target.checked || undefined }))}
              />
              Ver apagados
            </label>
          ) : <span className="text-xs text-gray-400 h-10 flex items-center">Historico protegido</span>}
          <button type="submit" className="bg-brand-700 text-white px-4 py-2 rounded text-sm hover:bg-brand-800">
            Filtrar
          </button>
        </form>

        <section className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 border-b flex justify-between text-sm text-gray-600">
            <span>{total} registros</span>
            {loading && <span>Carregando...</span>}
          </div>
          {error && <p className="text-red-600 text-sm p-4">{error}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="px-3 py-2 border">Data/hora</th>
                  <th className="px-3 py-2 border">Usuario</th>
                  <th className="px-3 py-2 border">Acao</th>
                  <th className="px-3 py-2 border">Recurso</th>
                  <th className="px-3 py-2 border">Status</th>
                  <th className="px-3 py-2 border">Detalhes</th>
                  <th className="px-3 py-2 border">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && !loading && (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">Nenhum registro encontrado</td></tr>
                )}
                {logs.map(log => (
                  <tr key={log.id} className={`hover:bg-gray-50 ${log.deleted_at ? 'opacity-60' : ''}`}>
                    <td className="px-3 py-2 border whitespace-nowrap">{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2 border">{log.user_id}</td>
                    <td className="px-3 py-2 border font-semibold">{log.action}</td>
                    <td className="px-3 py-2 border">{log.resource}{log.resource_id ? ` #${log.resource_id}` : ''}</td>
                    <td className="px-3 py-2 border">
                      <span className={`text-xs px-2 py-0.5 rounded ${log.deleted_at ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {log.deleted_at ? 'Apagado' : 'Ativo'}
                      </span>
                    </td>
                    <td className="px-3 py-2 border text-gray-600">{log.details || '-'}</td>
                    <td className="px-3 py-2 border">
                      {canDeleteHistory ? (
                        log.deleted_at ? (
                          <button onClick={() => restoreLog(log.id)} className="text-xs text-brand-700 hover:underline">Recuperar</button>
                        ) : (
                          <button onClick={() => deleteLog(log.id)} className="text-xs text-red-600 hover:underline">Apagar</button>
                        )
                      ) : <span className="text-xs text-gray-400">Restrito</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 text-sm text-gray-600">
            <span>Pagina {page + 1} de {Math.max(totalPages, 1)}</span>
            <div className="flex gap-1">
              <button disabled={page === 0} onClick={() => setPage(page - 1)} className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-white">Anterior</button>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-white">Proxima</button>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  )
}
