import { useEffect, useState } from 'react'
import { Layout } from '../components/Layout'
import api from '../api/client'
import { formatCpf } from '../utils/cpf'

interface User {
  id: number
  name: string
  email: string
  role: 'operator' | 'supervisor' | 'admin'
  is_active: boolean
  must_change_password: boolean
  can_delete_history: boolean
  created_at: string
}

const roleBadge = {
  operator: 'bg-gray-100 text-gray-700',
  supervisor: 'bg-blue-100 text-blue-700',
  admin: 'bg-purple-100 text-purple-700',
}

export function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ cpf: '', email: '', name: '', password: '', role: 'operator', must_change_password: true })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/auth/users')
      setUsers(res.data)
    } catch {
      setError('Erro ao carregar usuários. Verifique se você tem permissão de admin.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleToggle = async (id: number) => {
    try {
      const res = await api.patch(`/auth/users/${id}/toggle`)
      setUsers(prev => prev.map(u => u.id === id ? res.data : u))
    } catch { alert('Erro ao alterar status do usuário') }
  }

  const handleChangeRole = async (id: number, role: string) => {
    try {
      const res = await api.patch(`/auth/users/${id}/role`, null, { params: { role } })
      setUsers(prev => prev.map(u => u.id === id ? res.data : u))
    } catch { alert('Erro ao alterar papel do usuário') }
  }

  const handleHistoryPermission = async (id: number, canDeleteHistory: boolean) => {
    try {
      const res = await api.patch(`/auth/users/${id}/history-permission`, null, { params: { can_delete_history: canDeleteHistory } })
      setUsers(prev => prev.map(u => u.id === id ? res.data : u))
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Erro ao alterar permissao de historico')
    }
  }

  const handleCreate = async () => {
    if (!form.cpf || !form.name || !form.email || !form.password) {
      setFormError('Preencha todos os campos obrigatórios')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await api.post('/auth/users', form)
      setModal(false)
      setForm({ cpf: '', email: '', name: '', password: '', role: 'operator', must_change_password: true })
      await load()
    } catch (e: any) {
      setFormError(e?.response?.data?.detail || 'Erro ao cadastrar usuário')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Gestão de Usuários</h1>
        <button onClick={() => setModal(true)}
          className="bg-purple-700 text-white px-4 py-2 rounded text-sm hover:bg-purple-800">
          + Novo Usuário
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-3 bg-red-50 p-3 rounded">{error}</p>}

      {loading ? <p className="text-gray-500 py-8 text-center">Carregando...</p> : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="px-4 py-2 border">Nome</th>
                <th className="px-4 py-2 border">E-mail</th>
                <th className="px-4 py-2 border">Papel</th>
                <th className="px-4 py-2 border">Status</th>
                <th className="px-4 py-2 border">Senha</th>
                <th className="px-4 py-2 border">Histórico</th>
                <th className="px-4 py-2 border">Cadastrado em</th>
                <th className="px-4 py-2 border">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2 border font-medium">{u.name}</td>
                  <td className="px-4 py-2 border text-gray-600">{u.email}</td>
                  <td className="px-4 py-2 border">
                    <select
                      value={u.role}
                      onChange={e => handleChangeRole(u.id, e.target.value)}
                      className={`text-xs px-2 py-0.5 rounded border font-medium ${roleBadge[u.role]} cursor-pointer`}
                    >
                      <option value="operator">Operador</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-2 border">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-2 border">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${u.must_change_password ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>
                      {u.must_change_password ? 'Temporaria' : 'Definida'}
                    </span>
                  </td>
                  <td className="px-4 py-2 border">
                    <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={u.can_delete_history}
                        onChange={e => handleHistoryPermission(u.id, e.target.checked)}
                      />
                      Apagar/recuperar
                    </label>
                  </td>
                  <td className="px-4 py-2 border text-xs text-gray-500">
                    {new Date(u.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-2 border">
                    <button onClick={() => handleToggle(u.id)}
                      className={`text-xs hover:underline ${u.is_active ? 'text-red-600' : 'text-green-600'}`}>
                      {u.is_active ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-xs text-gray-400 border-t">{users.length} usuário(s) cadastrado(s)</p>
        </div>
      )}

      {/* Modal Novo Usuário */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">Novo Usuário</h2>
            {formError && <p className="text-red-600 text-sm mb-3 bg-red-50 p-2 rounded">{formError}</p>}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">CPF *</label>
                <input value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: formatCpf(e.target.value) }))}
                  className="w-full border rounded px-3 py-2 text-sm" placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nome *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">E-mail *</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Senha * (mín. 8 caracteres)</label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Papel</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm">
                  <option value="operator">Operador</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => { setModal(false); setFormError(null) }}
                  className="px-4 py-2 text-sm border rounded hover:bg-gray-100">Cancelar</button>
                <button onClick={handleCreate} disabled={saving}
                  className="px-4 py-2 text-sm bg-purple-700 text-white rounded hover:bg-purple-800 disabled:opacity-50">
                  {saving ? 'Cadastrando...' : 'Cadastrar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
