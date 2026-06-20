import { useEffect, useState } from 'react'
import { Layout } from '../components/Layout'
import { AuditFilters, useAudit } from '../hooks/useAudit'
import api from '../api/client'

const resources = ['', 'schedule', 'schedule_line', 'swap', 'incident', 'user']
const actions = ['', 'IMPORT', 'CONFIRM', 'CREATE', 'UPDATE', 'DELETE', 'REGISTER']

const resourceLabel: Record<string, string> = {
  '': 'Todos',
  schedule: 'Escala',
  schedule_line: 'Linha',
  swap: 'Troca',
  incident: 'Ocorrência',
  user: 'Usuário',
}

const actionLabel: Record<string, string> = {
  '': 'Todas',
  IMPORT: 'Importação',
  CONFIRM: 'Confirmação',
  CREATE: 'Criação',
  UPDATE: 'Atualização',
  DELETE: 'Exclusão',
  REGISTER: 'Registro',
}

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
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Auditoria operacional</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Histórico de importações, confirmações, trocas e alterações.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-2xl shadow-card p-3 grid grid-cols-1 md:grid-cols-[220px_220px_180px_auto] gap-2 items-end">
          <label className="text-xs text-gray-500 dark:text-gray-400">
            Recurso
            <select
              value={search.resource || ''}
              onChange={e => setSearch(s => ({ ...s, resource: e.target.value || undefined }))}
              className="mt-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-2 text-sm w-full bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
            >
              {resources.map(resource => (
                <option key={resource} value={resource}>{resourceLabel[resource] ?? resource}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-500 dark:text-gray-400">
            Ação
            <select
              value={search.action || ''}
              onChange={e => setSearch(s => ({ ...s, action: e.target.value || undefined }))}
              className="mt-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-2 text-sm w-full bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
            >
              {actions.map(action => (
                <option key={action} value={action}>{actionLabel[action] ?? action}</option>
              ))}
            </select>
          </label>
          {canDeleteHistory ? (
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 h-10">
              <input
                type="checkbox"
                checked={!!search.include_deleted}
                onChange={e => setSearch(s => ({ ...s, include_deleted: e.target.checked || undefined }))}
              />
              Ver apagados
            </label>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500 h-10 flex items-center">Histórico protegido</span>
          )}
          <button type="submit" className="bg-brand-700 text-white px-4 py-2 rounded text-sm hover:bg-brand-800">
            Filtrar
          </button>
        </form>

        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between text-sm text-gray-600 dark:text-gray-300">
            <span>{total} registros</span>
            {loading && <span>Carregando...</span>}
          </div>
          {error && <p className="text-red-600 dark:text-red-400 text-sm p-4">{error}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700 text-left">
                  <th className="px-3 py-2 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">Data/hora</th>
                  <th className="px-3 py-2 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">Usuário</th>
                  <th className="px-3 py-2 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">Ação</th>
                  <th className="px-3 py-2 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">Recurso</th>
                  <th className="px-3 py-2 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">Status</th>
                  <th className="px-3 py-2 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">Detalhes</th>
                  <th className="px-3 py-2 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">Ações</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-400 dark:text-gray-500">Nenhum registro encontrado</td>
                  </tr>
                )}
                {logs.map(log => (
                  <tr key={log.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${log.deleted_at ? 'opacity-60' : ''}`}>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700 whitespace-nowrap text-gray-800 dark:text-gray-200">
                      {new Date(log.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">{log.user_id}</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700 font-semibold text-gray-800 dark:text-gray-200">{log.action}</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">
                      {log.resource}{log.resource_id ? ` #${log.resource_id}` : ''}
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <span className={`text-xs px-2 py-0.5 rounded ${log.deleted_at ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'}`}>
                        {log.deleted_at ? 'Apagado' : 'Ativo'}
                      </span>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400">{log.details || '-'}</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      {canDeleteHistory ? (
                        log.deleted_at ? (
                          <button onClick={() => restoreLog(log.id)} className="text-xs text-brand-700 dark:text-brand-400 hover:underline">Recuperar</button>
                        ) : (
                          <button onClick={() => deleteLog(log.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">Apagar</button>
                        )
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">Restrito</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-sm text-gray-600 dark:text-gray-400">
            <span>Página {page + 1} de {Math.max(totalPages, 1)}</span>
            <div className="flex gap-1">
              <button
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-white dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
              >
                Anterior
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-white dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
              >
                Próxima
              </button>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  )
}
