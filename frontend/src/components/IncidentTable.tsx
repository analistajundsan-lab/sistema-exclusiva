import { Incident, IncidentStatus } from '../hooks/useIncidents'

interface Props {
  incidents: Incident[]
  total: number
  page: number
  totalPages: number
  onPageChange: (p: number) => void
  onDelete?: (id: number) => void
  onEdit?: (incident: Incident) => void
}

const statusBadge: Record<IncidentStatus, string> = {
  aberto: 'bg-red-100 text-red-700 border-red-200',
  em_andamento: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  fechado: 'bg-green-100 text-green-700 border-green-200',
}

const statusLabel: Record<IncidentStatus, string> = {
  aberto: '🔴 Aberto',
  em_andamento: '🟡 Em Andamento',
  fechado: '✅ Fechado',
}

export function IncidentTable({ incidents, total, page, totalPages, onPageChange, onDelete, onEdit }: Props) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="px-4 py-2 border">Prefixo</th>
              <th className="px-4 py-2 border">Tipo</th>
              <th className="px-4 py-2 border">Linha</th>
              <th className="px-4 py-2 border">Sentido</th>
              <th className="px-4 py-2 border">Status</th>
              <th className="px-4 py-2 border">Descrição</th>
              <th className="px-4 py-2 border">Data</th>
              <th className="px-4 py-2 border">Ações</th>
            </tr>
          </thead>
          <tbody>
            {incidents.length === 0 && (
              <tr><td colSpan={8} className="text-center py-6 text-gray-400">Nenhuma ocorrência encontrada</td></tr>
            )}
            {incidents.map(i => (
              <tr key={i.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 border font-mono font-semibold">{i.prefix_code}</td>
                <td className="px-4 py-2 border">{i.incident_type}</td>
                <td className="px-4 py-2 border">{i.line || '—'}</td>
                <td className="px-4 py-2 border">{i.direction || '—'}</td>
                <td className="px-4 py-2 border">
                  <span className={`text-xs px-2 py-0.5 rounded border font-medium ${statusBadge[i.status]}`}>
                    {statusLabel[i.status]}
                  </span>
                </td>
                <td className="px-4 py-2 border truncate max-w-xs text-gray-600">{i.description || '—'}</td>
                <td className="px-4 py-2 border text-xs text-gray-500">
                  {new Date(i.created_at).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-2 border">
                  <div className="flex gap-2">
                    {onEdit && <button onClick={() => onEdit(i)} className="text-brand-600 hover:underline text-xs">Editar</button>}
                    {onDelete && <button onClick={() => onDelete(i.id)} className="text-red-600 hover:underline text-xs">Deletar</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 text-sm text-gray-600">
        <span>{total} registro{total !== 1 ? 's' : ''} no total</span>
        <div className="flex gap-1">
          <button
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
            className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-white"
          >← Anterior</button>
          <span className="px-3 py-1">Pág. {page + 1} / {Math.max(totalPages, 1)}</span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
            className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-white"
          >Próxima →</button>
        </div>
      </div>
    </div>
  )
}
