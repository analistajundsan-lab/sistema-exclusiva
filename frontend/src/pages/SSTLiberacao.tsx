import { useEffect, useState } from 'react'
import { Plus, UserCheck, X } from 'lucide-react'
import { Layout } from '../components/Layout'
import {
  createLiberacao,
  LiberacaoCondutor,
  LiberacaoStatus,
  listLiberacoes,
  updateLiberacao,
} from '../hooks/useSST'
import { useAuthStore } from '../store/auth'

const RESULTADO_LABEL: Record<LiberacaoStatus, string> = {
  pendente: 'Pendente',
  liberado: 'Liberado',
  liberado_com_restricao: 'Com Restrição',
  nao_liberado: 'Não Liberado',
}

const RESULTADO_COLOR: Record<LiberacaoStatus, string> = {
  pendente: 'bg-gray-100 text-gray-600 dark:bg-gray-800',
  liberado: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  liberado_com_restricao: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  nao_liberado: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const MOTIVOS = [
  'Admissão',
  'Retorno de afastamento',
  'Pós-acidente',
  'Reciclagem obrigatória',
  'Restrição médica',
  'Reintegração operacional',
]

const blank = (): Partial<LiberacaoCondutor> => ({
  unit: '',
  condutor_nome: '',
  condutor_matricula: '',
  motivo_avaliacao: '',
  documentacao_ok: null,
  treinamentos_ok: null,
  exames_ok: null,
  aso_ok: null,
  reciclagem_ok: null,
  avaliacoes_sst_ok: null,
  resultado: 'pendente',
  observacoes: '',
  restricoes: '',
})

const CheckField = ({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean | null
  onChange: (v: boolean | null) => void
}) => (
  <div className="flex items-center justify-between rounded-lg border border-gray-100 p-2 dark:border-gray-800">
    <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
    <div className="flex gap-1">
      {([true, false, null] as const).map((v) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
            value === v
              ? v === true
                ? 'bg-green-600 text-white'
                : v === false
                ? 'bg-red-600 text-white'
                : 'bg-gray-400 text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400'
          }`}
        >
          {v === true ? 'OK' : v === false ? 'NOK' : '—'}
        </button>
      ))}
    </div>
  </div>
)

export function SSTLiberacao() {
  const unit = useAuthStore((s) => s.userUnit)
  const [rows, setRows] = useState<LiberacaoCondutor[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<LiberacaoCondutor | null>(null)
  const [form, setForm] = useState<Partial<LiberacaoCondutor>>(blank())
  const [saving, setSaving] = useState(false)
  const [filterResultado, setFilterResultado] = useState('')

  const load = async () => {
    const params: Record<string, unknown> = {}
    if (filterResultado) params.resultado = filterResultado
    const data = await listLiberacoes(params)
    setRows(data)
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [filterResultado])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...blank(), unit: unit || '' })
    setShowForm(true)
  }

  const openEdit = (lb: LiberacaoCondutor) => {
    setEditing(lb)
    setForm({ ...lb })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.unit || !form.condutor_nome || !form.motivo_avaliacao) return
    setSaving(true)
    try {
      if (editing) {
        await updateLiberacao(editing.id, form)
      } else {
        await createLiberacao(form)
      }
      setShowForm(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            <UserCheck size={24} className="text-brand-700 dark:text-brand-400" />
            Liberação de Condutor
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Controle de autorização operacional de motoristas
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
        >
          <Plus size={16} />
          Nova Avaliação
        </button>
      </div>

      <div className="mb-4">
        <select
          value={filterResultado}
          onChange={(e) => setFilterResultado(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="">Todos os resultados</option>
          {Object.entries(RESULTADO_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-20 text-center text-gray-400">Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="py-20 text-center text-gray-400">Nenhuma avaliação encontrada</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {['Condutor', 'Matrícula', 'Unidade', 'Motivo', 'Resultado', 'Data', 'Ações'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((r) => (
                <tr key={r.id} className="bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">{r.condutor_nome}</td>
                  <td className="px-4 py-3 text-gray-500">{r.condutor_matricula || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.unit}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.motivo_avaliacao}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RESULTADO_COLOR[r.resultado]}`}>
                      {RESULTADO_LABEL[r.resultado]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(r.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
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
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-10 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {editing ? 'Editar Avaliação' : 'Nova Avaliação de Liberação'}
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
                  <span className="text-xs font-medium text-gray-500">Matrícula</span>
                  <input value={form.condutor_matricula || ''} onChange={(e) => setForm((f) => ({ ...f, condutor_matricula: e.target.value }))}
                    className="input w-full mt-1" />
                </label>
                <label className="col-span-2 block">
                  <span className="text-xs font-medium text-gray-500">Nome do Condutor *</span>
                  <input value={form.condutor_nome || ''} onChange={(e) => setForm((f) => ({ ...f, condutor_nome: e.target.value }))}
                    className="input w-full mt-1" />
                </label>
                <label className="col-span-2 block">
                  <span className="text-xs font-medium text-gray-500">Motivo da Avaliação *</span>
                  <select value={form.motivo_avaliacao || ''} onChange={(e) => setForm((f) => ({ ...f, motivo_avaliacao: e.target.value }))}
                    className="input w-full mt-1">
                    <option value="">Selecione...</option>
                    {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              </div>

              <div className="border-t border-gray-100 pt-3 dark:border-gray-800">
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Validações</p>
                <div className="space-y-2">
                  {[
                    ['Documentação', 'documentacao_ok'],
                    ['Treinamentos', 'treinamentos_ok'],
                    ['Exames', 'exames_ok'],
                    ['ASO', 'aso_ok'],
                    ['Reciclagem', 'reciclagem_ok'],
                    ['Avaliações SST', 'avaliacoes_sst_ok'],
                  ].map(([label, field]) => (
                    <CheckField
                      key={field}
                      label={label}
                      value={(form as Record<string, boolean | null>)[field]}
                      onChange={(v) => setForm((f) => ({ ...f, [field]: v }))}
                    />
                  ))}
                </div>
              </div>

              {/* Classificação do bloqueio (Fase 3) */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Categoria do bloqueio</span>
                  <select value={form.categoria_bloqueio || ''} onChange={(e) => setForm((f) => ({ ...f, categoria_bloqueio: e.target.value }))} className="input w-full mt-1">
                    <option value="">—</option>
                    <option value="fisica">Física</option>
                    <option value="fadiga">Fadiga</option>
                    <option value="psicossocial">Psicossocial</option>
                    <option value="seguranca">Segurança operacional</option>
                    <option value="jornada">Jornada</option>
                    <option value="documental">Documental</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Alerta de fadiga</span>
                  <select value={form.alerta_fadiga || ''} onChange={(e) => setForm((f) => ({ ...f, alerta_fadiga: e.target.value }))} className="input w-full mt-1">
                    <option value="">—</option>
                    <option value="menos_4h">Dormiu &lt; 4h</option>
                    <option value="4_6h">Dormiu 4-6h</option>
                    <option value="jornada_excessiva">Jornada excessiva</option>
                    <option value="outra_atividade_12h">Outra atividade nas 12h</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Score de aptidão (0-100)</span>
                  <input type="number" min={0} max={100} value={form.score_aptidao ?? ''} onChange={(e) => setForm((f) => ({ ...f, score_aptidao: e.target.value === '' ? null : Number(e.target.value) }))} className="input w-full mt-1" />
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-gray-500">Resultado</span>
                <select value={form.resultado || 'pendente'} onChange={(e) => setForm((f) => ({ ...f, resultado: e.target.value as LiberacaoStatus }))}
                  className="input w-full mt-1">
                  {Object.entries(RESULTADO_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-500">Observações</span>
                <textarea value={form.observacoes || ''} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                  rows={2} className="input w-full mt-1 resize-none" />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-500">Restrições</span>
                <textarea value={form.restricoes || ''} onChange={(e) => setForm((f) => ({ ...f, restricoes: e.target.value }))}
                  rows={2} className="input w-full mt-1 resize-none" />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
