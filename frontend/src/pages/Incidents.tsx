import { useState } from 'react'
import { Layout } from '../components/Layout'
import { IncidentTable } from '../components/IncidentTable'
import { IncidentForm } from '../components/IncidentForm'
import { useIncidents, Incident, IncidentStatus } from '../hooks/useIncidents'

export function Incidents() {
  const {
    incidents, loading, error, total, page, totalPages,
    setPage, applyFilters, createIncident, updateIncident, deleteIncident
  } = useIncidents()

  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Incident | null>(null)

  // filtros locais (antes de aplicar)
  const [search, setSearch] = useState({ prefix_code: '', line: '', incident_type: '', status: '' as IncidentStatus | '' })

  const handleCreate = async (data: Parameters<typeof createIncident>[0]) => {
    await createIncident(data)
    setModal(null)
  }

  const handleUpdate = async (data: Parameters<typeof createIncident>[0]) => {
    if (!editing) return
    await updateIncident(editing.id, data)
    setModal(null)
    setEditing(null)
  }

  const handleEdit = (incident: Incident) => {
    setEditing(incident)
    setModal('edit')
  }

  const handleDelete = async (id: number) => {
    if (confirm('Deletar esta ocorrência?')) await deleteIncident(id)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    applyFilters({ ...search })
  }

  const handleReset = () => {
    setSearch({ prefix_code: '', line: '', incident_type: '', status: '' })
    applyFilters({})
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Ocorrências</h1>
        <button onClick={() => setModal('create')}
          className="bg-brand-700 text-white px-4 py-2 rounded text-sm hover:bg-brand-800">
          + Nova Ocorrência
        </button>
      </div>

      {/* Barra de Filtros */}
      <form onSubmit={handleSearch} className="bg-white rounded-lg shadow p-3 mb-4 flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Prefixo</label>
          <input value={search.prefix_code} onChange={e => setSearch(s => ({ ...s, prefix_code: e.target.value }))}
            className="border rounded px-2 py-1.5 text-sm w-28" placeholder="Ex: 4521" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Linha</label>
          <input value={search.line} onChange={e => setSearch(s => ({ ...s, line: e.target.value }))}
            className="border rounded px-2 py-1.5 text-sm w-24" placeholder="Ex: 803" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tipo</label>
          <select value={search.incident_type} onChange={e => setSearch(s => ({ ...s, incident_type: e.target.value }))}
            className="border rounded px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            <option>Avaria</option>
            <option>Acidente</option>
            <option>Falha Mecânica</option>
            <option>Pneu</option>
            <option>Outro</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select value={search.status} onChange={e => setSearch(s => ({ ...s, status: e.target.value as IncidentStatus | '' }))}
            className="border rounded px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            <option value="aberto">Aberto</option>
            <option value="em_andamento">Em Andamento</option>
            <option value="fechado">Fechado</option>
          </select>
        </div>
        <button type="submit" className="bg-brand-700 text-white px-3 py-1.5 rounded text-sm hover:bg-brand-800">
          Buscar
        </button>
        <button type="button" onClick={handleReset} className="border px-3 py-1.5 rounded text-sm hover:bg-gray-50">
          Limpar
        </button>
      </form>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {loading ? <p className="text-gray-500 py-8 text-center">Carregando...</p> : (
        <div className="bg-white rounded-lg shadow">
          <IncidentTable
            incidents={incidents}
            total={total}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg mx-4">
            <h2 className="text-lg font-semibold mb-4">
              {modal === 'create' ? 'Nova Ocorrência' : 'Editar Ocorrência'}
            </h2>
            <IncidentForm
              initial={editing || undefined}
              onSubmit={modal === 'create' ? handleCreate : handleUpdate}
              onCancel={() => { setModal(null); setEditing(null) }}
            />
          </div>
        </div>
      )}
    </Layout>
  )
}
