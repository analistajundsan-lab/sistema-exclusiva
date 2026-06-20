import { useEffect, useState } from 'react'
import { Heart, Plus, X } from 'lucide-react'
import { Layout } from '../components/Layout'
import {
  createSaude,
  listSaude,
  SaudeCondutor,
  SaudeStatus,
  updateSaude,
} from '../hooks/useSST'
import { useAuthStore } from '../store/auth'

const STATUS_LABEL: Record<SaudeStatus, string> = {
  em_acompanhamento: 'Em Acompanhamento',
  encaminhado: 'Encaminhado',
  resolvido: 'Resolvido',
}

const STATUS_COLOR: Record<SaudeStatus, string> = {
  em_acompanhamento: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  encaminhado: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  resolvido: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
}

const NIVEL_OPTIONS = ['bom', 'regular', 'ruim']
const ENCAMINHAMENTOS_OPTIONS = ['RH', 'Medicina Ocupacional', 'Psicologia', 'Treinamento', 'Gestão']

const blank = (): Partial<SaudeCondutor> => ({
  unit: '',
  condutor_nome: '',
  condutor_matricula: '',
  data_avaliacao: new Date().toISOString().split('T')[0],
  tecnico_responsavel: '',
  qualidade_sono: '',
  fadiga: '',
  alimentacao: '',
  hidratacao: '',
  queixas_fisicas: '',
  estresse: '',
  ansiedade: '',
  conflitos_pessoais: '',
  observacoes_comportamentais: '',
  jornada_excessiva: false,
  queixas_recorrentes: '',
  historico_ocorrencias: '',
  necessidade_treinamento: false,
  plano_acao: '',
  encaminhamentos: [],
  status: 'em_acompanhamento',
})

