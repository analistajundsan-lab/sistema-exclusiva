import { useState, useRef, useEffect } from 'react'
import { Layout } from '../components/Layout'
import { useAuthStore } from '../store/auth'
import api from '../api/client'
import { Camera, Check, AlertCircle, User } from 'lucide-react'

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
    if (file.size > 2 * 1024 * 1024) {
      setError('Foto muito grande. Máximo 2MB.')
      return
    }
    setError(null)
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
        units: res.data.units,
      })
      setSaved(true)
      // Clear saved feedback after 3s
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Erro ao salvar perfil.')
    } finally {
      setSaving(false)
    }
  }

  const initials = (displayName || userName || 'U')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <Layout>
      <div className="min-h-[calc(100vh-4rem)] flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-6">
          {/* Page title */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Meu Perfil</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Personalize como você aparece no sistema</p>
          </div>

          {/* Avatar card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 flex flex-col items-center gap-4">
            {/* Avatar with camera overlay */}
            <div className="relative group">
              <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-white dark:border-gray-700 shadow-md ring-2 ring-brand-200 dark:ring-brand-700">
                {form.photo_url ? (
                  <img
                    src={form.photo_url}
                    alt="Foto de perfil"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-brand-700 to-brand-500 flex items-center justify-center">
                    <span className="text-white text-3xl font-bold select-none">{initials}</span>
                  </div>
                )}
              </div>

              {/* Camera overlay button */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Alterar foto"
                aria-label="Alterar foto de perfil"
              >
                <Camera className="w-6 h-6 text-white drop-shadow" />
              </button>

              {/* Small camera badge (always visible) */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 shadow flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                title="Alterar foto"
                aria-label="Alterar foto de perfil"
              >
                <Camera className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />

            {/* Name below avatar */}
            <div className="text-center">
              <p className="font-semibold text-gray-900 dark:text-gray-100 text-lg leading-tight">
                {displayName || userName || 'Usuário'}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center justify-center gap-1">
                <User className="w-3 h-3" />
                {userName}
              </p>
            </div>

            {form.photo_url && (
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, photo_url: '' }))}
                className="text-xs text-red-500 dark:text-red-400 hover:underline transition-colors"
              >
                Remover foto
              </button>
            )}
          </div>

          {/* Form card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-5">Informações</h2>

            <form onSubmit={handleSave} className="space-y-5">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
                  Nome exibido
                </label>
                <input
                  type="text"
                  value={form.display_name}
                  onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                  placeholder={userName || 'Seu nome'}
                  className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-3 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-brand-400 placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-shadow"
                  maxLength={255}
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                  Deixe em branco para usar o nome padrão do cadastro.
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl px-4 py-3 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Success */}
              {saved && (
                <div className="flex items-center gap-2.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 rounded-xl px-4 py-3 text-sm">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Perfil atualizado com sucesso!</span>
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full bg-brand-700 hover:bg-brand-800 dark:bg-brand-600 dark:hover:bg-brand-500 text-white rounded-xl px-4 py-3 font-semibold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Salvando...
                  </>
                ) : saved ? (
                  <>
                    <Check className="w-4 h-4" />
                    Salvo!
                  </>
                ) : (
                  'Salvar alterações'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  )
}
