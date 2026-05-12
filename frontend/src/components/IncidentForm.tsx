import { useState } from 'react'
import { Incident, IncidentStatus } from '../hooks/useIncidents'

interface Props {
  initial?: Partial<Incident>
  onSubmit: (data: Omit<Incident, 'id' | 'created_by' | 'created_at'>) => Promise<void>
  onCancel: () => void
}

export function IncidentForm({ initial, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState({
    prefix_code: initial?.prefix_code || '',
    incident_type: initial?.incident_type || '',
    description: initial?.description || '',
    line: initial?.line || '',
    direction: initial?.direction || '',
    status: (initial?.status || 'aberto') as IncidentStatus,
  })
  const [saving, setSaving] = useState(false)

  const handle = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.prefix_code || !form.incident_type) return
    setSaving(true)
    try { await onSubmit(form) } finally { setSaving(false) }
  }

  return (
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
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">Status</label>
          <select name="status" value={form.status} onChange={handle}
            className="w-full border rounded px-3 py-2 text-sm">
            <option value="aberto">🔴 Aberto</option>
            <option value="em_andamento">🟡 Em Andamento</option>
            <option value="fechado">✅ Fechado</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Descrição</label>
        <textarea name="description" value={form.description} onChange={handle}
          className="w-full border rounded px-3 py-2 text-sm" rows={3} />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm border rounded hover:bg-gray-100">Cancelar</button>
        <button onClick={handleSubmit} disabled={saving}
          className="px-4 py-2 text-sm bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50">
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}
