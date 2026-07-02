import { useEffect, useState } from 'react'
import { AlertTriangle, Plus, Search, X } from 'lucide-react'
import { Layout } from '../components/Layout'
import {
  createSinistro,
  getSinistroHistorico,
  listSinistros,
  Sinistro,
  SinistroHistorico,
  SinistroStatus,
  updateSinistro,
} from '../hooks/useSST'
import { parseApiDate } from '../utils/datetime'
import { useAuthStore } from '../store/auth'

const STATUS_LABEL: Record<SinistroStatus, string> = {
  aberto: 'Aberto',
  em_analise: 'Em Análise',
  aguardando_documentos: 'Aguard. Docs',
  em_investigacao: 'Investigação',
  encerrado: 'Encerrado',
}

const STATUS_COLOR: Record<SinistroStatus, string> = {
  aberto: 'badge-blue',
  em_analise: 'badge-yellow',
  aguardando_documentos: 'badge-gray',
  em_investigacao: 'badge-yellow',
  encerrado: 'badge-green',
}

const TIPOS_SINISTRO = [
  'Colisão',
  'Abalroamento',
  'Atropelamento',
  'Queda de passageiro',
  'Dano patrimonial',
  'Terceiros',
  'Acidente sem vítima',
  'Acidente com vítima',
]

const DANOS_COMUNS = [
  'Para-choque dianteiro',
  'Para-choque traseiro',
  'Para-lama esquerdo',
  'Para-lama direito',
  'Retrovisor esquerdo',
  'Retrovisor direito',
  'Porta',
  'Vidros',
  'Lanternas',
  'Faróis',
]

const blank = (): Partial<Sinistro> => ({
  unit: '',
  empresa: '',
  prefixo: '',
  placa: '',
  condutor_nome: '',
  condutor_matricula: '',
  data_ocorrencia: new Date().toISOString().split('T')[0],
  hora_ocorrencia: '',
  local_ocorrencia: '',
  cidade: '',
  estado: '',
  tipo_sinistro: '',
  descricao: '',
  danos_identificados: [],
  envolvidos: [],
  status: 'aberto',
})

