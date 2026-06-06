import { useState, useEffect } from 'react'
import api from '../api/client'
import QRCode from 'qrcode'
import { ShieldCheck, ShieldOff, AlertCircle, Check } from 'lucide-react'

export function MfaCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [secret, setSecret] = useState('')
  const [qr, setQr] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    api
      .get('/auth/me')
      .then(r => setEnabled(!!r.data.mfa_enabled))
      .catch(() => setEnabled(false))
  }, [])

  const onCode = (v: string) => setCode(v.replace(/\D/g, '').slice(0, 6))

  const startSetup = async () => {
    setError(null); setMsg(null); setBusy(true)
    try {
      const r = await api.post('/auth/mfa/setup')
      setSecret(r.data.secret)
      setQr(await QRCode.toDataURL(r.data.otpauth_uri, { margin: 1, width: 200 }))
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Erro ao iniciar a configuração.')
    } finally {
      setBusy(false)
    }
  }

  const enable = async () => {
    setError(null); setBusy(true)
    try {
      await api.post('/auth/mfa/enable', { code })
      setEnabled(true); setSecret(''); setQr(''); setCode(''); setMsg('MFA ativado com sucesso!')
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Código inválido.')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setError(null); setBusy(true)
    try {
      await api.post('/auth/mfa/disable', { code })
      setEnabled(false); setCode(''); setMsg('MFA desativado.')
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Código inválido.')
    } finally {
      setBusy(false)
    }
  }

  const cancelSetup = () => { setSecret(''); setQr(''); setCode(''); setError(null) }

  const codeInput = (
    <input
      type="text"
      value={code}
      onChange={e => onCode(e.target.value)}
      placeholder="000000"
      inputMode="numeric"
      maxLength={6}
      className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-3 text-center text-xl tracking-[0.4em] font-semibold w-full focus:outline-none focus:ring-2 focus:ring-brand-500"
    />
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-5 h-5 text-brand-700 dark:text-brand-400" />
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
          Verificação em duas etapas (MFA)
        </h2>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
        Adicione uma camada extra de segurança usando um app autenticador
        (Google Authenticator, Authy, etc.).
      </p>

      {error && (
        <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl px-4 py-3 text-sm mb-4">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {msg && (
        <div className="flex items-center gap-2.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 rounded-xl px-4 py-3 text-sm mb-4">
          <Check className="w-4 h-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      {enabled === null && (
        <p className="text-sm text-gray-400">Carregando...</p>
      )}

      {/* Ativo */}
      {enabled === true && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
            <ShieldCheck className="w-4 h-4" /> MFA está ativo nesta conta.
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Para desativar, informe um código atual do seu app autenticador.
          </p>
          {codeInput}
          <button
            type="button"
            onClick={disable}
            disabled={busy || code.length < 6}
            className="w-full bg-red-600 hover:bg-red-700 text-white rounded-xl px-4 py-3 font-semibold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <ShieldOff className="w-4 h-4" /> {busy ? 'Desativando...' : 'Desativar MFA'}
          </button>
        </div>
      )}

      {/* Inativo, sem setup iniciado */}
      {enabled === false && !secret && (
        <button
          type="button"
          onClick={startSetup}
          disabled={busy}
          className="w-full bg-brand-700 hover:bg-brand-800 dark:bg-brand-600 dark:hover:bg-brand-500 text-white rounded-xl px-4 py-3 font-semibold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <ShieldCheck className="w-4 h-4" /> {busy ? 'Aguarde...' : 'Ativar MFA'}
        </button>
      )}

      {/* Inativo, setup em andamento (QR + confirmação) */}
      {enabled === false && secret && (
        <div className="space-y-4">
          <ol className="text-sm text-gray-600 dark:text-gray-300 list-decimal list-inside space-y-1">
            <li>Escaneie o QR Code no seu app autenticador.</li>
            <li>Digite o código de 6 dígitos gerado para confirmar.</li>
          </ol>
          {qr && (
            <div className="flex justify-center">
              <img src={qr} alt="QR Code MFA" className="rounded-lg border border-gray-200 dark:border-gray-700" />
            </div>
          )}
          <div className="text-center">
            <p className="text-xs text-gray-400 dark:text-gray-500">Ou informe manualmente:</p>
            <code className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">{secret}</code>
          </div>
          {codeInput}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={enable}
              disabled={busy || code.length < 6}
              className="flex-1 bg-brand-700 hover:bg-brand-800 text-white rounded-xl px-4 py-3 font-semibold text-sm transition-all disabled:opacity-60"
            >
              {busy ? 'Confirmando...' : 'Confirmar e ativar'}
            </button>
            <button
              type="button"
              onClick={cancelSetup}
              className="px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400 hover:underline"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
