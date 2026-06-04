import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, ShieldAlert } from 'lucide-react'
import { getPublicSafetyChecklist, PublicSafetyChecklist as Checklist, submitPublicSafetyChecklist } from '../hooks/useSafety'

type AnswerValue = 'ok' | 'not_ok' | 'na'

export function PublicSafetyChecklist() {
  const { token = '' } = useParams()
  const [data, setData] = useState<Checklist | null>(null)
  const [driverName, setDriverName] = useState('')
  const [registration, setRegistration] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [answers, setAnswers] = useState<Record<number, { answer: AnswerValue; observation: string }>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ status: string; message: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getPublicSafetyChecklist(token)
      .then(checklist => {
        setData(checklist)
        const initial: Record<number, { answer: AnswerValue; observation: string }> = {}
        checklist.items.forEach(item => { initial[item.id] = { answer: 'ok', observation: '' } })
        setAnswers(initial)
      })
      .catch(() => setError('Check-list nao encontrado ou inativo.'))
      .finally(() => setLoading(false))
  }, [token])

  const blockingCount = useMemo(() => {
    if (!data) return 0
    return data.items.filter(item => item.severity === 'blocking' && answers[item.id]?.answer === 'not_ok').length
  }, [answers, data])

  const setAnswer = (itemId: number, answer: AnswerValue) => {
    setAnswers(prev => ({ ...prev, [itemId]: { ...prev[itemId], answer } }))
  }

  const setObservation = (itemId: number, observation: string) => {
    setAnswers(prev => ({ ...prev, [itemId]: { ...prev[itemId], observation } }))
  }

  const handleSubmit = async () => {
    if (!data) return
    setError('')
    if (driverName.trim().length < 3 || !registration.trim()) {
      setError('Informe nome do motorista e matricula.')
      return
    }
    if (!accepted) {
      setError('Aceite a declaracao para enviar.')
      return
    }
    setSubmitting(true)
    try {
      const response = await submitPublicSafetyChecklist(token, {
        driver_name: driverName,
        driver_registration: registration,
        declaration_accepted: accepted,
        answers: data.items.map(item => ({
          item_id: item.id,
          answer: answers[item.id]?.answer || 'ok',
          observation: answers[item.id]?.observation || undefined,
        })),
      })
      setResult({ status: response.overall_status, message: response.message })
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Erro ao enviar check-list.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <PublicShell><Loader2 className="animate-spin text-brand-700" /></PublicShell>
  }

  if (error && !data) {
    return <PublicShell><p className="text-sm text-red-600">{error}</p></PublicShell>
  }

  if (result) {
    const blocking = result.status === 'blocking'
    return (
      <PublicShell>
        <div className={`rounded-lg border p-5 ${blocking ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
          {blocking ? <ShieldAlert size={28} /> : <CheckCircle2 size={28} />}
          <h1 className="mt-3 text-xl font-bold">{blocking ? 'Bloqueio registrado' : 'Check-list registrado'}</h1>
          <p className="mt-2 text-sm">{result.message}</p>
        </div>
      </PublicShell>
    )
  }

  return (
    <PublicShell>
      <div className="mb-5">
        <div className="flex items-center gap-2 text-brand-700">
          <ClipboardCheck size={22} />
          <p className="text-sm font-semibold">Seguranca do Trabalho</p>
        </div>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Check-list diario</h1>
        <p className="text-sm text-gray-500">Prefixo {data?.vehicle.prefix} - {data?.vehicle.unit}</p>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Nome do motorista</span>
          <input value={driverName} onChange={e => setDriverName(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-3 text-base" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Matricula</span>
          <input value={registration} onChange={e => setRegistration(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-3 text-base" />
        </label>
      </div>

      <div className="mt-5 space-y-3">
        {data?.items.map(item => {
          const selected = answers[item.id]?.answer || 'ok'
          return (
            <section key={item.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start gap-2">
                {item.severity === 'blocking' && <AlertTriangle size={16} className="mt-0.5 text-red-600" />}
                <h2 className="text-sm font-semibold text-gray-900">{item.position}. {item.item_text}</h2>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(['ok', 'not_ok', 'na'] as AnswerValue[]).map(value => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAnswer(item.id, value)}
                    className={`rounded-lg border px-2 py-2 text-sm font-semibold ${selected === value ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-200 bg-gray-50 text-gray-700'}`}
                  >
                    {value === 'ok' ? 'Sim' : value === 'not_ok' ? 'Nao' : 'N/A'}
                  </button>
                ))}
              </div>
              {selected === 'not_ok' && (
                <textarea
                  value={answers[item.id]?.observation || ''}
                  onChange={e => setObservation(item.id, e.target.value)}
                  placeholder="Observacao"
                  className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
                  rows={2}
                />
              )}
            </section>
          )
        })}
      </div>

      <label className="mt-5 flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} className="mt-1 h-5 w-5" />
        <span className="text-sm text-gray-700">Declaro que as informacoes preenchidas sao verdadeiras e que estou ciente da responsabilidade antes do inicio da jornada.</span>
      </label>

      {blockingCount > 0 && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">
          Ha {blockingCount} item(ns) bloqueante(s) marcado(s) como Nao.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-5 w-full rounded-lg bg-brand-700 px-4 py-3 text-base font-bold text-white disabled:opacity-60"
      >
        {submitting ? 'Enviando...' : 'Enviar check-list'}
      </button>
    </PublicShell>
  )
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto max-w-xl">{children}</div>
    </main>
  )
}