export function SSTSinistros() {
  const unit = useAuthStore((s) => s.userUnit)
  const [rows, setRows] = useState<Sinistro[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Sinistro | null>(null)
  const [form, setForm] = useState<Partial<Sinistro>>(blank())
  const [saving, setSaving] = useState(false)
  const [historico, setHistorico] = useState<SinistroHistorico[]>([])
  const [showHistorico, setShowHistorico] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const load = async () => {
    const params: Record<string, unknown> = {}
    if (search) params.condutor = search
    if (filterStatus) params.status = filterStatus
    const data = await listSinistros(params)
    setRows(data)
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [search, filterStatus])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...blank(), unit: unit || '' })
    setShowForm(true)
  }

  const openEdit = (s: Sinistro) => {
    setEditing(s)
    setForm({ ...s })
    setShowForm(true)
  }

  const openHistorico = async (s: Sinistro) => {
    const h = await getSinistroHistorico(s.id)
    setHistorico(h)
    setShowHistorico(true)
  }

  const handleSave = async () => {
    if (!form.unit || !form.data_ocorrencia || !form.tipo_sinistro) return
    setSaving(true)
    try {
      if (editing) {
        await updateSinistro(editing.id, form)
      } else {
        await createSinistro(form)
      }
      setShowForm(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const toggleDano = (dano: string) => {
    const cur = form.danos_identificados || []
    setForm((f) => ({
      ...f,
      danos_identificados: cur.includes(dano) ? cur.filter((d) => d !== dano) : [...cur, dano],
    }))
  }

  return (
    <Layout>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            <AlertTriangle size={24} className="text-brand-700 dark:text-brand-400" />
            Registro de Sinistros
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Registro e acompanhamento de sinistros de frota
          </p>
        </div>
        <button
          onClick={openCreate}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          Novo Sinistro
        </button>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar condutor ou prefixo..."
            className="input w-full pl-9"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="select w-full sm:w-56"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="py-20 text-center text-gray-400">Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="py-20 text-center text-gray-400">Nenhum sinistro encontrado</div>
      ) : (
        <div className="table-wrapper">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                {['Número', 'Data', 'Unidade', 'Prefixo', 'Condutor', 'Tipo', 'Status', 'Ações'].map((h) => (
                  <th key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.numero || `#${s.id}`}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {new Date(s.data_ocorrencia + 'T00:00').toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{s.unit}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{s.prefixo || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{s.condutor_nome || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{s.tipo_sinistro}</td>
                  <td className="px-4 py-3">
                    <span className={STATUS_COLOR[s.status]}>
                      {STATUS_LABEL[s.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(s)} className="text-xs text-brand-600 hover:underline dark:text-brand-400">
                        Editar
                      </button>
                      <button onClick={() => openHistorico(s)} className="text-xs text-gray-500 hover:underline">
                        Histórico
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Formulário */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 pt-10 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-modal dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {editing ? `Editar Sinistro ${editing.numero || `#${editing.id}`}` : 'Novo Sinistro'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 block">
                  <span className="text-xs font-medium text-gray-500">Unidade *</span>
                  <input value={form.unit || ''} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                    className="input w-full mt-1" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Empresa</span>
                  <input value={form.empresa || ''} onChange={(e) => setForm((f) => ({ ...f, empresa: e.target.value }))}
                    className="input w-full mt-1" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Prefixo</span>
                  <input value={form.prefixo || ''} onChange={(e) => setForm((f) => ({ ...f, prefixo: e.target.value }))}
                    className="input w-full mt-1" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Placa</span>
                  <input value={form.placa || ''} onChange={(e) => setForm((f) => ({ ...f, placa: e.target.value }))}
                    className="input w-full mt-1" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Modelo</span>
                  <input value={form.modelo || ''} onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))}
                    className="input w-full mt-1" />
                </label>
              </div>

              <div className="border-t border-gray-100 pt-3 dark:border-gray-800">
                <p className="section-title mb-2">Condutor</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="col-span-2 block">
                    <span className="text-xs font-medium text-gray-500">Nome</span>
                    <input value={form.condutor_nome || ''} onChange={(e) => setForm((f) => ({ ...f, condutor_nome: e.target.value }))}
                      className="input w-full mt-1" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500">Matrícula</span>
                    <input value={form.condutor_matricula || ''} onChange={(e) => setForm((f) => ({ ...f, condutor_matricula: e.target.value }))}
                      className="input w-full mt-1" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500">Tempo na Empresa</span>
                    <input value={form.condutor_tempo_empresa || ''} onChange={(e) => setForm((f) => ({ ...f, condutor_tempo_empresa: e.target.value }))}
                      className="input w-full mt-1" placeholder="ex: 2 anos" />
                  </label>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3 dark:border-gray-800">
                <p className="section-title mb-2">Ocorrência</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500">Data *</span>
                    <input type="date" value={form.data_ocorrencia || ''} onChange={(e) => setForm((f) => ({ ...f, data_ocorrencia: e.target.value }))}
                      className="input w-full mt-1" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500">Hora</span>
                    <input type="time" value={form.hora_ocorrencia || ''} onChange={(e) => setForm((f) => ({ ...f, hora_ocorrencia: e.target.value }))}
                      className="input w-full mt-1" />
                  </label>
                  <label className="col-span-2 block">
                    <span className="text-xs font-medium text-gray-500">Local</span>
                    <input value={form.local_ocorrencia || ''} onChange={(e) => setForm((f) => ({ ...f, local_ocorrencia: e.target.value }))}
                      className="input w-full mt-1" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500">Cidade</span>
                    <input value={form.cidade || ''} onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))}
                      className="input w-full mt-1" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500">Estado</span>
                    <input value={form.estado || ''} onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}
                      maxLength={2} placeholder="SP" className="input w-full mt-1" />
                  </label>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3 dark:border-gray-800">
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Tipo de Sinistro *</span>
                  <select value={form.tipo_sinistro || ''} onChange={(e) => setForm((f) => ({ ...f, tipo_sinistro: e.target.value }))}
                    className="input w-full mt-1">
                    <option value="">Selecione...</option>
                    {TIPOS_SINISTRO.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-gray-500">Descrição</span>
                <textarea value={form.descricao || ''} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                  rows={3} className="input w-full mt-1 resize-none" />
              </label>

              <div>
                <p className="section-title mb-2">Danos Identificados</p>
                <div className="flex flex-wrap gap-2">
                  {DANOS_COMUNS.map((d) => {
                    const selected = (form.danos_identificados || []).includes(d)
                    return (
                      <button key={d} type="button" onClick={() => toggleDano(d)}
                        className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                          selected
                            ? 'bg-brand-700 text-white border-brand-700'
                            : 'border-gray-200 text-gray-600 hover:border-brand-400 dark:border-gray-700 dark:text-gray-400'
                        }`}>
                        {d}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Análise de risco (Fase 2) */}
              <div className="border-t border-gray-100 pt-3 dark:border-gray-800">
                <p className="section-title mb-2">Análise de risco</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500">Gravidade</span>
                    <select value={form.gravidade || ''} onChange={(e) => setForm((f) => ({ ...f, gravidade: e.target.value }))} className="input w-full mt-1">
                      <option value="">—</option>
                      <option value="1">1 - Leve</option>
                      <option value="2">2 - Moderada</option>
                      <option value="3">3 - Grave</option>
                      <option value="4">4 - Gravíssima</option>
                      <option value="5">5 - Catastrófica</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500">Probabilidade</span>
                    <select value={form.probabilidade || ''} onChange={(e) => setForm((f) => ({ ...f, probabilidade: e.target.value }))} className="input w-full mt-1">
                      <option value="">—</option>
                      <option value="1">1 - Rara</option>
                      <option value="2">2 - Improvável</option>
                      <option value="3">3 - Possível</option>
                      <option value="4">4 - Provável</option>
                      <option value="5">5 - Frequente</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500">Turno</span>
                    <select value={form.turno || ''} onChange={(e) => setForm((f) => ({ ...f, turno: e.target.value }))} className="input w-full mt-1">
                      <option value="">—</option>
                      <option value="Madrugada">Madrugada</option>
                      <option value="Manha">Manhã</option>
                      <option value="Tarde">Tarde</option>
                      <option value="Noite">Noite</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500">Fator contribuinte</span>
                    <input value={form.fator_contribuinte || ''} onChange={(e) => setForm((f) => ({ ...f, fator_contribuinte: e.target.value }))} className="input w-full mt-1" placeholder="Ex: Distração" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500">Responsabilidade</span>
                    <select value={form.responsabilidade || ''} onChange={(e) => setForm((f) => ({ ...f, responsabilidade: e.target.value }))} className="input w-full mt-1">
                      <option value="">—</option>
                      <option value="propria">Própria</option>
                      <option value="terceiro">Terceiro</option>
                      <option value="indefinida">Indefinida</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500">Custo final (R$)</span>
                    <input type="number" step="0.01" value={form.custo_final ?? ''} onChange={(e) => setForm((f) => ({ ...f, custo_final: e.target.value === '' ? null : Number(e.target.value) }))} className="input w-full mt-1" />
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <input type="checkbox" checked={!!form.houve_vitima} onChange={(e) => setForm((f) => ({ ...f, houve_vitima: e.target.checked }))} /> Houve vítima
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <input type="checkbox" checked={!!form.houve_terceiro} onChange={(e) => setForm((f) => ({ ...f, houve_terceiro: e.target.checked }))} /> Envolveu terceiro
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <input type="checkbox" checked={!!form.houve_afastamento} onChange={(e) => setForm((f) => ({ ...f, houve_afastamento: e.target.checked }))} /> Houve afastamento
                  </label>
                </div>
              </div>

              {/* Plano de ação (Fase 2) */}
              <div className="border-t border-gray-100 pt-3 dark:border-gray-800">
                <p className="section-title mb-2">Plano de ação</p>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Tratativa / ação corretiva</span>
                  <textarea value={form.tratativa_acao || ''} onChange={(e) => setForm((f) => ({ ...f, tratativa_acao: e.target.value }))} rows={2} className="input w-full mt-1 resize-none" />
                </label>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500">Responsável</span>
                    <input value={form.responsavel_acao || ''} onChange={(e) => setForm((f) => ({ ...f, responsavel_acao: e.target.value }))} className="input w-full mt-1" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500">Prazo</span>
                    <input type="date" value={form.prazo_acao || ''} onChange={(e) => setForm((f) => ({ ...f, prazo_acao: e.target.value }))} className="input w-full mt-1" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500">Status da ação</span>
                    <select value={form.status_acao || ''} onChange={(e) => setForm((f) => ({ ...f, status_acao: e.target.value }))} className="input w-full mt-1">
                      <option value="">—</option>
                      <option value="pendente">Pendente</option>
                      <option value="em_andamento">Em andamento</option>
                      <option value="concluida">Concluída</option>
                    </select>
                  </label>
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-gray-500">Status</span>
                <select value={form.status || 'aberto'} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as SinistroStatus }))}
                  className="input w-full mt-1">
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
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Histórico */}
      {showHistorico && (
        <div className="modal-overlay">
          <div className="modal-box max-w-lg p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Histórico de Alterações</h2>
              <button onClick={() => setShowHistorico(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            {historico.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum histórico</p>
            ) : (
              <ol className="space-y-3 max-h-80 overflow-y-auto">
                {historico.map((h) => (
                  <li key={h.id} className="text-sm border-l-2 border-brand-200 pl-3 dark:border-brand-700">
                    <p className="text-gray-500 text-xs">{parseApiDate(h.created_at).toLocaleString('pt-BR')}</p>
                    <p className="text-gray-700 dark:text-gray-300">
                      {h.descricao || `${h.campo}: ${h.valor_anterior} → ${h.valor_novo}`}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}
