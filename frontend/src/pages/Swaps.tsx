import { useState } from 'react'
import { Layout } from '../components/Layout'
import { SwapTable } from '../components/SwapTable'
import { SwapForm } from '../components/SwapForm'
import { useSwaps, Swap } from '../hooks/useSwaps'
import { copyToClipboard } from '../utils/clipboard'

// Texto de fallback quando a troca nao tem whatsapp_text pronto. Omite o
// "carro substituto" em troca so de motorista (evita "undefined" na mensagem).
function swapText(swap: Swap): string {
  if (swap.whatsapp_text) return swap.whatsapp_text
  return [
    'Troca operacional confirmada',
    '',
    `Carro substituido: ${swap.vehicle_out}`,
    ...(swap.vehicle_in ? [`Carro substituto: ${swap.vehicle_in}`] : []),
    '',
    `Linha(s): ${swap.lines_covered || '-'}`,
  ].join('\n')
}

export function Swaps() {
  const {
    swaps, loading, error, total, page, totalPages,
    setPage, applyFilters, createSwap, updateSwap, deleteSwap
  } = useSwaps()

  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Swap | null>(null)
  const [search, setSearch] = useState({ vehicle_out: '', vehicle_in: '', unit: '' })
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const handleCreate = async (data: Parameters<typeof createSwap>[0]) => {
    await createSwap(data)
    setModal(null)
  }

  const handleUpdate = async (data: Parameters<typeof createSwap>[0]) => {
    if (!editing) return
    await updateSwap(editing.id, data)
    setModal(null)
    setEditing(null)
  }

  const handleEdit = (swap: Swap) => {
    setEditing(swap)
    setModal('edit')
  }

  const handleDelete = async (id: number) => {
    if (confirm('Deletar esta troca?')) await deleteSwap(id)
  }

  const handleCopy = async (swap: Swap) => {
    const ok = await copyToClipboard(swapText(swap))
    if (ok) {
      setCopiedId(swap.id)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  const handleWhatsApp = (swap: Swap) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(swapText(swap))}`, '_blank', 'noopener,noreferrer')
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    applyFilters({ ...search })
  }

  const handleReset = () => {
    setSearch({ vehicle_out: '', vehicle_in: '', unit: '' })
    applyFilters({})
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Trocas de veiculos</h1>
          <p className="text-sm text-gray-500">Historico operacional das substituicoes e mensagens para WhatsApp.</p>
        </div>
        <button onClick={() => setModal('create')} className="bg-green-700 text-white px-4 py-2 rounded text-sm hover:bg-green-800">
          + Nova troca
        </button>
      </div>

      <form onSubmit={handleSearch} className="bg-white rounded-2xl shadow-card p-3 mb-4 flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Prefixo SAI</label>
          <input value={search.vehicle_out} onChange={e => setSearch(s => ({ ...s, vehicle_out: e.target.value }))}
            className="border rounded px-2 py-1.5 text-sm w-28" placeholder="Ex: 4521" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Prefixo ENTRA</label>
          <input value={search.vehicle_in} onChange={e => setSearch(s => ({ ...s, vehicle_in: e.target.value }))}
            className="border rounded px-2 py-1.5 text-sm w-28" placeholder="Ex: 4522" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Unidade</label>
          <select value={search.unit} onChange={e => setSearch(s => ({ ...s, unit: e.target.value }))}
            className="border rounded px-2 py-1.5 text-sm w-44">
            <option value="">Todas</option>
            <option>Caieiras</option>
            <option>Jundiai</option>
            <option>Santana de Parnaiba</option>
          </select>
        </div>
        <button type="submit" className="bg-green-700 text-white px-3 py-1.5 rounded text-sm hover:bg-green-800">Buscar</button>
        <button type="button" onClick={handleReset} className="border px-3 py-1.5 rounded text-sm hover:bg-gray-50">Limpar</button>
      </form>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {loading ? <p className="text-gray-500 py-8 text-center">Carregando...</p> : (
        <div className="bg-white rounded-2xl shadow-card">
          <SwapTable
            swaps={swaps}
            total={total}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onCopy={handleCopy}
            onWhatsApp={handleWhatsApp}
            copiedId={copiedId}
          />
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-modal p-6 w-full max-w-lg mx-4">
            <h2 className="text-lg font-semibold mb-4">{modal === 'create' ? 'Nova troca' : 'Editar troca'}</h2>
            <SwapForm
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