const SelectField = ({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | null
  onChange: (v: string) => void
}) => (
  <div>
    <span className="text-xs font-medium text-gray-500">{label}</span>
    <div className="mt-1 flex gap-1">
      {NIVEL_OPTIONS.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
            value === o
              ? o === 'bom'
                ? 'bg-green-600 text-white'
                : o === 'regular'
                ? 'bg-yellow-500 text-white'
                : 'bg-red-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  </div>
)

export function SSTSaude() {
  const unit = useAuthStore((s) => s.userUnit)
  const [rows, setRows] = useState<SaudeCondutor[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SaudeCondutor | null>(null)
  const [form, setForm] = useState<Partial<SaudeCondutor>>(blank())
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')

  const load = async () => {
    const params: Record<string, unknown> = {}
    if (filterStatus) params.status = filterStatus
    const data = await listSaude(params)
    setRows(data)
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [filterStatus])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...blank(), unit: unit || '' })
    setShowForm(true)
  }

  const openEdit = (s: SaudeCondutor) => {
    setEditing(s)
    setForm({ ...s })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.unit || !form.condutor_nome || !form.data_avaliacao) return
    setSaving(true)
    try {
      if (editing) {
        await updateSaude(editing.id, form)
      } else {
        await createSaude(form)
      }
      setShowForm(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const toggleEnc = (enc: string) => {
    const cur = form.encaminhamentos || []
    setForm((f) => ({
      ...f,
      encaminhamentos: cur.includes(enc) ? cur.filter((e) => e !== enc) : [...cur, enc],
    }))
  }

  return (
    <Layout>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            <Heart size={24} className="text-brand-700 dark:text-brand-400" />
            Saúde e Bem-Estar
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Acompanhamentos preventivos dos condutores
          </p>
        </div>
        <button
          onClick={openCreate}
          className="btn-primary"
        >
          <Plus size={16} />
          Nova Avaliação
        </button>
      </div>

      <div className="mb-4">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="select w-auto"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-20 text-center text-gray-400">Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="py-20 text-center text-gray-400">Nenhuma avaliação encontrada</div>
      ) : (
        <div className="table-wrapper">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                {['Condutor', 'Matrícula', 'Unidade', 'Data', 'Técnico', 'Encaminhamentos', 'Status', 'Ações'].map((h) => (
                  <th key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-gray-800 dark:text-gray-200">{r.condutor_nome}</td>
                  <td className="text-gray-500">{r.condutor_matricula || '—'}</td>
                  <td className="text-gray-700 dark:text-gray-300">{r.unit}</td>
                  <td className="text-gray-500">
                    {new Date(r.data_avaliacao + 'T00:00').toLocaleDateString('pt-BR')}
                  </td>
                  <td className="text-gray-700 dark:text-gray-300">{r.tecnico_responsavel || '—'}</td>
                  <td>
                    {(r.encaminhamentos || []).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {(r.encaminhamentos || []).map((e) => (
                          <span key={e} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700 dark:bg-brand-900/20 dark:text-brand-400">
                            {e}
                          </span>
                        ))}
                      </div>
                    ) : '—'}
                  </td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td>
                    <button onClick={() => openEdit(r)} className="text-xs text-brand-600 hover:underline dark:text-brand-400">
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 pt-10 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-modal dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {editing ? 'Editar Avaliação' : 'Nova Avaliação — Saúde e Bem-Estar'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Unidade *</span>
                  <input value={form.unit || ''} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                    className="input w-full mt-1" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Data *</span>
                  <input type="date" value={form.data_avaliacao || ''} onChange={(e) => setForm((f) => ({ ...f, data_avaliacao: e.target.value }))}
                    className="input w-full mt-1" />
                </label>
                <label className="col-span-2 block">
                  <span className="text-xs font-medium text-gray-500">Condutor *</span>
                  <input value={form.condutor_nome || ''} onChange={(e) => setForm((f) => ({ ...f, condutor_nome: e.target.value }))}
                    className="input w-full mt-1" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Matrícula</span>
                  <input value={form.condutor_matricula || ''} onChange={(e) => setForm((f) => ({ ...f, condutor_matricula: e.target.value }))}
                    className="input w-full mt-1" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Técnico Responsável</span>
                  <input value={form.tecnico_responsavel || ''} onChange={(e) => setForm((f) => ({ ...f, tecnico_responsavel: e.target.value }))}
                    className="input w-full mt-1" />
                </label>
              </div>

              <div className="border-t border-gray-100 pt-3 dark:border-gray-700">
                <p className="section-title mb-3">Avaliação Física</p>
                <div className="grid grid-cols-2 gap-4">
                  <SelectField label="Qualidade do Sono" value={form.qualidade_sono || null}
                    onChange={(v) => setForm((f) => ({ ...f, qualidade_sono: v }))} />
                  <SelectField label="Fadiga" value={form.fadiga || null}
                    onChange={(v) => setForm((f) => ({ ...f, fadiga: v }))} />
                  <SelectField label="Alimentação" value={form.alimentacao || null}
                    onChange={(v) => setForm((f) => ({ ...f, alimentacao: v }))} />
                  <SelectField label="Hidratação" value={form.hidratacao || null}
                    onChange={(v) => setForm((f) => ({ ...f, hidratacao: v }))} />
                </div>
                <label className="mt-3 block">
                  <span className="text-xs font-medium text-gray-500">Queixas Físicas</span>
                  <textarea value={form.queixas_fisicas || ''} onChange={(e) => setForm((f) => ({ ...f, queixas_fisicas: e.target.value }))}
                    rows={2} className="input w-full mt-1 resize-none" />
                </label>
              </div>

              <div className="border-t border-gray-100 pt-3 dark:border-gray-700">
                <p className="section-title mb-3">Avaliação Emocional</p>
                <div className="grid grid-cols-2 gap-4">
                  <SelectField label="Estresse" value={form.estresse || null}
                    onChange={(v) => setForm((f) => ({ ...f, estresse: v }))} />
                  <SelectField label="Ansiedade" value={form.ansiedade || null}
                    onChange={(v) => setForm((f) => ({ ...f, ansiedade: v }))} />
                </div>
                <label className="mt-3 block">
                  <span className="text-xs font-medium text-gray-500">Conflitos Pessoais</span>
                  <textarea value={form.conflitos_pessoais || ''} onChange={(e) => setForm((f) => ({ ...f, conflitos_pessoais: e.target.value }))}
                    rows={2} className="input w-full mt-1 resize-none" />
                </label>
                <label className="mt-3 block">
                  <span className="text-xs font-medium text-gray-500">Observações Comportamentais</span>
                  <textarea value={form.observacoes_comportamentais || ''} onChange={(e) => setForm((f) => ({ ...f, observacoes_comportamentais: e.target.value }))}
                    rows={2} className="input w-full mt-1 resize-none" />
                </label>
              </div>

              <div className="border-t border-gray-100 pt-3 dark:border-gray-700">
                <p className="section-title mb-3">Avaliação Operacional</p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={!!form.jornada_excessiva}
                      onChange={(e) => setForm((f) => ({ ...f, jornada_excessiva: e.target.checked }))}
                      className="rounded" />
                    Jornada excessiva
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={!!form.necessidade_treinamento}
                      onChange={(e) => setForm((f) => ({ ...f, necessidade_treinamento: e.target.checked }))}
                      className="rounded" />
                    Necessita treinamento
                  </label>
                </div>
                <label className="mt-3 block">
                  <span className="text-xs font-medium text-gray-500">Queixas Recorrentes</span>
                  <textarea value={form.queixas_recorrentes || ''} onChange={(e) => setForm((f) => ({ ...f, queixas_recorrentes: e.target.value }))}
                    rows={2} className="input w-full mt-1 resize-none" />
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-gray-500">Plano de Ação</span>
                <textarea value={form.plano_acao || ''} onChange={(e) => setForm((f) => ({ ...f, plano_acao: e.target.value }))}
                  rows={3} className="input w-full mt-1 resize-none" />
              </label>

              <div>
                <p className="section-title mb-2">Encaminhamentos</p>
                <div className="flex flex-wrap gap-2">
                  {ENCAMINHAMENTOS_OPTIONS.map((enc) => {
                    const selected = (form.encaminhamentos || []).includes(enc)
                    return (
                      <button key={enc} type="button" onClick={() => toggleEnc(enc)}
                        className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                          selected
                            ? 'bg-brand-700 text-white border-brand-700'
                            : 'border-gray-200 text-gray-600 hover:border-brand-400 dark:border-gray-700 dark:text-gray-400'
                        }`}>
                        {enc}
                      </button>
                    )
                  })}
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-gray-500">Status</span>
                <select value={form.status || 'em_acompanhamento'} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as SaudeStatus }))}
                  className="select w-full mt-1">
                  {Object.entries(STATUS_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="btn-secondary">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="btn-primary">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
