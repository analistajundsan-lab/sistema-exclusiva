import { useEffect, useState } from 'react'
import { Layout } from '../components/Layout'
import api from '../api/client'
import { formatCpf } from '../utils/cpf'
import { Users as UsersIcon, Plus } from 'lucide-react'

interface User {
  id: number
  name: string
  email: string
  role: string
  unit?: string
  units?: string
  is_active: boolean
  must_change_password: boolean
  can_delete_history: boolean
  created_at: string
}

const ROLES = [
  { value: 'plantonista', label: 'Plantonista' },
  { value: 'analista', label: 'Analista' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'supervisao', label: 'Supervisão' },
  { value: 'tecnico_seguranca', label: 'Técnico de Segurança' },
  { value: 'engenheiro_seguranca', label: 'Engenheiro de Segurança' },
  { value: 'admin', label: 'Admin' },
  // legados (não exibidos no select de criação, mas mantidos na listagem)
  { value: 'operator', label: 'Operador (legado)' },
  { value: 'supervisor', label: 'Supervisor (legado)' },
]

const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLES.map(r => [r.value, r.label]))

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  gerente: 'bg-brand-100 text-brand-700',
  supervisao: 'bg-blue-100 text-blue-700',
  tecnico_seguranca: 'bg-emerald-100 text-emerald-700',
  analista: 'bg-amber-100 text-amber-800',
  plantonista: 'bg-gray-100 text-gray-700',
  operator: 'bg-gray-100 text-gray-500',
  supervisor: 'bg-gray-100 text-gray-500',
}

const UNITS = ['Caieiras', 'Jundiai', 'Santana de Parnaiba']

const MULTI_UNIT_ROLES = ['plantonista', 'analista', 'tecnico_seguranca', 'engenheiro_seguranca']

type ModalMode = 'create' | 'edit'

