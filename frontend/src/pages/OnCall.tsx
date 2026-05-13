import { useMemo, useState } from 'react'
import { Layout } from '../components/Layout'
import { ScheduleFilters, ScheduleLine, useSchedule } from '../hooks/useSchedule'
import { useSwaps } from '../hooks/useSwaps'
import { DEFAULT_OPERATION_DATE } from '../config/demo'
import { useAuthStore } from '../store/auth'

const units = ['Caieiras', 'Jundiai', 'Santana de Parnaiba']

export function OnCall() {
  const userUnit = useAuthStore(s => s.userUnit)
  const role = useAuthStore(s => s.role)

  const [filters, setFilters] = useState<ScheduleFilters>({
    schedule_date: DEFAULT_OPERATION_DATE,
    unit: userUnit || 'Caieiras',
    status: 'pendente',
  })
  const [autoMode, setAutoMode] = useState(true)

  const pendingFilters = useMemo(() => ({
    ...filters,
    ...(autoMode ? { start_in_minutes: '40' } : {}),
  }), [filters, autoMode])

  const historyFilters = useMemo(() => ({
    schedule_date: filters.schedule_date,
    unit: filters.unit,
    status: 'confirmada',
  }), [filters.schedule_date, filters.unit])

  const pending = useSchedule(pendingFilters)
  const history = useSchedule(historyFilters)
  const swaps = useSwaps({ unit: filters.unit })
  const canManageLines = role === 'admin' || role === 'supervisor'
  const [swapLine, setSwapLine] = useState<ScheduleLine | null>(null)
  const [swapForm, setSwapForm] = useState({ vehicle_in: '', reason: '' })
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [lastSwapText, setLastSwapText] = useState<string | null>(null)
  const [statusLine, setStatusLine] = useState<{ line: ScheduleLine; action: 'cancel' | 'undo' } | null>(null)
  const [statusReason, setStatusReason] = useState('')

  const handleFilter = (event: React.FormEvent) => {
    event.preventDefault()
    pending.applyFilters(pendingFilters)
    history.applyFilters(historyFilters)
  }

  const handleConfirm = async (id: number) => {
    setActionError(null)
    setActionMessage(null)
    try {
      await pending.confirmLine(id)
      await history.refetch(historyFilters, 0)
      setActionMessage('Linha confirmada e enviada ao historico do dia.')
    } catch (e: any) {
      setActionError(e?.response?.data?.detail || 'Nao foi possivel confirmar a linha.')
    }
  }

  const handleCreateSwap = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!swapLine) return
    setActionError(null)
    setActionMessage(null)
    try {
      const created = await swaps.createSwap({
        schedule_line_id: swapLine.id,
        vehicle_out: swapLine.prefix_code,
        vehicle_in: swapForm.vehicle_in,
        reason: swapForm.reason,
        lines_covered: `${swapLine.direction} - ${swapLine.line_code}`,
      } as any)
      if (created.whatsapp_text) {
        await navigator.clipboard?.writeText(created.whatsapp_text)
        setLastSwapText(created.whatsapp_text)
      }
      setActionMessage('Troca registrada. Texto copiado — clique em Abrir WhatsApp para enviar.')
      setSwapLine(null)
      setSwapForm({ vehicle_in: '', reason: '' })
    } catch (e: any) {
      setActionError(e?.response?.data?.detail || 'Nao foi possivel registrar a troca.')
    }
  }

  const handleStatusChange = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!statusLine) return
    setActionError(null)
    setActionMessage(null)
    try {
      if (statusLine.action === 'cancel') {
        await pending.cancelLine(statusLine.line.id, statusReason)
      } else {
        await history.undoConfirmLine(statusLine.line.id, statusReason)
      }
      await pending.refetch(pendingFilters, 0)
      await history.refetch(historyFilters, 0)
      setActionMessage(statusLine.action === 'cancel' ? 'Linha cancelada.' : 'Confirmação desfeita.')
      setStatusLine(null)
      setStatusReason('')
    } catch (e: any) {
      setActionError(e?.response?.data?.detail || 'Nao foi possivel concluir a acao.')
    }
  }

  const handleSendWhatsApp = async () => {
    try {
      const res = await history.fetchWhatsappText(filters.schedule_date || '', filters.unit || '')
      await navigator.clipboard?.writeText(res.text)
      window.open(`https://wa.me/?text=${encodeURIComponent(res.text)}`, '_blank', 'noopener,noreferrer')
    } catch {
      alert('Erro ao gerar texto de confirmação.')
    }
  }

  const allConfirmed = !pending.loading && pending.lines.length === 0 && history.lines.length > 0

  return (
    <Layout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Painel do plantonista</h1>
          <p className="text-sm text-gray-500">Confirme as linhas da unidade e acompanhe o historico do dia.</p>
        </div>

        <form onSubmit={handleFilter} className="bg-white rounded-lg shadow p-3 grid grid-cols-1 md:grid-cols-[180px_240px_auto_auto] gap-2 items-end">
          <label className="text-xs text-gray-500">
            Data
            <input type="date" value={filters.schedule_date || ''} onChange={e => setFilters(s => ({ ...s, schedule_date: e.target.value }))}
              className="mt-1 border rounded px-2 py-2 text-sm w-full" />
          </label>
          <label className="text-xs text-gray-500">
            Unidade
            <select value={filters.unit || ''} onChange={e => setFilters(s => ({ ...s, unit: e.target.value }))}
              className="mt-1 border rounded px-2 py-2 text-sm w-full">
              {units.map(unit => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500 flex flex-col justify-end">
            <span className="mb-1">Próximas 40 min</span>
            <button
              type="button"
              onClick={() => setAutoMode(m => !m)}
              className={`relative inline-flex h-9 w-16 items-center rounded border text-xs font-medium transition-colors focus:outline-none ${autoMode ? 'bg-brand-700 border-brand-700 text-white' : 'bg-gray-100 border-gray-300 text-gray-600'}`}
            >
              <span className={`absolute left-1 transition-all ${autoMode ? 'translate-x-7' : 'translate-x-0'} inline-block w-6 h-6 rounded bg-white shadow`} />
              <span className={`pl-2 transition-opacity ${autoMode ? 'opacity-0' : 'opacity-100'}`}>Não</span>
              <span className={`pl-1 transition-opacity ${autoMode ? 'opacity-100' : 'opacity-0'}`}>Sim</span>
            </button>
          </label>
          <button type="submit" className="bg-brand-700 text-white px-4 py-2 rounded text-sm hover:bg-brand-800 self-end">
            Atualizar painel
          </button>
        </form>

        {actionMessage && (
          <div className="bg-green-50 border border-green-200 rounded px-3 py-2 flex flex-wrap items-center gap-3">
            <p className="text-green-700 text-sm flex-1">{actionMessage}</p>
            {lastSwapText && (
              <button
                onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(lastSwapText)}`, '_blank', 'noopener,noreferrer')}
                className="bg-green-600 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-green-700 whitespace-nowrap"
              >
                Abrir WhatsApp
              </button>
            )}
          </div>
        )}
        {actionError && <p className="bg-red-50 text-red-700 border border-red-200 rounded px-3 py-2 text-sm">{actionError}</p>}
        {!navigator.onLine && <p className="bg-yellow-50 text-yellow-800 border border-yellow-200 rounded px-3 py-2 text-sm">Sem conexao no momento. O painel continua aberto, mas as confirmacoes dependem da rede.</p>}

        {/* Banner de todas confirmadas */}
        {allConfirmed && (
          <div className="bg-green-50 border border-green-300 rounded-lg px-4 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-green-800 font-semibold">Todas as linhas foram confirmadas!</p>
              <p className="text-green-700 text-sm">Envie o resumo de confirmação pelo WhatsApp.</p>
            </div>
            <button
              onClick={handleSendWhatsApp}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-green-700 whitespace-nowrap"
            >
              Enviar confirmação por WhatsApp
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
          <section className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b flex justify-between items-start">
              <div>
                <h2 className="font-semibold text-gray-800">Linhas pendentes</h2>
                <p className="text-xs text-gray-500">
                  {autoMode ? 'Mostrando linhas que iniciam nos próximos 40 min.' : 'Todas as linhas pendentes da unidade.'}
                  {' '}Ao confirmar, a linha vai para o historico.
                </p>
              </div>
              <span className="text-sm font-semibold text-yellow-700">{pending.total} pendentes</span>
            </div>
            <div className="p-3 grid gap-3">
              {pending.loading && <p className="text-sm text-gray-500">Carregando linhas...</p>}
              {pending.error && <p className="text-sm text-red-600">{pending.error}</p>}
              {pending.lines.length === 0 && !pending.loading && (
                <p className="text-sm text-gray-400 text-center py-8">
                  {autoMode
                    ? 'Nenhuma linha iniciando nos próximos 40 min.'
                    : 'Nenhuma linha pendente para esta unidade.'}
                </p>
              )}
              {pending.lines.map(line => (
                <article key={line.id} className="border rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded text-sm font-semibold">{line.start_time} - {line.end_time}</span>
                      <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">{line.direction}</span>
                      <span className="font-mono text-sm font-bold">Linha {line.line_code}</span>
                    </div>
                    <h3 className="font-semibold text-gray-800">{line.client_name} · Prefixo {line.prefix_code}</h3>
                    <p className="text-sm text-gray-500">{line.route_name}</p>
                    <p className="text-xs text-gray-500 mt-1">Motorista: {line.driver_name}</p>
                  </div>
                  <button onClick={() => handleConfirm(line.id)}
                    className="bg-green-700 text-white px-5 py-4 rounded text-sm font-semibold hover:bg-green-800 min-h-12">
                    Confirmar linha
                  </button>
                  {canManageLines && (
                    <button onClick={() => setStatusLine({ line, action: 'cancel' })}
                      className="border border-red-200 text-red-700 px-5 py-4 rounded text-sm font-semibold hover:bg-red-50 min-h-12">
                      Cancelar
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>

          <aside className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b">
              <h2 className="font-semibold text-gray-800">Historico do dia</h2>
              <p className="text-xs text-gray-500">Linhas ja confirmadas nesta unidade.</p>
            </div>
            <div className="p-3 space-y-2">
              {history.lines.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">Sem confirmacoes ainda.</p>}
              {history.lines.map(line => (
                <div key={line.id} className="bg-green-50 border border-green-100 rounded p-3">
                  <div className="flex justify-between gap-2">
                    <strong className="text-sm text-green-800">Linha {line.line_code}</strong>
                    <span className="text-xs text-green-700">{line.start_time}</span>
                  </div>
                  <p className="text-xs text-green-700">Prefixo {line.prefix_code} · {line.driver_name}</p>
                  {line.confirmed_at && <p className="text-xs text-gray-500 mt-1">Confirmada: {new Date(line.confirmed_at).toLocaleString('pt-BR')}</p>}
                  <button onClick={() => setSwapLine(line)}
                    className="mt-2 w-full bg-brand-700 text-white px-3 py-2 rounded text-xs font-semibold hover:bg-brand-800">
                    Trocar carro
                  </button>
                  {canManageLines && (
                    <button onClick={() => setStatusLine({ line, action: 'undo' })}
                      className="mt-2 w-full border border-yellow-200 text-yellow-800 px-3 py-2 rounded text-xs font-semibold hover:bg-yellow-50">
                      Reabrir confirmação
                    </button>
                  )}
                </div>
              ))}
            </div>
          </aside>
        </div>

        {swapLine && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <form onSubmit={handleCreateSwap} className="bg-white rounded-lg shadow-xl p-5 w-full max-w-md">
              <h2 className="text-lg font-semibold text-gray-800 mb-1">Troca de carro</h2>
              <p className="text-sm text-gray-500 mb-4">
                Linha {swapLine.line_code} · Carro substituido {swapLine.prefix_code}
              </p>
              <label className="block text-sm text-gray-600 mb-3">
                Carro substituto
                <input value={swapForm.vehicle_in} onChange={e => setSwapForm(s => ({ ...s, vehicle_in: e.target.value }))}
                  className="mt-1 w-full border rounded px-3 py-2" required />
              </label>
              <label className="block text-sm text-gray-600 mb-4">
                Motivo
                <input value={swapForm.reason} onChange={e => setSwapForm(s => ({ ...s, reason: e.target.value }))}
                  className="mt-1 w-full border rounded px-3 py-2" placeholder="Opcional" />
              </label>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setSwapLine(null)} className="border px-4 py-2 rounded text-sm">Cancelar</button>
                <button type="submit" className="bg-green-700 text-white px-4 py-2 rounded text-sm">Salvar e copiar WhatsApp</button>
              </div>
            </form>
          </div>
        )}

        {statusLine && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <form onSubmit={handleStatusChange} className="bg-white rounded-lg shadow-xl p-5 w-full max-w-md">
              <h2 className="text-lg font-semibold text-gray-800 mb-1">
                {statusLine.action === 'cancel' ? 'Cancelar linha' : 'Reabrir confirmação'}
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Linha {statusLine.line.line_code} · Prefixo {statusLine.line.prefix_code}
              </p>
              <label className="block text-sm text-gray-600 mb-4">
                Motivo
                <input value={statusReason} onChange={e => setStatusReason(e.target.value)}
                  className="mt-1 w-full border rounded px-3 py-2" placeholder="Informe o motivo da acao" />
              </label>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setStatusLine(null)} className="border px-4 py-2 rounded text-sm">Voltar</button>
                <button type="submit" className="bg-brand-700 text-white px-4 py-2 rounded text-sm">Confirmar</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </Layout>
  )
}
