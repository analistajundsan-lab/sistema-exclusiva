import { useState, useRef, useEffect } from 'react'
import { Layout } from '../components/Layout'
import { useAuthStore } from '../store/auth'
import api from '../api/client'

export function Profile() {
  const { userName, displayName, photoUrl, setUserProfile, userId } = useAuthStore()
  const [form, setForm] = useState({ display_name: displayName || '', photo_url: photoUrl || '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setForm({ display_name: displayName || '', photo_url: photoUrl || '' })
  }, [displayName, photoUrl])

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setError('Foto muito grande. Máximo 2MB.'); return }
    const reader = new FileReader()
    reader.onload = () => setForm(f => ({ ...f, photo_url: reader.result as string }))
    reader.readAsDataURL(file)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await api.patch('/auth/profile', {
        display_name: form.display_name || null,
        photo_url: form.photo_url || null,
      })
      setUserProfile({
        id: userId!,
        name: userName!,
        display_name: res.data.display_name,
        photo_url: res.data.photo_url,
        unit: res.data.unit,
      })
      setSaved(true)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Erro ao salvar perfil.')
    } finally {
      setSaving(false)
    }
  }

  const initials = (displayName || userName || 'U').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <Layout>
      <div className="max-w-lg mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Meu Perfil</h1>

        <div className="bg-white rounded-xl shadow p-6 space-y-6">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {form.photo_url ? (
                <img src={form.photo_url} alt="Foto de perfil" className="w-24 h-24 rounded-full object-cover border-2 border-brand-200" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-brand-700 flex items-center justify-center text-white text-2xl font-bold">
                  {initials}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute bottom-0 right-0 bg-white border border-gray-300 rounded-full p-1.5 shadow hover:bg-gray-50"
                title="Alterar foto"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            {form.photo_url && (
              <button type="button" onClick={() => setForm(f => ({ ...f, photo_url: '' }))} className="text-xs text-red-500 hover:underline">
                Remover foto
              </button>
            )}
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome no sistema</label>
              <input
                type="text"
                value={form.display_name}
                onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                placeholder={userName || 'Seu nome'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                maxLength={255}
              />
              <p className="text-xs text-gray-500 mt-1">Deixe em branco para usar o nome padrão do cadastro.</p>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}
            {saved && <p className="text-green-600 text-sm font-medium">Perfil atualizado com sucesso!</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-brand-700 text-white py-2 rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  )
}