export function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({
    cpf: '',
    email: '',
    name: '',
    password: '',
    role: 'plantonista',
    unit: '',
    units: [] as string[],
    must_change_password: true,
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/auth/users')
      setUsers(res.data)
    } catch {
      setError('Erro ao carregar usuários.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const isMultiUnit = MULTI_UNIT_ROLES.includes(form.role)

  const toggleUnit = (unit: string) => {
    setForm(f => ({
      ...f,
      units: f.units.includes(unit)
        ? f.units.filter(u => u !== unit)
        : [...f.units, unit],
    }))
  }

  const parseUnits = (raw?: string): string[] =>
    raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : []

  const openCreate = () => {
    setModalMode('create')
    setEditingId(null)
    setForm({ cpf: '', email: '', name: '', password: '', role: 'plantonista', unit: '', units: [], must_change_password: true })
    setFormError(null)
    setModal(true)
  }

  const openEdit = (u: User) => {
    setModalMode('edit')
    setEditingId(u.id)
    const parsedUnits = parseUnits(u.units)
    setForm({
      cpf: '',
      email: u.email,
      name: u.name,
      password: '',
      role: u.role,
      unit: u.unit || '',
      units: parsedUnits.length > 0 ? parsedUnits : (u.unit ? [u.unit] : []),
      must_change_password: u.must_change_password,
    })
    setFormError(null)
    setModal(true)
  }

  const handleToggle = async (id: number) => {
    try {
      const res = await api.patch(`/auth/users/${id}/toggle`)
      setUsers(prev => prev.map(u => u.id === id ? res.data : u))
    } catch { alert('Erro ao alterar status do usuário') }
  }

  const buildUnitPayload = () => {
    if (isMultiUnit) {
      const joined = form.units.join(',')
      return {
        unit: form.units[0] || '',
        units: joined,
      }
    }
    return { unit: form.unit || null, units: null }
  }

  const handleCreate = async () => {
    if (!form.cpf || !form.name || !form.email || !form.password) {
      setFormError('Preencha todos os campos obrigatórios')
      return
    }
    if (isMultiUnit && form.units.length === 0) {
      setFormError('Selecione ao menos uma unidade para este perfil')
      return
    }
    if (!isMultiUnit && form.role !== 'admin' && !form.unit) {
      setFormError('Selecione a unidade do usuario')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await api.post('/auth/users', {
        cpf: form.cpf,
        email: form.email,
        name: form.name,
        password: form.password,
        role: form.role,
        must_change_password: form.must_change_password,
        ...buildUnitPayload(),
      })
      setModal(false)
      await load()
    } catch (e: any) {
      setFormError(e?.response?.data?.detail || 'Erro ao cadastrar usuário')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!form.name || !form.email) {
      setFormError('Preencha nome e e-mail')
      return
    }
    if (isMultiUnit && form.units.length === 0) {
      setFormError('Selecione ao menos uma unidade para este perfil')
      return
    }
    if (!isMultiUnit && form.role !== 'admin' && !form.unit) {
      setFormError('Selecione a unidade do usuario')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const res = await api.patch(`/auth/users/${editingId}`, {
        name: form.name,
        email: form.email,
        role: form.role,
        ...buildUnitPayload(),
      })
      setUsers(prev => prev.map(u => u.id === editingId ? res.data : u))
      setModal(false)
    } catch (e: any) {
      setFormError(e?.response?.data?.detail || 'Erro ao editar usuário')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = () => modalMode === 'create' ? handleCreate() : handleEdit()

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <UsersIcon size={22} className="text-purple-600 dark:text-purple-400" />
          Gestão de Usuários
        </h1>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-purple-700 hover:bg-purple-800 dark:bg-purple-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all">
          <Plus size={16} />
          Novo Usuário
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-3 bg-red-50 p-3 rounded">{error}</p>}

      {loading ? <p className="text-gray-500 py-8 text-center">Carregando...</p> : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-700 text-left">
                <th className="px-4 py-2 border dark:border-gray-600 text-gray-700 dark:text-gray-200">Nome</th>
                <th className="px-4 py-2 border dark:border-gray-600 text-gray-700 dark:text-gray-200">E-mail</th>
                <th className="px-4 py-2 border dark:border-gray-600 text-gray-700 dark:text-gray-200">Unidade(s)</th>
                <th className="px-4 py-2 border dark:border-gray-600 text-gray-700 dark:text-gray-200">Cargo</th>
                <th className="px-4 py-2 border dark:border-gray-600 text-gray-700 dark:text-gray-200">Status</th>
                <th className="px-4 py-2 border dark:border-gray-600 text-gray-700 dark:text-gray-200">Senha</th>
                <th className="px-4 py-2 border dark:border-gray-600 text-gray-700 dark:text-gray-200">Cadastrado</th>
                <th className="px-4 py-2 border dark:border-gray-600 text-gray-700 dark:text-gray-200">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const allUnits = parseUnits(u.units).length > 0
                  ? parseUnits(u.units).join(', ')
                  : (u.unit || '—')
                return (
                  <tr key={u.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${!u.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2 border dark:border-gray-600 font-medium text-gray-900 dark:text-gray-100">{u.name}</td>
                    <td className="px-4 py-2 border dark:border-gray-600 text-gray-600 dark:text-gray-300">{u.email}</td>
                    <td className="px-4 py-2 border dark:border-gray-600 text-gray-600 dark:text-gray-300 text-xs">{allUnits}</td>
                    <td className="px-4 py-2 border dark:border-gray-600">
                      <span className={`text-xs px-2 py-0.5 rounded border font-medium ${ROLE_BADGE[u.role] || 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_LABEL[u.role] || u.role}
                      </span>
                    </td>
                    <td className="px-4 py-2 border dark:border-gray-600">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {u.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-2 border dark:border-gray-600">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${u.must_change_password ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200'}`}>
                        {u.must_change_password ? 'Temporária' : 'Definida'}
                      </span>
                    </td>
                    <td className="px-4 py-2 border dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400">
                      {new Date(u.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    </td>
                    <td className="px-4 py-2 border dark:border-gray-600">
                      <div className="flex flex-col gap-1">
                        <button onClick={() => openEdit(u)} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">Editar</button>
                        <button onClick={() => handleToggle(u.id)}
                          className={`text-xs hover:underline ${u.is_active ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                          {u.is_active ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500 border-t dark:border-gray-700">{users.length} usuário(s)</p>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
              {modalMode === 'create' ? 'Novo Usuário' : 'Editar Usuário'}
            </h2>
            {formError && <p className="text-red-600 dark:text-red-400 text-sm mb-3 bg-red-50 dark:bg-red-900/20 p-2 rounded">{formError}</p>}
            <div className="space-y-3">
              {modalMode === 'create' && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">CPF *</label>
                  <input value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: formatCpf(e.target.value) }))}
                    className="w-full border dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Nome *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">E-mail *</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
              </div>
              {modalMode === 'create' && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Senha * (min. 12 caracteres)</label>
                  <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full border dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Cargo</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value, units: [], unit: '' }))}
                  className="w-full border dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                  <option value="plantonista">Plantonista</option>
                  <option value="analista">Analista</option>
                  <option value="gerente">Gerente</option>
                  <option value="supervisao">Supervisão</option>
                  <option value="tecnico_seguranca">Técnico de Segurança</option>
                  <option value="engenheiro_seguranca">Engenheiro de Segurança</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {/* Seleção de unidade(s) */}
              {isMultiUnit ? (
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Unidades (pode selecionar mais de uma)</label>
                  <div className="space-y-2">
                    {UNITS.map(u => (
                      <label key={u} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.units.includes(u)}
                          onChange={() => toggleUnit(u)}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{u}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Unidade</label>
                  <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                    className="w-full border dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                    <option value="">Sem unidade definida</option>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => { setModal(false); setFormError(null) }}
                  className="px-4 py-2 text-sm border dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Cancelar</button>
                <button onClick={handleSubmit} disabled={saving}
                  className="px-4 py-2 text-sm bg-purple-700 text-white rounded hover:bg-purple-800 disabled:opacity-50">
                  {saving
                    ? (modalMode === 'create' ? 'Cadastrando...' : 'Salvando...')
                    : (modalMode === 'create' ? 'Cadastrar' : 'Salvar')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
