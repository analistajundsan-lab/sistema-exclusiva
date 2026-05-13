import { useMemo, useState } from 'react'
import { Layout } from '../components/Layout'
import { ScheduleFilters, ScheduleLine, useSchedule } from '../hooks/useSchedule'
import { useSwaps } from '../hooks/useSwaps'
import { DEFAULT_OPERATION_DATE } from '../config/demo'
import { useAuthStore } from '../store/auth'

const ALL_UNITS = ['Caieiras', 'Jundiai', 'Santana de Parnaiba']

export function OnCall() {
  const userUnit = useAuthStore(s => s.userUnit)
  const userUnits = useAuthStore(s => s.userUnits)
  const role = useAuthStore(s => s.role)

  // Unidades disponíveis para este usuário
  const availableUnits = useMemo(() => {
    if (userUnits && userUnits.length > 0) return userUnits
    if (userUnit) return [userUnit]
    return ALL_UNITS
  }, [userUnit, userUnits])

  const [filters, setFilters] = useState<ScheduleFilters>({
    schedule_date: DEFAULT_OPERATION_DATE,
    unit: availableUnits[0] || 'Caieiras',
    status: 'pendente',
  })
  const [autoMode, setAutoMode] = useState(true)

  const pendingFilters = useMemo(() => ({
    ...filters,
    ...(autoMode ? { start_in_minutes: '40' } : {}),
  }), [filters, autoMode])

  const pending = useSchedule(pendingFilters)
  const swapsList = useSwaps({ unit: filters.unit })
  const canManageLines = role === 'admin' || role === 'gerente' || role === 'supervisao' || role === 'supervisor'

  // Estado do card com troca inline aberta
  const [swapOpenId, setSwapOpenId] = useState<number | null>(null)
  const [swapVehicle, setSwapVehicle] = useState('')
  const [swapReason, setSwapReason] = useState('')
  const [swapSaving, setSwapSaving] = useState(false)

  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const [statusLine, setStatusLine] = useState<{ line: ScheduleLine; action: 'cancel' } | null>(null)
  const [statusReason, setStatusReason] = useState('')

  const handleFilter = (event: React.FormEvent) => {
    event.preventDefault()
    pending.applyFilters(pendingFilters)
  }

  const handleConfirm = async (id: number) => {
    setActionError(null)
    setActionMessage(null)
    try {
      await pending.confirmLine(id)
      setActionMessage('Linha confirmada.')
    } catch (e: any) {
      setActionError(e?.response?.data?.detail || 'Não foi possível confirmar a linha.')
    }
  }

  const openSwap = (line: ScheduleLine) => {
    setSwapOpenId(line.id)
    setSwapVehicle('')
    setSwapReason('')
    setActionError(null)
  }

  const handleCreateSwap = async (line: ScheduleLine) => {
    if (!swapVehicle.trim()) return
    setSwapSaving(true)
    setActionError(null)
    try {
      // 1. Confirmar a linha
      await pending.confirmLine(line.id)
      // 2. Registrar a troca
      await swapsList.createSwap({
        schedule_line_id: line.id,
        vehicle_out: line.prefix_code,
        vehicle_in: swapVehicle.trim(),
        reason: swapReason || undefined,
        lines_covered: `${line.direction} - ${line.line_code}`,
      } as any)
      setSwapOpenId(null)
      setSwapVehicle('')
      setSwapReason('')
      setActionMessage('Troca registrada! Copie o texto no painel lateral para enviar no WhatsApp.')
    } catch (e: any) {
      setActionError(e?.response?.data?.detail || 'Não foi possível registrar a troca.')
    } finally {
      setSwapSaving(false)
    }
  }

  const handleStatusChange = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!statusLine) return
    setActionError(null)
    try {
      await pending.cancelLine(statusLine.line.id, statusReason)
      await pending.refetch(pendingFilters, 0)
      setActionMessage('Linha cancelada.')
      setStatusLine(null)
      setStatusReason('')
    } catch (e: any) {
      setActionError(e?.response?.data?.detail || 'Não foi possível cancelar a linha.')
    }
  }

  const handleCopySwap = async (text: string, id: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      alert(text)
    }
  }

  const handleSendWhatsApp = async () => {
    try {
      const res = await pending.fetchWhatsappText(filters.schedule_date || '', filters.unit || '')
      await navigator.clipboard?.writeText(res.text)
      window.open(`https://wa.me/?text=${encodeURIComponent(res.text)}`, '_blank', 'noopener,noreferrer')
    } catch {
      alert('Erro ao gerar texto de confirmação.')
    }
  }

  const allConfirmed = !pending.loading && pending.lines.length === 0

  return (
    <Layout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Confirmação de Escala</h1>
          <p className="text-sm text-gray-500">Confirme as linhas e registre trocas. As trocas ficam no painel lateral para copiar e enviar no WhatsApp.</p>
        </div>

        {/* Filtros */}
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
              {(role === 'admin' ? ALL_UNITS : availableUnits).map(u => <option key={u} value={u}>{u}</option>)}
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
            Atualizar
          </button>
        </form>

        {/* Mensagens */}
        {actionMessage && (
          <div className="bg-green-50 border border-green-200 rounded px-3 py-2">
            <p className="text-green-700 text-sm">{actionMessage}</p>
          </div>
        )}
        {actionError && <p className="bg-red-50 text-red-700 border border-red-200 rounded px-3 py-2 text-sm">{actionError}</p>}

        {/* Banner todas confirmadas */}
        {allConfirmed && (
          <div className="bg-green-50 border border-green-300 rounded-lg px-4 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-green-800 font-semibold">Todas as linhas foram confirmadas!</p>
              <p className="text-green-700 text-sm">Envie o resumo de confirmação pelo WhatsApp.</p>
            </div>
            <button onClick={handleSendWhatsApp}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-green-700 whitespace-nowrap">
              Enviar por WhatsApp
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
          {/* Linhas pendentes */}
          <section className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b flex justify-between items-center">
              <div>
                <h2 className="font-semibold text-gray-800">Linhas pendentes</h2>
                <p className="text-xs text-gray-500">
                  {autoMode ? 'Iniciando nos próximos 40 min.' : 'Todas as pendentes da unidade.'}
                </p>
              </div>
              <span className="text-sm font-semibold text-yellow-700">{pending.total} pendentes</span>
            </div>
            <div className="p-3 grid gap-3">
              {pending.loading && <p className="text-sm text-gray-500">Carregando linhas...</p>}
              {pending.error && <p className="text-sm text-red-600">{pending.error}</p>}
              {pending.lines.length === 0 && !pending.loading && (
                <p className="text-sm text-gray-400 text-center py-8">
                  {autoMode ? 'Nenhuma linha iniciando nos próximos 40 min.' : 'Nenhuma linha pendente.'}
                </p>
              )}
              {pending.lines.map(line => (
                <article key={line.id} className="border rounded-lg p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded text-sm font-semibold">{line.start_time} – {line.end_time}</span>
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">{line.direction}</span>
                    <span className="font-mono text-sm font-bold">Linha {line.line_code}</span>
                  </div>
                  <p className="font-semibold text-gray-800">{line.client_name} · Prefixo {line.prefix_code}</p>
                  <p className="text-sm text-gray-500">{line.route_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Motorista: {line.driver_name}</p>

                  {/* Botões de ação */}
                  {swapOpenId !== line.id ? (
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => handleConfirm(line.id)}
                        className="flex-1 bg-green-700 text-white px-4 py-2.5 rounded text-sm font-semibold hover:bg-green-800">
                        Confirmar linha
                      </button>
                      <button onClick={() => openSwap(line)}
                        className="flex-1 border border-brand-600 text-brand-700 px-4 py-2.5 rounded text-sm font-semibold hover:bg-brand-50">
                        Trocar
                      </button>
                      {canManageLines && (
                        <button onClick={() => setStatusLine({ line, action: 'cancel' })}
                          className="border border-red-200 text-red-600 px-3 py-2.5 rounded text-sm hover:bg-red-50">
                          Cancelar
                        </button>
                      )}
                    </div>
                  ) : (
                    // Formulário de troca inline
                    <div className="mt-3 bg-brand-50 border border-brand-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-semibold text-brand-700">Prefixo substituto</p>
                      <div className="flex gap-2">
                        <input
                          autoFocus
                          value={swapVehicle}
                          onChange={e => setSwapVehicle(e.target.value)}
                          placeholder="Ex: 4521"
                          className="flex-1 border rounded px-3 py-2 text-sm"
                        />
                        <button
                          onClick={() => handleCreateSwap(line)}
                          disabled={swapSaving || !swapVehicle.trim()}
                          className="bg-brand-700 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-brand-800 disabled:opacity-50 whitespace-nowrap"
                        >
                          {swapSaving ? 'Salvando...' : 'Salvar troca'}
                        </button>
                        <button onClick={() => setSwapOpenId(null)}
                          className="border px-3 py-2 rounded text-sm text-gray-600 hover:bg-gray-50">
                          ✕
                        </button>
                      </div>
                      <input
                        value={swapReason}
                        onChange={e => setSwapReason(e.target.value)}
                        placeholder="Motivo (opcional)"
                        className="w-full border rounded px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>

          {/* Painel lateral de trocas */}
          <aside className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b">
              <h2 className="font-semibold text-gray-800">Trocas registradas</h2>
              <p className="text-xs text-gray-500">Copie o texto e envie no WhatsApp.</p>
            </div>
            <div className="p-3 space-y-2">
              {swapsList.loading && <p className="text-sm text-gray-400 py-4 text-center">Carregando...</p>}
              {!swapsList.loading && swapsList.swaps.length === 0 && (
                <p className="text-sm text-gray-400 py-6 text-center">Nenhuma troca registrada.</p>
              )}
              {swapsList.swaps.map(swap => (
                <div key={swap.id} className="border border-brand-100 bg-brand-50 rounded p-3">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <div>
                      <p className="text-sm font-semibold text-brand-800">
                        {swap.vehicle_out} → {swap.vehicle_in}
                      </p>
                      {swap.lines_covered && <p className="text-xs text-brand-600">{swap.lines_covered}</p>}
                      {swap.reason && <p className="text-xs text-gray-500 mt-0.5">{swap.reason}</p>}
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(swap.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  {swap.whatsapp_text && (
                    <button
                      onClick={() => handleCopySwap(swap.whatsapp_text!, swap.id)}
                      className={`mt-2 w-full px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                        copiedId === swap.id
                          ? 'bg-green-600 text-white'
                          : 'bg-brand-700 text-white hover:bg-brand-800'
                      }`}
                    >
                      {copiedId === swap.id ? '✓ Copiado!' : 'Copiar texto WhatsApp'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </aside>
        </div>

        {/* Modal cancelar linha */}
        {statusLine && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <form onSubmit={handleStatusChange} className="bg-white rounded-lg shadow-xl p-5 w-full max-w-md">
              <h2 className="text-lg font-semibold text-gray-800 mb-1">Cancelar linha</h2>
              <p className="text-sm text-gray-500 mb-4">
                Linha {statusLine.line.line_code} · Prefixo {statusLine.line.prefix_code}
              </p>
              <label className="block text-sm text-gray-600 mb-4">
                Motivo
                <input value={statusReason} onChange={e => setStatusReason(e.target.value)}
                  className="mt-1 w-full border rounded px-3 py-2" placeholder="Informe o motivo" />
              </label>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setStatusLine(null)} className="border px-4 py-2 rounded text-sm">Voltar</button>
                <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded text-sm">Cancelar linha</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </Layout>
  )
}
