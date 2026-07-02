import { Swap } from '../hooks/useSwaps'
import { fmtDateTimeBR } from '../utils/datetime'
import { plural } from '../utils/format'

interface Props {
  swaps: Swap[]
  total: number
  page: number
  totalPages: number
  onPageChange: (p: number) => void
  onDelete?: (id: number) => void
  onEdit?: (swap: Swap) => void
  onCopy?: (swap: Swap) => void
  onWhatsApp?: (swap: Swap) => void
  // Troca com "Copiado!" no botao de copiar desta linha (feedback visual).
  copiedId?: number | null
}

export function SwapTable({ swaps, total, page, totalPages, onPageChange, onDelete, onEdit, onCopy, onWhatsApp, copiedId }: Props) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="px-4 py-2 border">Unidade</th>
              <th className="px-4 py-2 border">Linha</th>
              <th className="px-4 py-2 border">Sai</th>
              <th className="px-4 py-2 border">Entra</th>
              <th className="px-4 py-2 border">Motivo</th>
              <th className="px-4 py-2 border">Data</th>
              <th className="px-4 py-2 border">Ações</th>
            </tr>
          </thead>
          <tbody>
            {swaps.length === 0 && (
              <tr><td colSpan={7} className="text-center py-6 text-gray-400">Nenhuma troca encontrada</td></tr>
            )}
            {swaps.map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 border">{s.unit || '-'}</td>
                <td className="px-4 py-2 border text-gray-600">{s.lines_covered || '-'}</td>
                <td className="px-4 py-2 border font-mono font-semibold text-red-700">{s.vehicle_out}</td>
                <td className="px-4 py-2 border font-mono font-semibold text-green-700">{s.vehicle_in || '-'}</td>
                <td className="px-4 py-2 border text-gray-600">{s.reason || '-'}</td>
                <td className="px-4 py-2 border text-xs text-gray-500">{fmtDateTimeBR(s.created_at)}</td>
                <td className="px-4 py-2 border">
                  <div className="flex flex-wrap gap-2">
                    {onCopy && (
                      <button onClick={() => onCopy(s)} className="text-green-700 hover:underline text-xs">
                        {copiedId === s.id ? 'Copiado!' : 'Copiar texto'}
                      </button>
                    )}
                    {onWhatsApp && <button onClick={() => onWhatsApp(s)} className="text-green-600 hover:underline text-xs font-semibold">Abrir WhatsApp</button>}
                    {onEdit && <button onClick={() => onEdit(s)} className="text-brand-600 hover:underline text-xs">Editar</button>}
                    {onDelete && <button onClick={() => onDelete(s.id)} className="text-red-600 hover:underline text-xs">Deletar</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 text-sm text-gray-600">
        <span>{plural(total, 'registro', 'registros')} no total</span>
        <div className="flex gap-1">
          <button disabled={page === 0} onClick={() => onPageChange(page - 1)} className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-white">Anterior</button>
          <span className="px-3 py-1">Pág. {page + 1} / {Math.max(totalPages, 1)}</span>
          <button disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)} className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-white">Próxima</button>
        </div>
      </div>
    </div>
  )
}
