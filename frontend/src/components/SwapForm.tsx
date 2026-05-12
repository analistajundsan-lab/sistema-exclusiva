import { useState } from 'react'
import { Swap } from '../hooks/useSwaps'

interface Props {
  initial?: Partial<Swap>
  onSubmit: (data: Omit<Swap, 'id' | 'created_by' | 'created_at'>) => Promise<void>
  onCancel: () => void
}

export function SwapForm({ initial, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState({
    vehicle_out: initial?.vehicle_out || '',
    vehicle_in: initial?.vehicle_in || '',
    reason: initial?.reason || '',
    lines_covered: initial?.lines_covered || '',
  })
  const [saving, setSaving] = useState(false)

  const handle = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.vehicle_out || !form.vehicle_in) return
    setSaving(true)
    try { await onSubmit(form) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Prefixo SAI *</label>
          <input name="vehicle_out" value={form.vehicle_out} onChange={handle}
            className="w-full border rounded px-3 py-2 text-sm" placeholder="Ex: 4521" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Prefixo ENTRA *</label>
          <input name="vehicle_in" value={form.vehicle_in} onChange={handle}
            className="w-full border rounded px-3 py-2 text-sm" placeholder="Ex: 4522" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Motivo</label>
        <select name="reason" value={form.reason} onChange={handle}
          className="w-full border rounded px-3 py-2 text-sm">
          <option value="">Selecione...</option>
          <option value="Manutenção preventiva">Manutenção preventiva</option>
          <option value="Manutenção corretiva">Manutenção corretiva</option>
          <option value="Avaria em campo">Avaria em campo</option>
          <option value="Acidente">Acidente</option>
          <option value="Reserva operacional">Reserva operacional</option>
          <option value="Outro">Outro</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Linhas Cobertas</label>
        <input name="lines_covered" value={form.lines_covered} onChange={handle}
          className="w-full border rounded px-3 py-2 text-sm" placeholder="Ex: 803, 804" />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm border rounded hover:bg-gray-100">Cancelar</button>
        <button onClick={handleSubmit} disabled={saving}
          className="px-4 py-2 text-sm bg-green-700 text-white rounded hover:bg-green-800 disabled:opacity-50">
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}
